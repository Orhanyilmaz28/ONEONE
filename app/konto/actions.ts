"use server";

import { redirect } from "next/navigation";
import { accountAccess, endCustomerSession, getCurrentCustomer, safeNext, startCustomerSession } from "@/lib/customer-auth";
import {
  EMAIL,
  EmailTakenError,
  PASSWORD_MAX,
  PASSWORD_MIN,
  checkLogin,
  checkPasswordReset,
  completePasswordReset,
  createPasswordReset,
  createCustomer,
  deleteCustomer,
  hashPassword,
  normalizeEmail,
  updateCustomer,
  verifyPassword,
} from "@/lib/customers";
import { SITE_URL } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { passwordResetMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; message?: string; at?: number; values?: Record<string, string> };

const str = (form: FormData, key: string, max = 300) => {
  const v = form.get(key);
  return typeof v === "string" ? v.slice(0, max) : "";
};
const line = (s: string) => s.replace(/\s+/g, " ").trim();
const OFF = "Kundenkonten sind gerade nicht verfügbar.";
const FAILED = "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.";

async function allowed() {
  return (await accountAccess()).allowed;
}

function storeError(error: unknown): FormState {
  if (error instanceof StoreUnavailableError) return { error: "Kundenkonten sind noch nicht eingerichtet (kein Datenspeicher verbunden)." };
  console.error("[konto]", error);
  return { error: FAILED };
}

function checkPassword(pw: string, name: string, email: string): string | undefined {
  if (pw.length < PASSWORD_MIN) return `Bitte mindestens ${PASSWORD_MIN} Zeichen.`;
  if (pw.length > PASSWORD_MAX) return "Das Passwort ist zu lang.";
  const lower = pw.toLowerCase();
  if ((email && lower.includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3) || (name && name.length > 3 && lower.includes(name.toLowerCase()))) {
    return "Bitte nicht den eigenen Namen oder die E-Mail-Adresse als Passwort verwenden.";
  }
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|passwort|password)/i.test(pw)) return "Dieses Passwort ist zu leicht zu erraten.";
  return undefined;
}

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  // Spam-Schutz: unsichtbares Feld
  if (str(form, "website")) return { error: FAILED };
  const name = line(str(form, "name", 120));
  const email = normalizeEmail(str(form, "email", 200));
  const password = str(form, "password", PASSWORD_MAX + 1);
  const consent = form.get("consent") === "1";
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Bitte gib deinen Namen an.";
  else if (name.length > 80) fieldErrors.name = "Bitte höchstens 80 Zeichen.";
  if (!EMAIL.test(email)) fieldErrors.email = "Bitte gib eine gültige E-Mail-Adresse an.";
  const pwError = checkPassword(password, name, email);
  if (pwError) fieldErrors.password = pwError;
  if (!consent) fieldErrors.consent = "Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.";
  const values = { name, email };
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  let customer;
  try {
    customer = await createCustomer({ email, name, password });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { fieldErrors: { email: "Mit dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich einfach an." }, values };
    }
    return { ...storeError(error), values };
  }
  await startCustomerSession(customer);
  redirect("/konto?willkommen=1");
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const email = str(form, "email", 200);
  const password = str(form, "password", PASSWORD_MAX + 1);
  const values = { email };
  if (!email || !password) return { error: "Bitte E-Mail-Adresse und Passwort eingeben.", values };
  let result;
  try {
    result = await checkLogin(email, password);
  } catch (error) {
    return { ...storeError(error), values };
  }
  if ("error" in result) {
    return {
      error:
        result.error === "locked"
          ? `Zu viele Versuche. Aus Sicherheitsgründen ist die Anmeldung für ${result.minutes ?? 15} Minuten gesperrt.`
          : "E-Mail-Adresse oder Passwort stimmen nicht.",
      values,
    };
  }
  await startCustomerSession(result.customer);
  redirect(safeNext(form.get("weiter")));
}

export async function logout() {
  const customer = await getCurrentCustomer();
  // Version erhöhen: abgemeldet ist abgemeldet – auch wenn jemand das Cookie kopiert hat
  if (customer) await updateCustomer(customer.id, (c) => ({ ...c, sessionVersion: c.sessionVersion + 1 })).catch(() => undefined);
  await endCustomerSession();
  redirect("/konto/anmelden?abgemeldet=1");
}

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "Bitte melde dich erneut an." };
  const name = line(str(form, "name", 120));
  const address = {
    line1: line(str(form, "line1", 120)),
    line2: line(str(form, "line2", 120)),
    postalCode: line(str(form, "postalCode", 12)),
    city: line(str(form, "city", 80)),
    country: line(str(form, "country", 2)).toUpperCase() || "DE",
  };
  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Bitte gib deinen Namen an.";
  const anyAddress = address.line1 || address.postalCode || address.city;
  if (anyAddress) {
    if (!address.line1) fieldErrors.line1 = "Bitte Straße und Hausnummer angeben.";
    if (address.country === "DE" && !/^\d{5}$/.test(address.postalCode)) fieldErrors.postalCode = "Bitte eine 5-stellige Postleitzahl angeben.";
    else if (!address.postalCode) fieldErrors.postalCode = "Bitte die Postleitzahl angeben.";
    if (!address.city) fieldErrors.city = "Bitte den Ort angeben.";
    if (!["DE", "AT", "NL", "BE", "LU", "FR", "IT", "DK"].includes(address.country)) fieldErrors.country = "Dieses Land beliefern wir leider nicht.";
  }
  // Eingaben zurückgeben, damit das Formular sie nach dem Absenden wieder zeigt
  const values = { name, ...address };
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };
  try {
    await updateCustomer(customer.id, (c) => ({ ...c, name, address: anyAddress ? address : undefined }));
  } catch (error) {
    return { ...storeError(error), values };
  }
  return { message: "Gespeichert.", at: Date.now(), values };
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "Bitte melde dich erneut an." };
  const current = str(form, "current", PASSWORD_MAX + 1);
  const next = str(form, "next", PASSWORD_MAX + 1);
  if (!(await verifyPassword(current, customer.passwordHash))) return { fieldErrors: { current: "Das aktuelle Passwort stimmt nicht." } };
  const pwError = checkPassword(next, customer.name, customer.email);
  if (pwError) return { fieldErrors: { next: pwError } };
  try {
    const hash = await hashPassword(next);
    const updated = await updateCustomer(customer.id, (c) => ({ ...c, passwordHash: hash, sessionVersion: c.sessionVersion + 1 }));
    // Andere Geräte sind jetzt abgemeldet – dieses bleibt angemeldet
    if (updated) await startCustomerSession(updated);
  } catch (error) {
    return storeError(error);
  }
  return { message: "Passwort geändert. Auf anderen Geräten bist du jetzt abgemeldet.", at: Date.now() };
}

export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const customer = await getCurrentCustomer();
  if (!customer) return { error: "Bitte melde dich erneut an." };
  if (!(await verifyPassword(str(form, "password", PASSWORD_MAX + 1), customer.passwordHash))) {
    return { fieldErrors: { password: "Das Passwort stimmt nicht." } };
  }
  try {
    await deleteCustomer(customer.id);
  } catch (error) {
    return storeError(error);
  }
  await endCustomerSession();
  redirect("/konto/anmelden?geloescht=1");
}

/** Passwort vergessen: Link per E-Mail schicken. Antwort ist immer gleich – verrät nicht, ob es ein Konto gibt. */
export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const email = normalizeEmail(str(form, "email", 200));
  if (!EMAIL.test(email)) return { fieldErrors: { email: "Bitte gib eine gültige E-Mail-Adresse an." }, values: { email } };
  const done: FormState = {
    message: `Wenn es ein Konto mit ${email} gibt, ist jetzt eine E-Mail mit einem Link unterwegs. Schau auch im Spam-Ordner nach. Der Link ist 60 Minuten gültig.`,
    at: Date.now(),
  };
  try {
    const reset = await createPasswordReset(email);
    if (reset) {
      const url = `${SITE_URL}/konto/passwort-neu?u=${reset.customer.id}&t=${reset.token}`;
      const mail = passwordResetMail(reset.customer.name, url, await getSettings());
      const res = await sendMail({ to: { email: reset.customer.email, name: reset.customer.name }, ...mail, tag: "passwort" });
      if (!res.ok) {
        console.error("[konto] Passwort-E-Mail fehlgeschlagen", res.error);
        return { error: "Die E-Mail konnte gerade nicht verschickt werden. Bitte versuche es in ein paar Minuten noch einmal." };
      }
    }
  } catch (error) {
    return storeError(error);
  }
  return done;
}

/** Neues Passwort über den Link aus der E-Mail setzen */
export async function setNewPassword(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await allowed())) return { error: OFF };
  const id = str(form, "u", 40);
  const token = str(form, "t", 80);
  const password = str(form, "password", PASSWORD_MAX + 1);
  let customer;
  try {
    const current = await checkPasswordReset(id, token);
    if (!current) return { error: "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an." };
    const pwError = checkPassword(password, current.name, current.email);
    if (pwError) return { fieldErrors: { password: pwError } };
    customer = await completePasswordReset(id, token, password);
  } catch (error) {
    return storeError(error);
  }
  if (!customer) return { error: "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere einen neuen an." };
  await startCustomerSession(customer);
  redirect("/konto?passwort=neu");
}
