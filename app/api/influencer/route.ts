import { InfluencerLimitError, addInfluencer, getInfluencers } from "@/lib/influencers";
import { CODE_RE, FOLLOWERS, INFLUENCER_MARKETING_TEXT, PLATFORMS, normalizeCode } from "@/lib/influencer-rules";
import { mailReady, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bad = (error: string, fields: string[] = [], status = 400) => Response.json({ error, fields }, { status });

/** Influencer-Bewerbung: wird gespeichert (Dashboard → Influencer) und per E-Mail an den Shop und die Bewerber:in bestätigt */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 50_000) return bad("Anfrage zu groß.", [], 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Ungültige Anfrage");
  }
  const body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  if (text(body.website, 50)) return Response.json({ ok: true });
  const on = (v?: string) => v === "on" || v === "true";

  const channelUrl = text(body.channelUrl, 300);
  const d = {
    name: text(body.name, 100),
    alias: text(body.alias, 80),
    email: text(body.email, 200).toLowerCase(),
    phone: text(body.phone, 40),
    platform: text(body.platform, 30),
    followers: text(body.followers, 40),
    channelUrl,
    wishCode: normalizeCode(text(body.wishCode, 40)),
    street: text(body.street, 120),
    zip: text(body.zip, 10),
    city: text(body.city, 80),
    message: text(body.message, 1500),
    smallBusiness: on(body.smallBusiness),
    taxNo: "",
    vatId: "",
  };
  const missing = (["name", "alias", "email", "platform", "followers", "channelUrl", "wishCode", "street", "zip", "city"] as const).filter((k) => !d[k]);
  if (missing.length) return bad("Bitte fülle alle Pflichtfelder aus.", missing);
  if (!EMAIL.test(d.email)) return bad("Das sieht nicht wie eine E-Mail-Adresse aus.", ["email"]);
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(channelUrl)) return bad("Bitte gib den vollständigen Link zu deinem Kanal an (mit https://).", ["channelUrl"]);
  if (!CODE_RE.test(d.wishCode)) return bad("Der Wunsch-Code braucht 3–20 Zeichen (nur Buchstaben und Zahlen).", ["wishCode"]);
  if (!/^\d{4,5}$/.test(d.zip)) return bad("Bitte gib eine gültige Postleitzahl an.", ["zip"]);
  if (!(PLATFORMS as readonly string[]).includes(d.platform) || !(FOLLOWERS as readonly string[]).includes(d.followers)) return bad("Ungültige Auswahl.");
  if (!on(body.consent)) return bad("Bitte stimme der Datenschutzerklärung zu.", ["consent"]);

  let duplicate = false;
  let codeTaken = false;
  try {
    codeTaken = (await getInfluencers()).some((i) => i.code === d.wishCode);
    ({ duplicate } = await addInfluencer({ ...d, ...(on(body.marketing) ? { marketing: { granted: true, at: new Date().toISOString(), text: INFLUENCER_MARKETING_TEXT } } : {}) }));
  } catch (e) {
    if (e instanceof StoreUnavailableError) return bad("Die Bewerbung ist gerade nicht möglich. Bitte schreib uns kurz per E-Mail.", [], 503);
    if (e instanceof InfluencerLimitError) return bad("Gerade nicht möglich – bitte später erneut versuchen.", [], 503);
    console.error("[influencer] Speichern fehlgeschlagen", e);
    return bad("Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.", [], 503);
  }

  if (!duplicate && mailReady()) {
    const settings = await getSettings();
    const rows: [string, string][] = [
      ["Name", d.name], ["Kanalname", d.alias], ["E-Mail", d.email], ["Telefon", d.phone || "–"], ["Plattform", d.platform], ["Follower", d.followers],
      ["Kanal", d.channelUrl], ["Wunsch-Code", `${d.wishCode}${codeTaken ? " (schon vergeben)" : ""}`], ["Adresse", `${d.street}, ${d.zip} ${d.city}`],
      ["Kleinunternehmer", d.smallBusiness ? "ja" : "nein"], ["Nachricht", d.message || "–"],
    ];
    const to = settings.company.email;
    if (to && !to.startsWith("[")) {
      await sendMail({
        to: { email: to },
        replyTo: d.email,
        subject: `Neue Influencer-Bewerbung: ${d.alias}`,
        html: `<h2>Neue Influencer-Bewerbung</h2><table cellpadding="6">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p>Freischalten im Dashboard unter „Influencer“.</p>`,
        text: `Neue Influencer-Bewerbung\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nFreischalten im Dashboard unter „Influencer“.`,
        tag: "influencer-anfrage",
      }).catch((e) => console.error("[influencer] Benachrichtigung fehlgeschlagen", e));
    }
    await sendMail({
      to: { email: d.email, name: d.name },
      subject: "Deine Bewerbung als EXSTASE-Partner",
      html: `<p>Hallo ${esc(d.name)},</p><p>danke für deine Bewerbung mit <b>${esc(d.alias)}</b>. Wir schauen uns deinen Kanal an und melden uns – sobald du freigeschaltet bist, bekommst du den Link zu deinem Dashboard.</p><p>Dein EXSTASE-Team</p>`,
      text: `Hallo ${d.name},\n\ndanke für deine Bewerbung mit ${d.alias}. Wir schauen uns deinen Kanal an und melden uns – sobald du freigeschaltet bist, bekommst du den Link zu deinem Dashboard.\n\nDein EXSTASE-Team`,
      tag: "influencer-bestaetigung",
    }).catch((e) => console.error("[influencer] Bestätigung fehlgeschlagen", e));
  }
  return Response.json({ ok: true });
}
