import { adminConfigured, safeEqual } from "../admin-token";
import { logSecurityEvent } from "./audit";
import { hitLimits } from "./rate-limit";
import { type AdminSession, createSession, readSession, revokeAllSessions, revokeSession, saveSession } from "./sessions";
import { confirmSetup, encryptionConfigured, twoFactorEnabled, twoFactorRequired, useRecoveryCode, verifySecondFactor } from "./two-factor";

/**
 * Anmeldeablauf des Dashboards ohne Next-Abhängigkeiten (dadurch automatisch testbar).
 * Die Server Actions setzen nur noch Cookie und Weiterleitung.
 *
 * Fehlermeldungen sind bewusst einheitlich – sie verraten nicht, ob Passwort oder Code falsch war.
 */
export type Origin = { ip: string; ua: string };
export type LoginResult =
  | { ok: true; token: string; next: "admin" | "2fa" | "setup" }
  | { ok: false; error: "invalid" | "rate_limited" | "not_configured" | "expired" | "setup_unavailable"; retryAfter?: number };

export const GENERIC_ERROR = "Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.";

export function checkPassword(input: string) {
  return adminConfigured() && safeEqual(input, process.env.ADMIN_PASSWORD ?? "");
}

/** Schritt 1: Passwort */
export async function passwordStep(password: string, o: Origin): Promise<LoginResult> {
  if (!adminConfigured()) return { ok: false, error: "not_configured" };
  // zuerst zählen (atomar), dann prüfen – parallele Versuche werden alle gezählt
  const limit = await hitLimits([
    ["loginIp", o.ip],
    ["loginGlobal", "all"],
  ]);
  if (!limit.ok) {
    await logSecurityEvent("rate_limited", { ...o, detail: "Passwort" });
    return { ok: false, error: "rate_limited", retryAfter: limit.retryAfter };
  }
  if (!checkPassword(password.slice(0, 512))) {
    await logSecurityEvent("login_failed", { ...o, detail: "Passwort" });
    return { ok: false, error: "invalid" };
  }
  if (await twoFactorEnabled()) {
    const { token } = await createSession("2fa", o);
    await logSecurityEvent("login_password_ok", { ...o, detail: "zweiter Faktor ausstehend" });
    return { ok: true, token, next: "2fa" };
  }
  if (twoFactorRequired()) {
    if (!encryptionConfigured()) return { ok: false, error: "setup_unavailable" };
    const { token } = await createSession("setup", o);
    await logSecurityEvent("login_password_ok", { ...o, detail: "2FA-Einrichtung erforderlich" });
    return { ok: true, token, next: "setup" };
  }
  const { token } = await createSession("full", { ...o, method: "Passwort" });
  await logSecurityEvent("login_success", { ...o, detail: "Passwort (ohne 2FA)" });
  return { ok: true, token, next: "admin" };
}

/** Schritt 2: TOTP-Code oder Wiederherstellungscode – bei Erfolg neue Sitzung (alte ID wird verworfen) */
export async function secondFactorStep(pendingToken: string | undefined, code: string, kind: "totp" | "recovery", o: Origin): Promise<LoginResult> {
  const pending = await readSession(pendingToken);
  if (!pending || pending.stage !== "2fa") return { ok: false, error: "expired" };
  const limit = await hitLimits([
    ["secondFactorSession", pending.id],
    ["secondFactorIp", o.ip],
    ["secondFactorGlobal", "all"],
  ]);
  if (!limit.ok) {
    // zu viele Fehlversuche in diesem Anmeldevorgang: Vorgang beenden, Passwort muss neu eingegeben werden
    await revokeSession(pending.id);
    await logSecurityEvent("rate_limited", { ...o, detail: "zweiter Faktor" });
    return { ok: false, error: "rate_limited", retryAfter: limit.retryAfter };
  }
  const ok = kind === "totp" ? await verifySecondFactor(code.slice(0, 20)) : await useRecoveryCode(code.slice(0, 40));
  if (!ok) {
    await logSecurityEvent("second_factor_failed", { ...o, detail: kind === "totp" ? "TOTP" : "Wiederherstellungscode" });
    return { ok: false, error: "invalid" };
  }
  await revokeSession(pending.id);
  const { token } = await createSession("full", { ...o, method: kind === "totp" ? "Passwort + TOTP" : "Passwort + Wiederherstellungscode" });
  if (kind === "recovery") await logSecurityEvent("recovery_code_used", o);
  await logSecurityEvent("login_success", { ...o, detail: kind === "totp" ? "Passwort + TOTP" : "Passwort + Wiederherstellungscode" });
  return { ok: true, token, next: "admin" };
}

/**
 * 2FA-Einrichtung abschließen (erzwungene Einrichtung nach dem Passwort oder freiwillig im Dashboard).
 * Danach: alle anderen Sitzungen enden, die eigene wird erneuert (neue ID).
 */
export async function finishSetupStep(session: AdminSession, code: string, o: Origin): Promise<{ ok: true; token: string; recoveryCodes: string[] } | { ok: false; error: "invalid" | "expired" | "rate_limited"; retryAfter?: number }> {
  const limit = await hitLimits([
    ["secondFactorSession", session.id],
    ["securityAction", o.ip],
  ]);
  if (!limit.ok) {
    await logSecurityEvent("rate_limited", { ...o, detail: "2FA-Einrichtung" });
    return { ok: false, error: "rate_limited", retryAfter: limit.retryAfter };
  }
  const r = await confirmSetup(session.id, code);
  if (!r.ok) {
    if (r.reason === "invalid") await logSecurityEvent("second_factor_failed", { ...o, detail: "Einrichtung" });
    return { ok: false, error: r.reason };
  }
  await logSecurityEvent("twofa_enabled", o);
  await revokeSession(session.id);
  const ended = await revokeAllSessions();
  if (ended) await logSecurityEvent("sessions_revoked_all", { ...o, detail: `${ended} weitere Sitzung(en) nach 2FA-Aktivierung beendet` });
  const { token } = await createSession("full", { ...o, method: "Passwort + TOTP (eingerichtet)" });
  return { ok: true, token, recoveryCodes: r.recoveryCodes };
}

/** Abmelden: Sitzung serverseitig löschen */
export async function logoutStep(token: string | undefined, o: Origin) {
  const s = await readSession(token);
  if (s) {
    await revokeSession(s.id);
    await logSecurityEvent("logout", o);
  }
}

export { saveSession };
