"use server";

import { redirect } from "next/navigation";
import { clearAdminCookie, currentAdminSession, requestOrigin, setAdminCookie } from "@/lib/admin-auth";
import { GENERIC_ERROR, finishSetupStep, logoutStep, passwordStep, secondFactorStep } from "@/lib/admin-security/flow";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { startSetup } from "@/lib/admin-security/two-factor";
import { ADMIN_COOKIE } from "@/lib/admin-token";
import { KvUnavailableError } from "@/lib/kv";
import { cookies } from "next/headers";

export type FormState = { error?: string } | undefined;
export type SetupState = { error?: string; recoveryCodes?: string[] } | undefined;

const minutes = (s?: number) => Math.max(1, Math.ceil((s ?? 60) / 60));
const rateMessage = (retryAfter?: number) => `Zu viele Versuche. Bitte in ${minutes(retryAfter)} Minute(n) erneut versuchen.`;
/** gleichmäßige Bremse bei Fehlern (zusätzlich zur Begrenzung in Redis) */
const slow = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 300));

const storeDown: FormState = { error: "Anmeldung gerade nicht möglich (Datenspeicher nicht erreichbar)." };

/** Schritt 1: Passwort */
export async function login(_: FormState, form: FormData): Promise<FormState> {
  const o = await requestOrigin();
  let r: Awaited<ReturnType<typeof passwordStep>>;
  try {
    r = await passwordStep(String(form.get("password") ?? ""), o);
  } catch (e) {
    if (!(e instanceof KvUnavailableError)) console.error("[admin] Anmeldung fehlgeschlagen (interner Fehler)");
    return storeDown;
  }
  if (!r.ok) {
    await slow();
    if (r.error === "rate_limited") return { error: rateMessage(r.retryAfter) };
    if (r.error === "not_configured") return { error: "Für das Dashboard ist noch kein Passwort eingerichtet." };
    if (r.error === "setup_unavailable") return { error: "Zwei-Faktor-Anmeldung ist vorgeschrieben, aber ADMIN_2FA_KEY fehlt in den Umgebungsvariablen." };
    return { error: GENERIC_ERROR };
  }
  await setAdminCookie(r.token, r.next === "admin" ? "full" : "pending");
  redirect(r.next === "admin" ? "/admin" : r.next === "2fa" ? "/admin/login/2fa" : "/admin/login/einrichten");
}

/** Schritt 2: Code aus der Authenticator-App oder Wiederherstellungscode */
export async function verifyCode(_: FormState, form: FormData): Promise<FormState> {
  const o = await requestOrigin();
  const kind = form.get("kind") === "recovery" ? "recovery" : "totp";
  let r: Awaited<ReturnType<typeof secondFactorStep>>;
  try {
    r = await secondFactorStep((await cookies()).get(ADMIN_COOKIE)?.value, String(form.get("code") ?? ""), kind, o);
  } catch {
    return storeDown;
  }
  if (!r.ok) {
    await slow();
    if (r.error === "expired") redirect("/admin/login?abgelaufen=1");
    if (r.error === "rate_limited") {
      await clearAdminCookie();
      return { error: `${rateMessage(r.retryAfter)} Der Anmeldevorgang wurde beendet – bitte erneut mit Passwort anmelden.` };
    }
    return { error: GENERIC_ERROR };
  }
  await setAdminCookie(r.token, "full");
  redirect("/admin");
}

/** Erzwungene Einrichtung (ADMIN_REQUIRE_2FA): Geheimnis erzeugen */
export async function startForcedSetup(): Promise<void> {
  const s = await currentAdminSession();
  if (!s || s.stage !== "setup") redirect("/admin/login");
  const o = await requestOrigin();
  if (!(await hitLimit("securityAction", o.ip)).ok) redirect("/admin/login/einrichten?zuviele=1");
  await startSetup(s.id, "Dashboard");
  redirect("/admin/login/einrichten");
}

/** Erzwungene Einrichtung abschließen – danach voll angemeldet (neue Sitzung) */
export async function confirmForcedSetup(_: SetupState, form: FormData): Promise<SetupState> {
  const s = await currentAdminSession();
  if (!s || s.stage !== "setup") return { error: "Der Anmeldevorgang ist abgelaufen. Bitte erneut anmelden." };
  const r = await finishSetupStep(s, String(form.get("code") ?? ""), await requestOrigin());
  if (!r.ok) {
    await slow();
    if (r.error === "rate_limited") return { error: rateMessage(r.retryAfter) };
    if (r.error === "expired") return { error: "Die Einrichtung ist abgelaufen. Bitte neu starten." };
    return { error: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  }
  await setAdminCookie(r.token, "full");
  return { recoveryCodes: r.recoveryCodes };
}

export async function logout() {
  try {
    await logoutStep((await cookies()).get(ADMIN_COOKIE)?.value, await requestOrigin());
  } catch {
    // Cookie wird trotzdem entfernt
  }
  await clearAdminCookie();
  redirect("/admin/login");
}

/** Anmeldevorgang abbrechen (zurück zum Passwort) */
export async function cancelLogin() {
  await logout();
}
