import { manifestOf } from "./format";
import type { BackupEntry } from "./format";
import { RESTORE_TEST_MARKER } from "./keys";
import { type RedisClient, type Cmd, hostOf, productionCredentials, restClient, restoreTestCredentials } from "./redis-rest";
import { type BackupDeps, type CheckStep, describeError, signalFailure, verifyBackup } from "./service";
import { exportRedis } from "./snapshot";
import type { BackupStorage } from "./storage";

/**
 * Wiederherstellung – in dieser Phase AUSSCHLIESSLICH in eine isolierte Testdatenbank.
 *
 * Schutzmaßnahmen gegen das Überschreiben der Produktivdaten:
 * 1. Ziel kommt nur aus BACKUP_RESTORE_TEST_URL/_TOKEN – nie aus einer Eingabe im Dashboard.
 * 2. Ziel darf weder dieselbe Adresse noch denselben Zugangsschlüssel wie die Produktivdatenbank haben.
 * 3. Ziel muss leer sein oder die Testmarkierung (tt:restore-test:marker) tragen. Die Produktivdatenbank trägt diese
 *    Markierung nie: sie wird nie gesichert und nie dorthin geschrieben.
 * 4. Admin-Sitzungen, 2FA-Geheimnis und Wiederherstellungscodes sind gar nicht in der Sicherung – sie können nicht
 *    reaktiviert werden.
 * 5. Die Wiederherstellung in die Produktion ist gesperrt (restoreToProduction wirft immer).
 * Nach der Prüfung wird die Testdatenbank wieder geleert (personenbezogene Daten liegen dort nicht dauerhaft im Klartext),
 * außer BACKUP_RESTORE_TEST_KEEP=1.
 */
export class RestoreGuardError extends Error {
  override name = "RestoreGuardError";
}
export class ProductionRestoreLockedError extends Error {
  override name = "ProductionRestoreLockedError";
  constructor() {
    super("Die Wiederherstellung in den Live-Shop ist noch nicht freigeschaltet. Bitte zuerst in eine Testdatenbank wiederherstellen.");
  }
}

/** Gesperrt in Phase 2B – absichtlich ohne Umgehungsmöglichkeit */
export async function restoreToProduction(_id: string, _confirmation: string): Promise<never> {
  throw new ProductionRestoreLockedError();
}

/** Prüft, ob ein Ziel sicher als Testdatenbank verwendet werden darf (ohne etwas zu schreiben) */
export function assertNotProduction(target: { url: string; token: string }, prod = productionCredentials()) {
  if (!target.url || !target.token) throw new RestoreGuardError("Keine Testdatenbank eingerichtet (BACKUP_RESTORE_TEST_URL und BACKUP_RESTORE_TEST_TOKEN).");
  if (prod && (hostOf(prod.url) === hostOf(target.url) || prod.token === target.token))
    throw new RestoreGuardError("Die Testdatenbank ist die Produktivdatenbank – Wiederherstellung verweigert.");
}

export type RestoreReport = { ok: boolean; id: string; steps: CheckStep[]; restoredKeys?: number; cleaned?: boolean };

function writeCommands(e: BackupEntry): Cmd[] {
  const px = e.ttl ? ["PX", e.ttl] : [];
  const out: Cmd[] = [["DEL", e.k]];
  if (e.t === "string") return [["SET", e.k, e.v as string, ...px]];
  const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  if (e.t === "list") for (const c of chunk(e.v as string[])) out.push(["RPUSH", e.k, ...c]);
  if (e.t === "set") for (const c of chunk(e.v as string[])) out.push(["SADD", e.k, ...c]);
  if (e.t === "hash") for (const c of chunk(Object.entries(e.v as Record<string, string>))) out.push(["HSET", e.k, ...c.flat()]);
  if (e.t === "zset") for (const c of chunk(e.v as [string, string][])) out.push(["ZADD", e.k, ...c.flatMap(([m, s]) => [s, m])]);
  if (e.ttl) out.push(["PEXPIRE", e.k, e.ttl]);
  return out;
}

async function run(redis: RedisClient, cmds: Cmd[]) {
  // nach Datenmenge bündeln (große Werte einzeln)
  let batch: Cmd[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const res = await redis.pipeline(batch);
    if (res.some((r) => r.error)) throw new RestoreGuardError("Die Testdatenbank hat einen Schreibbefehl abgelehnt.");
    batch = [];
    bytes = 0;
  };
  for (const c of cmds) {
    const n = c.reduce<number>((s, x) => s + String(x).length, 0);
    if (batch.length && (bytes + n > 2 * 1024 * 1024 || batch.length >= 200)) await flush();
    batch.push(c);
    bytes += n;
  }
  await flush();
}

/**
 * Sicherung in die Testdatenbank einspielen und prüfen:
 * auswählen → Prüfsumme → entschlüsseln → Struktur → Ziel prüfen → einspielen → zurücklesen und vergleichen → protokollieren
 */
export async function restoreToTest(deps: BackupDeps, id: string, opts: { target?: RedisClient; targetCreds?: { url: string; token: string } } = {}): Promise<RestoreReport> {
  const started = Date.now();
  const steps: CheckStep[] = [];
  const finish = async (ok: boolean, extra: Partial<RestoreReport> = {}): Promise<RestoreReport> => {
    const message = ok ? `Testwiederherstellung erfolgreich: ${extra.restoredKeys ?? 0} Einträge stimmen überein.` : `Testwiederherstellung fehlgeschlagen: ${steps.filter((s) => !s.ok).map((s) => `${s.label} – ${s.detail ?? ""}`).join("; ")}`;
    await deps.ops.log({ at: new Date().toISOString(), action: "restore_test", ok, id, durationMs: Date.now() - started, message }).catch(() => undefined);
    await deps.ops.patchState({ lastRestoreTestAt: new Date().toISOString(), lastRestoreTestOk: ok }).catch(() => undefined);
    if (!ok) await signalFailure(deps, "restore_failed", message);
    return { ok, id, steps, ...extra };
  };
  if (!deps.storage) {
    steps.push({ label: "Sicherung auswählen", ok: false, detail: "Kein Speicher für Sicherungen eingerichtet" });
    return finish(false);
  }

  // 1–4: auswählen, prüfen, entschlüsseln, validieren
  const verified = await verifyBackup(deps.storage as BackupStorage, id, { keepPayload: true });
  steps.push(...verified.steps);
  if (!verified.ok || !verified.payload) return finish(false);
  const payload = verified.payload;

  // 5: Ziel prüfen
  let target: RedisClient;
  try {
    if (opts.target) {
      if (opts.targetCreds) assertNotProduction(opts.targetCreds);
      target = opts.target;
    } else {
      const creds = opts.targetCreds ?? restoreTestCredentials();
      if (!creds) throw new RestoreGuardError("Keine Testdatenbank eingerichtet (BACKUP_RESTORE_TEST_URL und BACKUP_RESTORE_TEST_TOKEN).");
      assertNotProduction(creds);
      target = restClient(creds.url, creds.token);
    }
    const prod = productionCredentials();
    if (prod && hostOf(prod.url) === target.target) throw new RestoreGuardError("Die Testdatenbank ist die Produktivdatenbank – Wiederherstellung verweigert.");
    const size = Number(await target.cmd(["DBSIZE"]));
    const marked = (await target.cmd<string | null>(["GET", RESTORE_TEST_MARKER])) !== null;
    if (size > 0 && !marked) throw new RestoreGuardError("Die Testdatenbank ist nicht leer und nicht als Testdatenbank markiert – aus Sicherheit wird nichts geschrieben.");
    if (size > 0) await target.cmd(["FLUSHDB"]);
    await target.cmd(["SET", RESTORE_TEST_MARKER, JSON.stringify({ purpose: "EXSTASE Wiederherstellungstest", at: new Date().toISOString() })]);
    steps.push({ label: "Testdatenbank prüfen", ok: true, detail: size > 0 ? "markierte Testdatenbank geleert" : "leer" });
  } catch (e) {
    steps.push({ label: "Testdatenbank prüfen", ok: false, detail: describeError(e) });
    return finish(false);
  }

  // 6: einspielen
  try {
    await run(target, payload.entries.flatMap(writeCommands));
    steps.push({ label: "Daten einspielen", ok: true, detail: `${payload.entries.length} Einträge geschrieben` });
  } catch (e) {
    steps.push({ label: "Daten einspielen", ok: false, detail: describeError(e) });
    return finish(false);
  }

  // 7: zurücklesen und vergleichen (gleicher Export wie bei der Sicherung)
  let ok = false;
  try {
    const back = await exportRedis(target);
    const m = manifestOf(back.entries);
    ok = m.count === payload.manifest.count && m.sha256 === payload.manifest.sha256;
    const versions = back.entries.filter((e) => e.k.startsWith("tt:ver:")).length;
    steps.push({ label: "Wiederhergestellte Daten prüfen", ok, detail: ok ? `${m.count} Einträge identisch (davon ${versions} Versionszähler)` : `Abweichung: ${m.count} statt ${payload.manifest.count} Einträge oder Inhalte verschieden` });
  } catch (e) {
    steps.push({ label: "Wiederhergestellte Daten prüfen", ok: false, detail: describeError(e) });
  }

  // Aufräumen: Testdatenbank leeren (Marker bleibt)
  let cleaned = false;
  if (process.env.BACKUP_RESTORE_TEST_KEEP !== "1") {
    try {
      await target.cmd(["FLUSHDB"]);
      await target.cmd(["SET", RESTORE_TEST_MARKER, JSON.stringify({ purpose: "EXSTASE Wiederherstellungstest", at: new Date().toISOString() })]);
      cleaned = true;
    } catch {
      steps.push({ label: "Testdatenbank leeren", ok: false, detail: "Bitte die Testdatenbank von Hand leeren" });
    }
  }
  return finish(ok && steps.every((s) => s.ok), { restoredKeys: payload.entries.length, cleaned });
}
