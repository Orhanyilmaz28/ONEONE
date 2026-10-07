"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { sendMail } from "@/lib/mail";
import { type MailSettings, getMailSettings } from "@/lib/mail-settings";
import { testMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { KEYS, StoreUnavailableError, setJSON } from "@/lib/store";

export type MailFormState = { ok?: boolean; message?: string; error?: string; at?: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

export async function saveMailSettings(_prev: MailFormState, form: FormData): Promise<MailFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu." };
  }
  const adminEmail = String(form.get("adminEmail") ?? "").trim().slice(0, 200);
  if (adminEmail && !EMAIL.test(adminEmail)) return { error: "Die Adresse für Benachrichtigungen sieht nicht richtig aus." };
  const next: MailSettings = {
    orderConfirmation: form.get("orderConfirmation") === "1",
    adminNotify: form.get("adminNotify") === "1",
    shippingNotice: form.get("shippingNotice") === "1",
    adminEmail,
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

export async function sendTestMail(): Promise<MailFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu." };
  }
  const [settings, mail] = await Promise.all([getSettings(), getMailSettings()]);
  const to = mail.adminEmail.trim() || (isPlaceholder(settings.company.email) ? "" : settings.company.email.trim());
  if (!to) return { error: "Trag zuerst eine Adresse für Benachrichtigungen ein (oder die E-Mail in den Firmendaten)." };
  const res = await sendMail({ to: { email: to }, ...testMail(settings), tag: "test" });
  if (!res.ok) return { error: `Nicht verschickt: ${res.error}` };
  return { ok: true, message: res.provider === "outbox" ? `Test-E-Mail liegt im lokalen Ordner .data/outbox (an ${to}).` : `Test-E-Mail ist an ${to} unterwegs – schau in dein Postfach (auch im Spam-Ordner).`, at: Date.now() };
}
