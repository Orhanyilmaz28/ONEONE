import { promises as fs } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

/**
 * E-Mail-Versand über Brevo, Resend oder ein eigenes Postfach per SMTP (z. B. Strato) – je nachdem, was in Vercel eingetragen ist.
 *
 * Umgebungsvariablen:
 * - BREVO_API_KEY  oder  RESEND_API_KEY  oder  SMTP_HOST + SMTP_USER + SMTP_PASS (+ SMTP_PORT, Standard 465)
 * - MAIL_FROM      Absender, z. B. "EXSTASE <hello@exstaseshop.com>" (bei SMTP: Standard ist SMTP_USER)
 * - MAIL_REPLY_TO  optional: Antworten gehen dorthin (Standard: E-Mail aus den Firmendaten)
 *
 * Ohne Schlüssel (lokal): E-Mails landen als HTML-Datei in .data/outbox – zum Ansehen statt Versenden.
 */

export type MailProvider = "brevo" | "resend" | "smtp" | "outbox" | "none";

/** Brevo-Schlüssel ohne versehentlich mitkopierte Leerzeichen oder Anführungszeichen */
function brevoKey() {
  return (process.env.BREVO_API_KEY ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

/** Eingabe aus Vercel ohne versehentlich mitkopierte Leerzeichen oder Anführungszeichen */
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

/** SMTP-Zugang (eigenes Postfach, z. B. Strato: smtp.strato.de, Port 465, Benutzer = komplette E-Mail-Adresse) */
export function smtpConfig() {
  const host = clean(process.env.SMTP_HOST);
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS);
  if (!host || !user || !pass) return null;
  const port = Number(clean(process.env.SMTP_PORT)) || 465;
  return { host, port, user, pass };
}

export function mailProvider(): MailProvider {
  if (brevoKey()) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  if (smtpConfig()) return "smtp";
  if (!process.env.VERCEL) return "outbox";
  return "none";
}

/** true, wenn echte E-Mails verschickt werden (oder lokal im Ausgangsordner landen) */
export function mailReady() {
  const p = mailProvider();
  return p === "outbox" || ((p === "brevo" || p === "resend" || p === "smtp") && Boolean(parseFrom()));
}

/** "EXSTASE <hello@exstase.com>" → { name, email } */
export function parseFrom(raw = process.env.MAIL_FROM || smtpConfig()?.user || ""): { name: string; email: string } | null {
  const s = raw.trim().replace(/^'|'$/g, "");
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
    if (provider === "smtp") {
      const cfg = smtpConfig();
      if (!cfg || !parseFrom()) return { ok: false, error: "SMTP-Zugang unvollständig (SMTP_HOST, SMTP_USER, SMTP_PASS)." };
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      try {
        await transport.sendMail({
          from: { name: from.name, address: from.email },
          to: mail.to.name ? { name: mail.to.name.replace(/[<>"]/g, ""), address: mail.to.email } : mail.to.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          ...(replyTo ? { replyTo } : {}),
        });
      } catch (error) {
        return { ok: false, error: smtpError(error) };
      } finally {
        transport.close();
      }
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
    return { ok: false, error: "E-Mail-Versand ist noch nicht eingerichtet (SMTP-Zugang oder BREVO_API_KEY fehlt)." };
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
/** Verständliche Meldung für das Dashboard (ohne Passwort) */
export function smtpError(error: unknown) {
  const e = error as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) return "SMTP-Anmeldung abgelehnt – SMTP_USER (komplette E-Mail-Adresse) und SMTP_PASS (Passwort des Postfachs) prüfen.";
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "EDNS") return `SMTP-Server nicht erreichbar – SMTP_HOST und SMTP_PORT prüfen (z. B. smtp.strato.de und 465).`;
  if (e.code === "EENVELOPE" || e.responseCode === 550 || e.responseCode === 553) return "Absender oder Empfänger abgelehnt – MAIL_FROM muss die Adresse des Postfachs (oder ein Alias davon) sein.";
  return `SMTP-Fehler: ${(e.message ?? "unbekannt").replace(/\s+/g, " ").slice(0, 200)}`;
}

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
