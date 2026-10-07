import { randomBytes } from "node:crypto";
import { BRANCHES, DealerLimitError, VOLUMES, addDealer } from "@/lib/dealer-store";
import { mailReady, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError, deleteBinary, putBinary } from "@/lib/store";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Händler-Registrierung (Anfrage). Wird gespeichert (Dashboard → Händler) und – wenn der E-Mail-Versand eingerichtet ist –
 * per E-Mail an den Shop und als Eingangsbestätigung an die Anfragenden geschickt.
 */
const MAX_PROOF = 5 * 1024 * 1024;

/** Dateityp an den ersten Bytes erkennen (nicht dem Namen oder Browser vertrauen) */
function sniff(buf: Buffer): { type: string; ext: string } | null {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return { type: "application/pdf", ext: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  return null;
}

/**
 * Händler-Registrierung (Anfrage) mit Gewerbenachweis (PDF, JPG oder PNG bis 5 MB).
 * Wird gespeichert (Dashboard → Händler) und – wenn der E-Mail-Versand eingerichtet ist –
 * per E-Mail an den Shop und als Eingangsbestätigung an die Anfragenden geschickt.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PROOF + 100_000) return Response.json({ error: "Die Datei ist zu groß (höchstens 5 MB)." }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const body: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  body.consent = body.consent === "on" || body.consent === "true";
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

  // Gewerbenachweis prüfen
  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Bitte lade deinen Gewerbenachweis hoch.", fields: ["proof"] }, { status: 400 });
  if (file.size > MAX_PROOF) return Response.json({ error: "Die Datei ist zu groß (höchstens 5 MB).", fields: ["proof"] }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return Response.json({ error: "Bitte lade den Nachweis als PDF, JPG oder PNG hoch.", fields: ["proof"] }, { status: 400 });

  const id = randomBytes(8).toString("hex");
  const proofId = `proof-${id}`;
  let duplicate = false;
  try {
    await putBinary(proofId, buf);
    const safeName = `${file.name.replace(/[^\w.\- äöüÄÖÜß]/g, "_").slice(0, 80) || "nachweis"}`.replace(/\.[a-z0-9]{1,5}$/i, "") + `.${kind.ext}`;
    ({ duplicate } = await addDealer({ ...d, proof: { id: proofId, name: safeName, type: kind.type, size: buf.length } }, id));
    if (duplicate) await deleteBinary([proofId]).catch(() => undefined);
  } catch (e) {
    await deleteBinary([proofId]).catch(() => undefined);
    if (e instanceof StoreUnavailableError) {
      // Ohne Datenspeicher kann der Nachweis nicht gesichert werden – ehrlich ablehnen
      return Response.json({ error: "Die Registrierung ist gerade nicht möglich. Bitte schreib uns kurz per E-Mail." }, { status: 503 });
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
