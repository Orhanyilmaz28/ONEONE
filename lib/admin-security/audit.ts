import { kv } from "../kv";
import { now } from "./clock";
import { maskIp } from "./request-info";

/**
 * Sicherheitsprotokoll des Dashboards (letzte 500 Ereignisse). Enthält nie Passwörter, Cookies, Tokens, Codes oder Geheimnisse.
 */
export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_password_ok"
  | "second_factor_failed"
  | "recovery_code_used"
  | "rate_limited"
  | "twofa_setup_started"
  | "twofa_enabled"
  | "twofa_disabled"
  | "recovery_codes_regenerated"
  | "logout"
  | "session_revoked"
  | "sessions_revoked_all"
  | "backup_manual"
  | "backup_verified"
  | "restore_test"
  | "office_export"
  | "office_document"
  | "office_user_created"
  | "office_user_changed"
  | "office_user_deleted"
  | "office_denied";

export type SecurityEvent = { at: string; type: SecurityEventType; ip: string; ua: string; detail?: string };

const KEY = "tt:adm:audit";
const MAX = 500;

export async function logSecurityEvent(type: SecurityEventType, info: { ip: string; ua: string; detail?: string }) {
  const event: SecurityEvent = { at: new Date(now()).toISOString(), type, ip: maskIp(info.ip), ua: info.ua.slice(0, 120), ...(info.detail ? { detail: info.detail.slice(0, 120) } : {}) };
  try {
    await kv().lpushTrim(KEY, JSON.stringify(event), MAX);
  } catch {
    // Protokoll darf die Anmeldung nicht blockieren – ohne Details in die Server-Logs
    console.error("[admin-security] Protokoll konnte nicht geschrieben werden", type);
  }
}

export async function listSecurityEvents(limit = 100): Promise<SecurityEvent[]> {
  const raw = await kv().lrange(KEY, 0, limit - 1);
  return raw.flatMap((r) => {
    try {
      return [JSON.parse(r) as SecurityEvent];
    } catch {
      return [];
    }
  });
}
