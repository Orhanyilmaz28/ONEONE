import { BRANCHES, DealerLimitError, VOLUMES, addDealer } from "@/lib/dealer-store";
import { mailReady, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Händler-Registrierung (Anfrage). Wird gespeichert (Dashboard → Händler) und – wenn der E-Mail-Versand eingerichtet ist –
 * per E-Mail an den Shop und als Eingangsbestätigung an die Anfragenden geschickt.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 8000) return Response.json({ error: "Ungültige Anfrage" }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  // Spam-Schutz: verstecktes Feld ausgefüllt → so tun, als hätte es geklappt
  if (text(body.website, 50)) return Response.json({ ok: true });

  const d = {
    company: text(body.company, 120),
    contact: text(body.contact, 100),
    email: text(body.email, 200).toLowerCase(),
    phone: text(body.phone, 40),
    street: text(body.street, 120),
    zip: text(body.zip, 10),
    city: text(body.city, 80),
    vatId: text(body.vatId, 30).toUpperCase(),
    branch: text(body.branch, 60),
    volume: text(body.volume, 60),
    message: text(body.message, 1500),
  };
  const missing = (["company", "contact", "email", "street", "zip", "city", "branch", "volume"] as const).filter((k) => !d[k]);
  if (missing.length) return Response.json({ error: "Bitte fülle alle Pflichtfelder aus.", fields: missing }, { status: 400 });
  if (!EMAIL.test(d.email)) return Response.json({ error: "Das sieht nicht wie eine E-Mail-Adresse aus.", fields: ["email"] }, { status: 400 });
  if (!/^\d{4,5}$/.test(d.zip)) return Response.json({ error: "Bitte gib eine gültige Postleitzahl an.", fields: ["zip"] }, { status: 400 });
  if (!(BRANCHES as readonly string[]).includes(d.branch) || !(VOLUMES as readonly string[]).includes(d.volume)) return Response.json({ error: "Ungültige Auswahl." }, { status: 400 });
  if (body.consent !== true) return Response.json({ error: "Bitte stimme der Datenschutzerklärung zu.", fields: ["consent"] }, { status: 400 });

  let duplicate = false;
  try {
    ({ duplicate } = await addDealer(d));
  } catch (e) {
    if (e instanceof StoreUnavailableError) {
      // Ohne Datenspeicher geht die Anfrage nur per E-Mail – sonst ehrlich ablehnen
      if (!mailReady()) return Response.json({ error: "Die Registrierung ist gerade nicht möglich. Bitte schreib uns kurz per E-Mail." }, { status: 503 });
    } else if (e instanceof DealerLimitError) {
      console.error("[haendler]", e.message);
      return Response.json({ error: "Gerade nicht möglich – bitte später erneut versuchen." }, { status: 503 });
    } else {
      console.error("[haendler] Speichern fehlgeschlagen", e);
      return Response.json({ error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." }, { status: 503 });
    }
  }

  if (!duplicate && mailReady()) {
    const settings = await getSettings();
    const rows: [string, string][] = [
      ["Firma", d.company], ["Ansprechperson", d.contact], ["E-Mail", d.email], ["Telefon", d.phone || "–"],
      ["Adresse", `${d.street}, ${d.zip} ${d.city}`], ["USt-IdNr.", d.vatId || "–"], ["Branche", d.branch], ["Menge", d.volume], ["Nachricht", d.message || "–"],
    ];
    const to = settings.company.email;
    if (to && !to.startsWith("[")) {
      await sendMail({
        to: { email: to },
        replyTo: d.email,
        subject: `Neue Händler-Anfrage: ${d.company}`,
        html: `<h2>Neue Händler-Anfrage</h2><table cellpadding="6">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p>Freigeben oder ablehnen im Dashboard unter „Händler“.</p>`,
        text: `Neue Händler-Anfrage\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nFreigeben oder ablehnen im Dashboard unter „Händler“.`,
        tag: "haendler-anfrage",
      }).catch((e) => console.error("[haendler] Benachrichtigung fehlgeschlagen", e));
    }
    await sendMail({
      to: { email: d.email, name: d.contact },
      subject: "Deine Händler-Anfrage bei EXSTASE",
      html: `<p>Hallo ${esc(d.contact)},</p><p>danke für deine Anfrage für <b>${esc(d.company)}</b>. Wir prüfen sie und melden uns mit deinem Händlerzugang und den Preisen.</p><p>Dein EXSTASE-Team</p>`,
      text: `Hallo ${d.contact},\n\ndanke für deine Anfrage für ${d.company}. Wir prüfen sie und melden uns mit deinem Händlerzugang und den Preisen.\n\nDein EXSTASE-Team`,
      tag: "haendler-bestaetigung",
    }).catch((e) => console.error("[haendler] Bestätigung fehlgeschlagen", e));
  }
  return Response.json({ ok: true });
}
