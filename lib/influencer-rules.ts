/** Regeln für das Influencer-Programm – ohne Server-Abhängigkeiten, auch im Browser nutzbar */

export const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitch", "Snapchat", "Sonstiges"] as const;
export const FOLLOWERS = ["unter 5.000", "5.000–20.000", "20.000–100.000", "100.000–500.000", "über 500.000"] as const;

/** Standard: Rabatt für die Zuschauer und Provision für den Influencer (je Influencer im Dashboard änderbar) */
export const DEFAULT_DISCOUNT_PCT = 10;
export const DEFAULT_COMMISSION_PCT = 10;
export const MAX_PCT = 50;

/** Codes: nur A–Z und 0–9, 3–20 Zeichen, Groß-/Kleinschreibung egal */
export const CODE_RE = /^[A-Z0-9]{3,20}$/;
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

/** Umsatzsteuer, die im Shop-Preis steckt (für den Netto-Warenwert der Provision) */
export const SHOP_VAT = 19;

export const INFLUENCER_MARKETING_TEXT =
  "Ja, EXSTASE darf mir Angebote, Aktionen und Neuigkeiten per E-Mail senden. Die Einwilligung ist freiwillig und jederzeit im Influencer-Bereich (Konto) oder per E-Mail widerrufbar.";

/** IBAN grob prüfen (Länge, Prüfziffer nach ISO 13616) */
export function validIban(raw: string) {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}
export const formatIban = (raw: string) => raw.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
