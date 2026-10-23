"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { sendMail } from "@/lib/mail";
import { getRetryMail, markResent } from "@/lib/mail-log";
import { renderPreview } from "@/lib/mail-previews";
import { type MailSettings, getMailSettings } from "@/lib/mail-settings";
import { MAIL_TYPES } from "@/lib/mail-types";
import { getSettings } from "@/lib/settings";
import { KEYS, StoreUnavailableError, setJSON } from "@/lib/store";

export type MailFormState = { ok?: boolean; message?: string; error?: string; at?: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());
const LOGIN = "Du bist nicht mehr angemeldet. Bitte lade die Seite neu.";

/** Schalter und Benachrichtigungs-Adresse speichern */
export async function saveMailSettings(_prev: MailFormState, form: FormData): Promise<MailFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: LOGIN };
  }
  const adminEmail = String(form.get("adminEmail") ?? "").trim().slice(0, 200);
  if (adminEmail && !EMAIL.test(adminEmail)) return { error: "Die Adresse für Benachrichtigungen sieht nicht richtig aus." };
  const on = (tag: string) => form.get(`on:${tag}`) === "1";
  const special = new Set(["bestellung", "neue-bestellung", "versand"]);
  const next: MailSettings = {
    orderConfirmation: on("bestellung"),
    adminNotify: on("neue-bestellung"),
    shippingNotice: on("versand"),
    adminEmail,
    off: MAIL_TYPES.filter((t) => t.switchable && !special.has(t.tag) && !on(t.tag)).map((t) => t.tag),
  };
  try {
    await setJSON(KEYS.mail, next);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    return { error: "Speichern hat nicht geklappt. Bitte versuche es noch einmal." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Gespeichert.", at: Date.now() };
}

async function adminAddress() {
  const [settings, mail] = await Promise.all([getSettings(), getMailSettings()]);
  const to = mail.adminEmail.trim() || (isPlaceholder(settings.company.email) ? "" : settings.company.email.trim());
  return { settings, to };
}

function sentMessage(provider: string, to: string) {
  return provider === "outbox" ? `Liegt im lokalen Ordner .data/outbox (an ${to}).` : `Ist an ${to} unterwegs – schau in dein Postfach (auch im Spam-Ordner).`;
}

/** Test-E-Mail an die eigene Adresse */
export async function sendTestMail(): Promise<MailFormState> {
  return sendPreviewTest("test");
}

/** Eine Vorlage mit Beispieldaten an die eigene Adresse schicken */
export async function sendPreviewTest(tag: string): Promise<MailFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: LOGIN };
  }
  const { settings, to } = await adminAddress();
  if (!to) return { error: "Trag zuerst eine Adresse für Benachrichtigungen ein (oder die E-Mail in den Firmendaten)." };
  const mail = renderPreview(tag, settings);
  if (!mail) return { error: "Für diese E-Mail gibt es keine Vorschau." };
  // Kurzname „test“: Beispiel-Mails sollen nie an einem ausgeschalteten Schalter hängen bleiben
  const subject = tag === "test" ? mail.subject : `[Beispiel] ${mail.subject}`;
  const res = await sendMail({ to: { email: to }, ...mail, subject, tag: "test" });
  if (!res.ok) return { error: `Nicht verschickt: ${res.error}` };
  return { ok: true, message: sentMessage(res.provider, to), at: Date.now() };
}

/** Fehlgeschlagene E-Mail aus dem Protokoll nochmal verschicken */
export async function resendMail(id: string): Promise<MailFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: LOGIN };
  }
  const mail = await getRetryMail(id);
  if (!mail) return { error: "Der Inhalt ist nicht mehr da (nach 7 Tagen gelöscht oder schon verschickt)." };
  const { attachments, ...rest } = mail;
  const res = await sendMail({ ...rest, ...(attachments?.length ? { attachments: attachments.map((a) => ({ ...a, content: Buffer.from(a.content, "base64") })) } : {}) });
  if (!res.ok) return { error: `Wieder nicht geklappt: ${res.error}` };
  await markResent(id).catch(() => undefined);
  revalidatePath("/admin/emails", "layout");
  return { ok: true, message: `Verschickt an ${mail.to.email}.`, at: Date.now() };
}
