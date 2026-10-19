"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, currentAdminSession, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { checkPassword } from "@/lib/admin-security/flow";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { twoFactorEnabled, verifySecondFactor } from "@/lib/admin-security/two-factor";
import { restoreToTest } from "@/lib/backup/restore";
import { type CheckStep, defaultDeps, runBackup, validBackupId, verifyBackup } from "@/lib/backup/service";

export type BackupActionState = { ok?: string; error?: string; steps?: CheckStep[]; at?: number } | undefined;

const PATH = "/admin/datensicherung";
const tooMany: BackupActionState = { error: "Zu viele Versuche. Bitte später erneut versuchen." };

/** Jede Aktion: voll angemeldet (Passwort + ggf. 2FA) und begrenzt je IP */
async function guard() {
  await assertAdmin();
  const s = await currentAdminSession();
  if (!s) throw new Error("Nicht angemeldet");
  const o = await requestOrigin();
  const limit = await hitLimit("backupAction", o.ip);
  if (!limit.ok) await logSecurityEvent("rate_limited", { ...o, detail: "Datensicherung" });
  return { o, limited: !limit.ok };
}

/** Sicherung jetzt erstellen */
export async function startBackupAction(_: BackupActionState): Promise<BackupActionState> {
  const { o, limited } = await guard();
  if (limited) return tooMany;
  await logSecurityEvent("backup_manual", o);
  const r = await runBackup(defaultDeps(), "manual");
  revalidatePath(PATH);
  if (!r.ok) return { error: r.error, at: Date.now() };
  return { ok: `Sicherung vollständig: ${r.meta.entries.toLocaleString("de-DE")} Einträge, geprüft und verschlüsselt abgelegt.`, at: Date.now() };
}

/** Integrität einer Sicherung prüfen (lädt, entschlüsselt, prüft – ändert nichts) */
export async function verifyBackupAction(_: BackupActionState, form: FormData): Promise<BackupActionState> {
  const { o, limited } = await guard();
  if (limited) return tooMany;
  const id = String(form.get("id") ?? "");
  if (!validBackupId(id)) return { error: "Ungültige Sicherung." };
  const deps = defaultDeps();
  if (!deps.storage) return { error: "Kein Speicher für Sicherungen eingerichtet." };
  const r = await verifyBackup(deps.storage, id);
  await logSecurityEvent("backup_verified", { ...o, detail: r.ok ? "in Ordnung" : "fehlerhaft" });
  await deps.ops.log({ at: new Date().toISOString(), action: "verify", ok: r.ok, id, message: r.ok ? "Prüfung bestanden." : `Prüfung fehlgeschlagen: ${r.steps.find((s) => !s.ok)?.detail ?? ""}` }).catch(() => undefined);
  revalidatePath(PATH);
  return r.ok ? { ok: "Prüfung bestanden – die Sicherung ist vollständig und unverändert.", steps: r.steps, at: Date.now() } : { error: "Prüfung fehlgeschlagen.", steps: r.steps, at: Date.now() };
}

/**
 * In die isolierte Testdatenbank wiederherstellen – nur nach erneuter Bestätigung:
 * Passwort und (wenn eingerichtet) aktueller Code aus der Authenticator-App.
 */
export async function restoreTestAction(_: BackupActionState, form: FormData): Promise<BackupActionState> {
  const { o, limited } = await guard();
  if (limited) return tooMany;
  const id = String(form.get("id") ?? "");
  if (!validBackupId(id)) return { error: "Ungültige Sicherung." };
  const pwOk = checkPassword(String(form.get("password") ?? "").slice(0, 512));
  const needCode = await twoFactorEnabled();
  const codeOk = pwOk && (!needCode || (await verifySecondFactor(String(form.get("code") ?? "").slice(0, 20))));
  if (!codeOk) {
    await logSecurityEvent("second_factor_failed", { ...o, detail: "Bestätigung Testwiederherstellung" });
    return { error: needCode ? "Passwort oder Code stimmt nicht." : "Das Passwort stimmt nicht." };
  }
  await logSecurityEvent("restore_test", { ...o, detail: "gestartet" });
  const r = await restoreToTest(defaultDeps(), id);
  await logSecurityEvent("restore_test", { ...o, detail: r.ok ? "erfolgreich" : "fehlgeschlagen" });
  revalidatePath(PATH);
  return r.ok ? { ok: `Testwiederherstellung erfolgreich: ${r.restoredKeys} Einträge eingespielt und geprüft.${r.cleaned ? " Die Testdatenbank wurde danach wieder geleert." : ""}`, steps: r.steps, at: Date.now() } : { error: "Testwiederherstellung fehlgeschlagen – die Produktivdaten wurden nicht verändert.", steps: r.steps, at: Date.now() };
}
