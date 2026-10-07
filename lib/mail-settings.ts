import { KEYS, getJSON } from "./store";

/** Welche E-Mails der Shop selbst verschickt (Dashboard → Einstellungen → E-Mails) */
export type MailSettings = {
  /** Bestellbestätigung an Kund:innen */
  orderConfirmation: boolean;
  /** Info an dich bei jeder neuen Bestellung */
  adminNotify: boolean;
  /** Versand-E-Mail beim Status „Versendet“ automatisch mitschicken (Häkchen vorausgewählt) */
  shippingNotice: boolean;
  /** Adresse für Shop-Benachrichtigungen (leer = E-Mail aus den Firmendaten) */
  adminEmail: string;
};

export const DEFAULT_MAIL_SETTINGS: MailSettings = { orderConfirmation: true, adminNotify: true, shippingNotice: true, adminEmail: "" };

export async function getMailSettings(): Promise<MailSettings> {
  const s = await getJSON<Partial<MailSettings>>(KEYS.mail, {});
  return {
    orderConfirmation: s.orderConfirmation !== false,
    adminNotify: s.adminNotify !== false,
    shippingNotice: s.shippingNotice !== false,
    adminEmail: typeof s.adminEmail === "string" ? s.adminEmail : "",
  };
}
