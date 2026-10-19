"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin, clearAdminCookie, currentAdminSession, requestOrigin, setAdminCookie } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { checkPassword, finishSetupStep } from "@/lib/admin-security/flow";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { revokeAllSessions, revokeSession } from "@/lib/admin-security/sessions";
import { disableTwoFactor, encryptionConfigured, regenerateRecoveryCodes, startSetup, twoFactorEnabled, twoFactorRequired, useRecoveryCode, verifySecondFactor } from "@/lib/admin-security/two-factor";
import { kv } from "@/lib/kv";

export type ActionState = { error?: string; ok?: string; recoveryCodes?: string[] } | undefined;

const PATH = "/admin/sicherheit";
const tooMany: ActionState = { error: "Zu viele Versuche. Bitte später erneut versuchen." };

/** Jede Sicherheitsaktion: angemeldet + Begrenzung je IP */
async function guard() {
  await assertAdmin();
  const s = await currentAdminSession();
  if (!s) throw new Error("Nicht angemeldet");
  const o = await requestOrigin();
  const limit = await hitLimit("securityAction", o.ip);
  if (!limit.ok) await logSecurityEvent("rate_limited", { ...o, detail: "Sicherheitsaktion" });
  return { s, o, limited: !limit.ok };
}

/** 2FA-Einrichtung starten – nur nach erneuter Passworteingabe */
export async function startTwoFactorSetup(_: ActionState, form: FormData): Promise<ActionState> {
  const { s, o, limited } = await guard();
  if (limited) return tooMany;
  if (!encryptionConfigured()) return { error: "ADMIN_2FA_KEY fehlt in den Umgebungsvariablen (siehe Hinweis unten)." };
  if (await twoFactorEnabled()) return { error: "Die Zwei-Faktor-Anmeldung ist bereits aktiv." };
  if (!checkPassword(String(form.get("password") ?? ""))) {
    await logSecurityEvent("login_failed", { ...o, detail: "Passwortbestätigung (2FA-Einrichtung)" });
    return { error: "Das Passwort stimmt nicht." };
  }
  await startSetup(s.id, "Dashboard");
  await logSecurityEvent("twofa_setup_started", o);
  revalidatePath(PATH);
  return { ok: "Einrichtung gestartet." };
}

/** Einrichtung abschließen: 2FA aktiv, alle anderen Sitzungen beendet, eigene Sitzung erneuert */
export async function confirmTwoFactorSetup(_: ActionState, form: FormData): Promise<ActionState> {
  await assertAdmin();
  const s = await currentAdminSession();
  if (!s) return { error: "Nicht angemeldet." };
  const r = await finishSetupStep(s, String(form.get("code") ?? ""), await requestOrigin());
  if (!r.ok) {
    if (r.error === "rate_limited") return tooMany;
    if (r.error === "expired") return { error: "Die Einrichtung ist abgelaufen. Bitte neu starten." };
    return { error: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben." };
  }
  await setAdminCookie(r.token, "full");
  return { recoveryCodes: r.recoveryCodes };
}

export async function cancelTwoFactorSetup(): Promise<void> {
  const { s } = await guard();
  await kv().del(`tt:adm:2fa:setup:${s.id}`);
  revalidatePath(PATH);
}

/** Neue Wiederherstellungscodes – nur mit aktuellem Code aus der App */
export async function newRecoveryCodes(_: ActionState, form: FormData): Promise<ActionState> {
  const { o, limited } = await guard();
  if (limited) return tooMany;
  if (!(await verifySecondFactor(String(form.get("code") ?? "")))) {
    await logSecurityEvent("second_factor_failed", { ...o, detail: "Neue Wiederherstellungscodes" });
    return { error: "Der Code stimmt nicht." };
  }
  const codes = await regenerateRecoveryCodes();
  await logSecurityEvent("recovery_codes_regenerated", o);
  revalidatePath(PATH);
  return { recoveryCodes: codes };
}

/** 2FA ausschalten – nur mit Passwort UND zweitem Faktor; nicht möglich, wenn 2FA vorgeschrieben ist */
export async function disableTwoFactorAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { s, o, limited } = await guard();
  if (limited) return tooMany;
  if (twoFactorRequired()) return { error: "Die Zwei-Faktor-Anmeldung ist vorgeschrieben (ADMIN_REQUIRE_2FA) und kann nicht ausgeschaltet werden." };
  const pwOk = checkPassword(String(form.get("password") ?? ""));
  const code = String(form.get("code") ?? "");
  // Code nur prüfen (und damit verbrauchen), wenn das Passwort stimmt – einheitliche Meldung in beiden Fällen
  const codeOk = pwOk && (/^\d[\d ]{5,6}$/.test(code.trim()) ? await verifySecondFactor(code) : await useRecoveryCode(code));
  if (!codeOk) {
    await logSecurityEvent("second_factor_failed", { ...o, detail: "2FA ausschalten" });
    return { error: "Passwort oder Code stimmt nicht." };
  }
  await disableTwoFactor();
  await logSecurityEvent("twofa_disabled", o);
  const ended = await revokeAllSessions(s.id);
  if (ended) await logSecurityEvent("sessions_revoked_all", { ...o, detail: `${ended} weitere Sitzung(en) beendet` });
  revalidatePath(PATH);
  return { ok: "Zwei-Faktor-Anmeldung ausgeschaltet." };
}

/** Eine Sitzung beenden */
export async function revokeSessionAction(id: string): Promise<void> {
  const { s, o } = await guard();
  if (!/^[a-f0-9]{64}$/.test(id)) return;
  await revokeSession(id);
  await logSecurityEvent("session_revoked", { ...o, detail: id === s.id ? "eigene Sitzung" : "andere Sitzung" });
  if (id === s.id) {
    await clearAdminCookie();
    redirect("/admin/login");
  }
  revalidatePath(PATH);
}

/** Alle anderen Sitzungen beenden */
export async function revokeOtherSessions(): Promise<void> {
  const { s, o } = await guard();
  const n = await revokeAllSessions(s.id);
  await logSecurityEvent("sessions_revoked_all", { ...o, detail: `${n} andere Sitzung(en) beendet` });
  revalidatePath(PATH);
}

/** Alle Sitzungen beenden (auch die eigene) */
export async function revokeEverySession(): Promise<void> {
  const { o } = await guard();
  const n = await revokeAllSessions();
  await logSecurityEvent("sessions_revoked_all", { ...o, detail: `${n} Sitzung(en) inkl. eigener beendet` });
  await clearAdminCookie();
  redirect("/admin/login");
}
