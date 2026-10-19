import { safeEqual } from "../admin-token";
import { type BackupDeps, checkHealth, cronEnabled, runBackup } from "./service";

/**
 * Täglicher Auftrag (Vercel Cron → GET /api/cron/backup).
 * - Nur mit gültigem „Authorization: Bearer <CRON_SECRET>“ (mind. 16 Zeichen; Vercel sendet das automatisch).
 * - Läuft nur, wenn BACKUP_CRON_ENABLED=1 – sonst passiert nichts (Schalter für die Freigabe).
 * - Parallele Läufe verhindert die Sperre in runBackup.
 */
export function cronAuthorized(authorization: string | null, env = process.env) {
  const secret = env.CRON_SECRET ?? "";
  if (secret.length < 16 || !authorization) return false;
  return safeEqual(authorization, `Bearer ${secret}`);
}

export async function handleCron(authorization: string | null, deps: () => BackupDeps): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!cronAuthorized(authorization)) return { status: 401, body: { ok: false, error: "Nicht berechtigt" } };
  if (!cronEnabled()) return { status: 200, body: { ok: true, skipped: "Automatische Sicherung ist nicht aktiviert (BACKUP_CRON_ENABLED)." } };
  const d = deps();
  const result = await runBackup(d, "cron");
  const health = await checkHealth(d).catch(() => null);
  if (result.ok) return { status: 200, body: { ok: true, id: result.meta.id, entries: result.meta.entries, removed: result.removed.length, health } };
  return { status: result.busy ? 409 : 500, body: { ok: false, error: result.error, health } };
}
