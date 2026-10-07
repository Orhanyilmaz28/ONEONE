import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * E-Mail-Versand über Brevo (empfohlen, Server in der EU) oder Resend – je nachdem, welcher Schlüssel in Vercel eingetragen ist.
 *
 * Umgebungsvariablen:
 * - BREVO_API_KEY  oder  RESEND_API_KEY
 * - MAIL_FROM      Absender, z. B. "EXSTASE <hello@exstase.com>" (Domain muss beim Anbieter bestätigt sein)
 * - MAIL_REPLY_TO  optional: Antworten gehen dorthin (Standard: E-Mail aus den Firmendaten)
 *
 * Ohne Schlüssel (lokal): E-Mails landen als HTML-Datei in .data/outbox – zum Ansehen statt Versenden.
 */

export type MailProvider = "brevo" | "resend" | "outbox" | "none";

/** Brevo-Schlüssel ohne versehentlich mitkopierte Leerzeichen oder Anführungszeichen */
function brevoKey() {
  return (process.env.BREVO_API_KEY ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function mailProvider(): MailProvider {
  if (brevoKey()) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  if (!process.env.VERCEL) return "outbox";
  return "none";
}

/** true, wenn echte E-Mails verschickt werden (oder lokal im Ausgangsordner landen) */
export function mailReady() {
  const p = mailProvider();
  return p === "outbox" || ((p === "brevo" || p === "resend") && Boolean(parseFrom()));
}

/** "EXSTASE <hello@exstase.com>" → { name, email } */
export function parseFrom(raw = process.env.MAIL_FROM ?? ""): { name: string; email: string } | null {
  const s = raw.trim();
  const m = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(s);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || "EXSTASE", email: m[2] };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { name: "EXSTASE", email: s };
  return null;
}

export type Mail = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Kurzer Name für das Protokoll, z. B. "bestellung" */
  tag?: string;
};

export type MailResult = { ok: true; provider: MailProvider } | { ok: false; error: string };

const OUTBOX = path.join(process.cwd(), ".data", "outbox");

export async function sendMail(mail: Mail): Promise<MailResult> {
  const provider = mailProvider();
  const from = parseFrom() ?? { name: "EXSTASE", email: "shop@localhost" };
  const replyTo = (mail.replyTo ?? process.env.MAIL_REPLY_TO ?? "").trim() || undefined;
  try {
    if (provider === "brevo") {
      if (!parseFrom()) return { ok: false, error: "MAIL_FROM fehlt (Absender-Adresse)." };
      if (brevoKey().startsWith("xsmtpsib-")) {
        return { ok: false, error: "In BREVO_API_KEY steht der SMTP-Schlüssel (beginnt mit „xsmtpsib-“). Gebraucht wird der API-Schlüssel – er beginnt mit „xkeysib-“ (Brevo → SMTP & API → Reiter „API-Schlüssel“)." };
      }
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey(), "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: from,
          to: [{ email: mail.to.email, ...(mail.to.name ? { name: mail.to.name } : {}) }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
          ...(mail.tag ? { tags: [mail.tag] } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: brevoError(res.status, await res.text().catch(() => "")) };
      return { ok: true, provider };
    }
    if (provider === "resend") {
      if (!parseFrom()) return { ok: false, error: "MAIL_FROM fehlt (Absender-Adresse)." };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: `${from.name} <${from.email}>`,
          to: [mail.to.name ? `${mail.to.name.replace(/[<>"]/g, "")} <${mail.to.email}>` : mail.to.email],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      return { ok: true, provider };
    }
    if (provider === "outbox") {
      await fs.mkdir(OUTBOX, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${(mail.tag ?? "mail").replace(/[^a-z0-9-]/gi, "")}`;
      const head = `<!-- An: ${mail.to.email} | Betreff: ${mail.subject.replace(/--/g, "–")} -->\n`;
      await fs.writeFile(path.join(OUTBOX, `${name}.html`), head + mail.html);
      await fs.writeFile(path.join(OUTBOX, `${name}.txt`), `An: ${mail.to.email}\nBetreff: ${mail.subject}\n\n${mail.text}`);
      return { ok: true, provider };
    }
    return { ok: false, error: "E-Mail-Versand ist noch nicht eingerichtet (BREVO_API_KEY und MAIL_FROM fehlen)." };
  } catch (error) {
    console.error("[mail] Versand fehlgeschlagen", error);
    return { ok: false, error: "Der E-Mail-Dienst ist gerade nicht erreichbar." };
  }
}

/* ───────── Newsletter-Liste bei Brevo (optional) ───────── */

/** Bestätigte Newsletter-Adresse in die Brevo-Liste BREVO_LIST_ID eintragen */
export async function addToNewsletterList(email: string): Promise<boolean> {
  const list = Number(process.env.BREVO_LIST_ID);
  if (!brevoKey() || !Number.isInteger(list) || list <= 0) return false;
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": brevoKey(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, listIds: [list], updateEnabled: true }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) console.error("[mail] Brevo-Liste: Eintragen fehlgeschlagen", res?.status);
  return Boolean(res?.ok);
}

/** Adresse aus der Brevo-Liste entfernen (Abmeldung im Shop) */
export async function removeFromNewsletterList(email: string): Promise<void> {
  const list = Number(process.env.BREVO_LIST_ID);
  if (!brevoKey() || !Number.isInteger(list) || list <= 0) return;
  await fetch(`https://api.brevo.com/v3/contacts/lists/${list}/contacts/remove`, {
    method: "POST",
    headers: { "api-key": brevoKey(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ emails: [email] }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}

/** Brevo-Fehler verständlich übersetzen */
function brevoError(status: number, body: string) {
  const raw = body.slice(0, 200);
  if (status === 401 && /ip address|unrecogni[sz]ed ip/i.test(body)) {
    return "Brevo blockiert unbekannte Server. In Brevo → Sicherheit → Autorisierte IPs die IP-Sperre ausschalten (Vercel hat wechselnde Adressen).";
  }
  if (status === 401) {
    return "Brevo kennt diesen API-Schlüssel nicht. In Vercel bei BREVO_API_KEY den API-Schlüssel (beginnt mit „xkeysib-“) neu einfügen und neu bereitstellen (Redeploy).";
  }
  if (status === 400 && /sender/i.test(body)) {
    return "Brevo akzeptiert den Absender nicht. Die Adresse aus MAIL_FROM muss in Brevo unter „Absender“ angelegt und bestätigt sein.";
  }
  return `Brevo ${status}: ${raw}`;
}
