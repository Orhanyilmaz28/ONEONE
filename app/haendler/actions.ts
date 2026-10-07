"use server";

import { redirect } from "next/navigation";
import { endDealerSession, startDealerSession } from "@/lib/dealer-auth";
import { checkActivation, checkDealerLogin, completeActivation } from "@/lib/dealer-store";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/customer-rules";
import { StoreUnavailableError } from "@/lib/store";

export type FormState = { error?: string; email?: string } | undefined;

/** Händler-Login: E-Mail und Passwort */
export async function dealerLoginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, PASSWORD_MAX);
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben.", email };
  let result: Awaited<ReturnType<typeof checkDealerLogin>>;
  try {
    result = await checkDealerLogin(email, password);
  } catch (e) {
    if (!(e instanceof StoreUnavailableError)) console.error("[haendler] Login fehlgeschlagen", e);
    return { error: "Anmeldung gerade nicht möglich. Bitte später erneut versuchen.", email };
  }
  if ("error" in result) {
    return { error: result.error === "locked" ? `Zu viele Versuche. Bitte warte ${result.minutes ?? 15} Minuten.` : "E-Mail oder Passwort stimmt nicht – oder dein Händlerzugang ist noch nicht freigeschaltet.", email };
  }
  await startDealerSession(result.dealer);
  redirect("/haendler/portal");
}

/** Passwort über den Freischaltungs-Link festlegen */
export async function dealerActivateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const token = String(form.get("t") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (password.length < PASSWORD_MIN) return { error: `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.` };
  if (password.length > PASSWORD_MAX) return { error: "Das Passwort ist zu lang." };
  if (password !== again) return { error: "Die beiden Passwörter sind nicht gleich." };
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{48}$/.test(token)) return { error: "Dieser Link ist ungültig." };
  let dealer: Awaited<ReturnType<typeof completeActivation>>;
  try {
    dealer = await completeActivation(id, token, password);
  } catch {
    return { error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }
  if (!dealer) return { error: "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere bei uns einen neuen an." };
  await startDealerSession(dealer);
  redirect("/haendler/portal");
}

export async function dealerLogoutAction() {
  await endDealerSession();
  redirect("/haendler/login");
}

/** Für die Aktivierungs-Seite: ist der Link noch gültig? */
export async function activationValid(id: string, token: string) {
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{48}$/.test(token)) return null;
  const d = await checkActivation(id, token).catch(() => null);
  return d ? { company: d.company, contact: d.contact, email: d.email } : null;
}
