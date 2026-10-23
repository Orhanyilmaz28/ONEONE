import { mailTypeOf } from "./mail-types";
import { KEYS, getJSON } from "./store";

/** Welche E-Mails der Shop selbst verschickt (Dashboard → E-Mails) */
export type MailSettings = {
  /** Bestellbestätigung an Kund:innen */
  orderConfirmation: boolean;
  /** Info an dich bei jeder neuen Bestellung */
  adminNotify: boolean;
  /** Versand-E-Mail beim Status „Versendet“ automatisch mitschicken (Häkchen vorausgewählt) */
  shippingNotice: boolean;
  /** Adresse für Shop-Benachrichtigungen (leer = E-Mail aus den Firmendaten) */
  adminEmail: string;
  /** Weitere ausgeschaltete E-Mails (Kurznamen aus lib/mail-types.ts) */
  off: string[];
};

export const DEFAULT_MAIL_SETTINGS: MailSettings = { orderConfirmation: true, adminNotify: true, shippingNotice: true, adminEmail: "", off: [] };

export async function getMailSettings(): Promise<MailSettings> {
  const s = await getJSON<Partial<MailSettings>>(KEYS.mail, {});
  return {
    orderConfirmation: s.orderConfirmation !== false,
    adminNotify: s.adminNotify !== false,
    shippingNotice: s.shippingNotice !== false,
    adminEmail: typeof s.adminEmail === "string" ? s.adminEmail : "",
    off: Array.isArray(s.off) ? s.off.filter((t): t is string => typeof t === "string") : [],
  };
}

/** Ist diese E-Mail eingeschaltet? Die drei alten Schalter haben eigene Felder, alle anderen stehen in `off`. */
export function mailEnabledIn(settings: MailSettings, tag: string): boolean {
  const type = mailTypeOf(tag);
  if (!type?.switchable) return true;
  if (type.tag === "bestellung") return settings.orderConfirmation;
  if (type.tag === "neue-bestellung") return settings.adminNotify;
  // Versand-Mail: der Schalter setzt nur das Häkchen vor – wer es anhakt, verschickt die Mail
  if (type.tag === "versand") return true;
  return !settings.off.includes(type.tag);
}

/** Für sendMail(): bei Lesefehlern gilt „an“ (lieber eine Mail zu viel als eine wichtige zu wenig) */
export async function isMailEnabled(tag: string | undefined): Promise<boolean> {
  if (!tag || !mailTypeOf(tag)?.switchable) return true;
  return mailEnabledIn(await getMailSettings(), tag);
}
