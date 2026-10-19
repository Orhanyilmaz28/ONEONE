import { randomBytes } from "node:crypto";
import path from "node:path";
import { raiseAlert } from "../monitoring/alerts";
import { type IncidentType, reportIncident } from "../monitoring/signal";
import { BackupDecryptError, BackupKeyMissingError, backupKeyConfigured, currentKeyId, decryptBackup, encryptBackup, sha256Hex } from "./crypto";
import { type BackupPayload, type CategorySummary, type ExcludedSummary, BackupFormatError, corruptEntries, manifestOf, parsePayload, summarize, validatePayload } from "./format";
import { type BackupLogEntry, type BackupState, type OpsStore, memoryOps, redisOps } from "./ops";
import { decideRetention, retentionPolicy } from "./retention";
import { type RedisClient, productionCredentials, restClient } from "./redis-rest";
import { BUSINESS_KEYS } from "./keys";
import { type ExportResult, exportFileStore, exportRedis } from "./snapshot";
import { type BackupStorage, StorageNotConfiguredError, configuredStorage } from "./storage";

/**
 * Datensicherung des EXSTASE-Shops: erstellen, auflisten, prüfen, aufräumen.
 * (Wiederherstellung: lib/backup/restore.ts)
 *
 * Ablauf einer Sicherung:
 * Sperre setzen → konsistent exportieren → Inhalt selbst prüfen → verschlüsseln → hochladen →
 * zurücklesen, entschlüsseln und mit dem Original vergleichen → erst dann die Beschreibung (.meta.json) schreiben.
 * Nur eine Sicherung MIT Beschreibung gilt als vollständig. Bei jedem Fehler: aufräumen, protokollieren, melden.
 */
export type BackupMeta = {
  formatVersion: 1;
  id: string;
  createdAt: string;
  status: "complete";
  trigger: "cron" | "manual" | "cli";
  file: string;
  size: number;
  sha256: string;
  keyId: string;
  entries: number;
  plainBytes: number;
  manifestSha256: string;
  summary: CategorySummary[];
  excluded: ExcludedSummary[];
  consistency: BackupPayload["consistency"];
  durationMs: number;
  /** Hinweise, z. B. beschädigte Datensätze (unverändert mitgesichert) */
  warnings?: string[];
  /** Anzahl vorhandener Geschäftsdatensätze (Bestellungen, Produkte, Konten …) – 0 = keine Geschäftsdaten gesichert */
  businessKeys?: number;
};

export type BackupListItem = {
  id: string;
  createdAt: string;
  size: number;
  status: "complete" | "damaged" | "incomplete";
  weekly: boolean;
  meta?: BackupMeta;
  problem?: string;
};

export class BackupBusyError extends Error {
  override name = "BackupBusyError";
  constructor() {
    super("Es läuft bereits eine Sicherung. Bitte warten, bis sie fertig ist.");
  }
}
export class BackupNotFoundError extends Error {
  override name = "BackupNotFoundError";
  constructor() {
    super("Diese Sicherung gibt es nicht (mehr).");
  }
}

export type Source = { kind: "redis"; redis: RedisClient } | { kind: "file"; file: string; mediaDir: string };

export type BackupDeps = {
  source: Source | null;
  storage: BackupStorage | null;
  ops: OpsStore;
  /** Produktions-Redis für Warnungen (Entprellung) – null lokal */
  alerts: RedisClient | null;
  now?: () => number;
};

/** Abhängigkeiten aus den Umgebungsvariablen */
export function defaultDeps(): BackupDeps {
  const prod = productionCredentials();
  const redis = prod ? restClient(prod.url, prod.token) : null;
  const source: Source | null = redis ? { kind: "redis", redis } : process.env.VERCEL ? null : { kind: "file", file: path.join(process.cwd(), ".data", "store.json"), mediaDir: path.join(process.cwd(), ".data", "media") };
  return { source, storage: configuredStorage(), ops: redis ? redisOps(redis) : memoryOps(), alerts: redis };
}

export const metaName = (id: string) => `${id}.meta.json`;
export const dataName = (id: string) => `${id}.exb`;
const ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[a-f0-9]{6}$/;
export const validBackupId = (id: string) => ID_RE.test(id);

export function newBackupId(at: Date) {
  return `${at.toISOString().slice(0, 19).replace(/:/g, "-")}Z-${randomBytes(3).toString("hex")}`;
}

const LOCK_SECONDS = 15 * 60;
const budgetMs = () => (Number(process.env.BACKUP_MAX_SECONDS) || 240) * 1000;

/** Fehlermeldung für Anzeige und Protokoll – ohne Zugangsdaten */
export function describeError(e: unknown): string {
  if (e instanceof BackupKeyMissingError || e instanceof StorageNotConfiguredError || e instanceof BackupBusyError || e instanceof BackupDecryptError || e instanceof BackupFormatError || e instanceof BackupNotFoundError) return e.message;
  if (e instanceof Error && ["SnapshotError", "S3Error", "RedisRequestError", "RestoreGuardError", "ProductionRestoreLockedError"].includes(e.name)) return e.message;
  return "Unerwarteter Fehler (Details im Server-Protokoll).";
}

async function safeLog(ops: OpsStore, entry: BackupLogEntry) {
  await ops.log(entry).catch(() => console.error("[backup] Protokoll konnte nicht geschrieben werden"));
}

/** Störung melden + Warnung vorbereiten */
export async function signalFailure(deps: BackupDeps, type: IncidentType, message: string) {
  reportIncident(type, message);
  let send: Parameters<typeof raiseAlert>[3];
  if (process.env.ALERT_EMAILS_ENABLED === "1") {
    send = async (draft, to) => {
      const { sendMail } = await import("../mail");
      const html = `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${draft.text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)}</pre>`;
      return (await sendMail({ to: { email: to }, subject: draft.subject, text: draft.text, html, tag: "monitor" })).ok;
    };
  }
  await raiseAlert(deps.alerts, type, message, send);
}

/**
 * Optionaler „Lebenszeichen“-Aufruf nach jeder erfolgreichen Sicherung (z. B. healthchecks.io, kostenlos).
 * Bleibt er aus – weil der Cron nicht lief, abstürzte oder fehlschlug –, schickt der Dienst selbst eine E-Mail.
 * So werden auch Ausfälle erkannt, bei denen dieser Code gar nicht mehr zum Melden kommt. Adresse wird nie protokolliert.
 */
export async function pingHeartbeat(url = process.env.BACKUP_HEARTBEAT_URL) {
  if (!url || !/^https:\/\//.test(url)) return false;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    console.error("[backup] Lebenszeichen konnte nicht gesendet werden");
    return false;
  }
}

async function exportSource(source: Source, deadline: number): Promise<ExportResult> {
  if (source.kind === "redis") return exportRedis(source.redis, { deadline });
  return exportFileStore(source.file, source.mediaDir);
}

export type BackupResult = { ok: true; meta: BackupMeta; removed: string[] } | { ok: false; error: string; busy?: boolean };

export async function runBackup(deps: BackupDeps, trigger: BackupMeta["trigger"]): Promise<BackupResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const createdAt = new Date(started);
  const id = newBackupId(createdAt);
  const fail = async (e: unknown, uploaded: boolean): Promise<BackupResult> => {
    const message = describeError(e);
    if (!(e instanceof Error && ["SnapshotError", "S3Error", "RedisRequestError"].includes(e.name)) && !(e instanceof BackupKeyMissingError) && !(e instanceof StorageNotConfiguredError)) console.error("[backup] Sicherung fehlgeschlagen", e instanceof Error ? e.name : "unbekannt");
    if (uploaded && deps.storage) await deps.storage.del(dataName(id)).catch(() => undefined); // halbe Sicherung entfernen
    await safeLog(deps.ops, { at: new Date(now()).toISOString(), action: "backup", ok: false, trigger, id, durationMs: now() - started, message: `Sicherung fehlgeschlagen: ${message}` });
    await deps.ops.patchState({ lastAttemptAt: createdAt.toISOString(), lastFailureAt: new Date(now()).toISOString(), lastFailureMessage: message }).catch(() => undefined);
    await signalFailure(deps, "backup_failed", message);
    return { ok: false, error: message };
  };

  if (!backupKeyConfigured()) return fail(new BackupKeyMissingError(), false);
  if (!deps.storage) return fail(new StorageNotConfiguredError(), false);
  if (!deps.source) return fail(new StorageNotConfiguredError("Kein Datenspeicher (Upstash Redis) verbunden – es gibt nichts zu sichern."), false);

  let locked = false;
  try {
    locked = await deps.ops.acquireLock(id, LOCK_SECONDS);
  } catch (e) {
    return fail(e, false);
  }
  if (!locked) {
    await safeLog(deps.ops, { at: new Date(now()).toISOString(), action: "backup", ok: false, trigger, message: "Übersprungen: Es läuft bereits eine Sicherung." });
    return { ok: false, error: new BackupBusyError().message, busy: true };
  }

  let uploaded = false;
  try {
    const deadline = started + budgetMs();
    const exported = await exportSource(deps.source, deadline);
    const payload: BackupPayload = {
      format: "exstase-backup",
      version: 1,
      id,
      createdAt: createdAt.toISOString(),
      source: { kind: deps.source.kind, target: deps.source.kind === "redis" ? sha256Hex(deps.source.redis.target).slice(0, 12) : "lokal" },
      consistency: exported.consistency,
      entries: exported.entries,
      summary: summarize(exported.entries),
      excluded: exported.excluded,
      manifest: manifestOf(exported.entries),
    };
    validatePayload(payload); // Selbstprüfung vor dem Verschlüsseln
    const corrupt = corruptEntries(payload.entries);
    if (corrupt.length) reportIncident("data_corrupt", `bei der Sicherung gefunden: ${corrupt.join(", ")}`);
    const businessKeys = payload.entries.filter((e) => BUSINESS_KEYS.includes(e.k)).length;
    const warnings = [
      ...(businessKeys === 0 ? ["Diese Sicherung enthält KEINE Geschäftsdaten (keine Bestellungen, Produkte, Konten oder Einstellungen). Ist die richtige Datenbank verbunden?"] : []),
      ...corrupt.map((k) => `Beschädigter Datensatz unverändert gesichert: ${k}`),
    ];
    const plain = Buffer.from(JSON.stringify(payload), "utf8");
    const file = encryptBackup(plain, { id, createdAt: payload.createdAt });
    if (now() > deadline) throw Object.assign(new Error("Zeitlimit der Sicherung überschritten – abgebrochen."), { name: "SnapshotError" });

    uploaded = true;
    await deps.storage.put(dataName(id), file);
    // Zurücklesen und vollständig prüfen, bevor die Sicherung als vollständig gilt
    const back = await deps.storage.get(dataName(id));
    if (!back || back.length !== file.length || sha256Hex(back) !== sha256Hex(file)) throw Object.assign(new Error("Hochgeladene Datei weicht ab – Sicherung verworfen."), { name: "S3Error" });
    const check = parsePayload(decryptBackup(back).plain);
    if (check.manifest.sha256 !== payload.manifest.sha256) throw new BackupFormatError("Prüfung nach dem Hochladen fehlgeschlagen.");

    const meta: BackupMeta = {
      formatVersion: 1,
      id,
      createdAt: payload.createdAt,
      status: "complete",
      trigger,
      file: dataName(id),
      size: file.length,
      sha256: sha256Hex(file),
      keyId: currentKeyId() ?? "",
      entries: payload.manifest.count,
      plainBytes: plain.length,
      manifestSha256: payload.manifest.sha256,
      summary: payload.summary,
      excluded: payload.excluded,
      consistency: payload.consistency,
      durationMs: now() - started,
      businessKeys,
      ...(warnings.length ? { warnings } : {}),
    };
    await deps.storage.put(metaName(id), Buffer.from(JSON.stringify(meta, null, 2)), "application/json");
    uploaded = false;

    // Eine Sicherung ohne Geschäftsdaten zählt nicht als Erfolg – sonst bliebe „überfällig“ trotz falscher Datenbank stumm
    await deps.ops.patchState(businessKeys > 0 ? { lastAttemptAt: meta.createdAt, lastSuccessAt: meta.createdAt, lastSuccessId: id } : { lastAttemptAt: meta.createdAt }).catch(() => undefined);
    await safeLog(deps.ops, { at: new Date(now()).toISOString(), action: "backup", ok: true, trigger, id, durationMs: meta.durationMs, message: `Sicherung vollständig: ${meta.entries} Einträge, ${Math.round(meta.size / 1024)} KB verschlüsselt.${warnings.length ? ` Achtung: ${warnings.join(" ")}` : ""}` });
    if (businessKeys === 0) await signalFailure(deps, "backup_failed", "Sicherung ohne Geschäftsdaten – falsche oder leere Datenbank verbunden?");
    if (businessKeys > 0) await pingHeartbeat();

    let removed: string[] = [];
    try {
      removed = await applyRetention(deps);
      if (removed.length) await safeLog(deps.ops, { at: new Date(now()).toISOString(), action: "retention", ok: true, message: `${removed.length} abgelaufene Sicherung(en) gelöscht.` });
    } catch (e) {
      await safeLog(deps.ops, { at: new Date(now()).toISOString(), action: "retention", ok: false, message: `Aufräumen fehlgeschlagen: ${describeError(e)} – die neue Sicherung ist trotzdem vollständig.` });
    }
    return { ok: true, meta, removed };
  } catch (e) {
    return fail(e, uploaded);
  } finally {
    await deps.ops.releaseLock(id).catch(() => undefined);
  }
}

/** Alle Sicherungen im Speicher, neueste zuerst. Ohne gültige Beschreibung: „unvollständig“. */
export async function listBackups(storage: BackupStorage): Promise<BackupListItem[]> {
  const objects = await storage.list();
  const data = new Map(objects.filter((o) => o.key.endsWith(".exb")).map((o) => [o.key.slice(0, -4), o]));
  const metas = objects.filter((o) => o.key.endsWith(".meta.json")).map((o) => o.key.slice(0, -10));
  const items: BackupListItem[] = [];
  for (const id of metas) {
    if (!validBackupId(id)) continue;
    let meta: BackupMeta | undefined;
    try {
      const raw = await storage.get(metaName(id));
      meta = raw ? (JSON.parse(raw.toString("utf8")) as BackupMeta) : undefined;
    } catch {
      meta = undefined;
    }
    const d = data.get(id);
    data.delete(id);
    if (!meta || meta.status !== "complete" || meta.id !== id) items.push({ id, createdAt: meta?.createdAt ?? idDate(id), size: d?.size ?? 0, status: "damaged", weekly: false, problem: "Beschreibung fehlt oder ist beschädigt" });
    else if (!d) items.push({ id, createdAt: meta.createdAt, size: 0, status: "damaged", weekly: false, meta, problem: "Sicherungsdatei fehlt" });
    else if (d.size !== meta.size) items.push({ id, createdAt: meta.createdAt, size: d.size, status: "damaged", weekly: false, meta, problem: "Dateigröße stimmt nicht" });
    else items.push({ id, createdAt: meta.createdAt, size: d.size, status: "complete", weekly: false, meta });
  }
  for (const [id, d] of data) if (validBackupId(id)) items.push({ id, createdAt: idDate(id), size: d.size, status: "incomplete", weekly: false, problem: "Abgebrochen – keine Beschreibung" });
  const complete = items.filter((i) => i.status === "complete");
  const { weekly } = decideRetention(complete, Date.now(), retentionPolicy());
  for (const i of items) i.weekly = weekly.has(i.id);
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function idDate(id: string) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z` : new Date(0).toISOString();
}

/** Abgelaufene Sicherungen und Reste abgebrochener Läufe löschen. Liefert die gelöschten IDs. */
export async function applyRetention(deps: Pick<BackupDeps, "storage" | "now">): Promise<string[]> {
  if (!deps.storage) return [];
  const now = (deps.now ?? Date.now)();
  const items = await listBackups(deps.storage);
  const complete = items.filter((i) => i.status === "complete");
  if (!complete.length) return []; // ohne eine einzige vollständige Sicherung wird nichts gelöscht
  const { remove } = decideRetention(
    complete.map((i) => ({ id: i.id, createdAt: i.createdAt, hasData: i.meta?.businessKeys !== 0 })),
    now,
    retentionPolicy(),
  );
  const removeSet = new Set(remove);
  // Reste: unvollständig/beschädigt und älter als 6 Stunden (ein laufender Vorgang wird nie angefasst)
  for (const i of items) if (i.status !== "complete" && now - Date.parse(i.createdAt) > 6 * 3600_000) removeSet.add(i.id);
  for (const id of removeSet) {
    // erst die Beschreibung, dann die Datei – so gilt eine halb gelöschte Sicherung nie als vollständig
    await deps.storage.del(metaName(id));
    await deps.storage.del(dataName(id));
  }
  return [...removeSet];
}

export type CheckStep = { label: string; ok: boolean; detail?: string };
export type VerifyReport = { ok: boolean; id: string; steps: CheckStep[]; payload?: BackupPayload };

/** Sicherung laden und vollständig prüfen (ohne irgendetwas wiederherzustellen) */
export async function verifyBackup(storage: BackupStorage, id: string, opts: { keepPayload?: boolean } = {}): Promise<VerifyReport> {
  const steps: CheckStep[] = [];
  const done = (ok: boolean, payload?: BackupPayload): VerifyReport => ({ ok, id, steps, ...(opts.keepPayload && payload ? { payload } : {}) });
  if (!validBackupId(id)) {
    steps.push({ label: "Sicherung auswählen", ok: false, detail: "Ungültige Kennung" });
    return done(false);
  }
  const metaRaw = await storage.get(metaName(id));
  let meta: BackupMeta | null = null;
  try {
    meta = metaRaw ? (JSON.parse(metaRaw.toString("utf8")) as BackupMeta) : null;
  } catch {}
  if (!meta || meta.status !== "complete") {
    steps.push({ label: "Sicherung auswählen", ok: false, detail: "Beschreibung fehlt oder ist beschädigt – Sicherung gilt als unvollständig" });
    return done(false);
  }
  steps.push({ label: "Sicherung auswählen", ok: true, detail: `${meta.entries} Einträge, erstellt ${meta.createdAt}` });
  const file = await storage.get(dataName(id));
  if (!file) {
    steps.push({ label: "Datei laden", ok: false, detail: "Sicherungsdatei fehlt" });
    return done(false);
  }
  const fileOk = file.length === meta.size && sha256Hex(file) === meta.sha256;
  steps.push({ label: "Prüfsumme der Datei", ok: fileOk, detail: fileOk ? "SHA-256 stimmt" : "Datei wurde verändert oder ist beschädigt" });
  if (!fileOk) return done(false);
  let plain: Buffer;
  try {
    plain = decryptBackup(file).plain;
    steps.push({ label: "Entschlüsseln (AES-256-GCM)", ok: true, detail: "Echtheit bestätigt" });
  } catch (e) {
    steps.push({ label: "Entschlüsseln (AES-256-GCM)", ok: false, detail: describeError(e) });
    return done(false);
  }
  let payload: BackupPayload;
  try {
    payload = parsePayload(plain);
  } catch (e) {
    steps.push({ label: "Datenstruktur prüfen", ok: false, detail: describeError(e) });
    return done(false);
  }
  const same = payload.id === id && payload.manifest.sha256 === meta.manifestSha256 && payload.manifest.count === meta.entries;
  steps.push({ label: "Datenstruktur prüfen", ok: same, detail: same ? `${payload.manifest.count} Einträge, alle Prüfsummen stimmen` : "Inhalt passt nicht zur Beschreibung" });
  return done(same, payload);
}

/** Zusammenfassung für das Dashboard */
export type BackupOverview = {
  configured: { key: boolean; storage: boolean; source: boolean; cron: boolean; restoreTarget: boolean };
  storageLabel?: string;
  state: BackupState;
  backups: BackupListItem[];
  totalBytes: number;
  nextScheduled: string | null;
  overdue: boolean;
  log: BackupLogEntry[];
  listError?: string;
};

export const cronEnabled = () => process.env.BACKUP_CRON_ENABLED === "1";
export const cronHourUtc = () => {
  const h = Math.round(Number(process.env.BACKUP_CRON_HOUR_UTC));
  return h >= 0 && h <= 23 && process.env.BACKUP_CRON_HOUR_UTC ? h : 3;
};
export const maxAgeHours = () => Number(process.env.BACKUP_MAX_AGE_HOURS) || 26;

export function nextScheduled(now: number): string | null {
  if (!cronEnabled()) return null;
  const d = new Date(now);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cronHourUtc()));
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export function isOverdue(lastSuccessAt: string | undefined, now: number) {
  return !lastSuccessAt || now - Date.parse(lastSuccessAt) > maxAgeHours() * 3600_000;
}

export async function backupOverview(deps: BackupDeps): Promise<BackupOverview> {
  const now = (deps.now ?? Date.now)();
  const { restoreTestCredentials } = await import("./redis-rest");
  const [state, log] = await Promise.all([deps.ops.getState().catch(() => ({}) as BackupState), deps.ops.readLog(30).catch(() => [])]);
  let backups: BackupListItem[] = [];
  let listError: string | undefined;
  if (deps.storage) {
    try {
      backups = await listBackups(deps.storage);
    } catch (e) {
      listError = describeError(e);
    }
  }
  const newest = backups.find((b) => b.status === "complete");
  const lastSuccessAt = [state.lastSuccessAt, newest?.createdAt].filter(Boolean).sort().at(-1);
  return {
    configured: { key: backupKeyConfigured(), storage: Boolean(deps.storage), source: Boolean(deps.source), cron: cronEnabled(), restoreTarget: Boolean(restoreTestCredentials()) },
    storageLabel: deps.storage?.label,
    state: { ...state, lastSuccessAt },
    backups,
    totalBytes: backups.reduce((n, b) => n + b.size, 0),
    nextScheduled: nextScheduled(now),
    overdue: isOverdue(lastSuccessAt, now),
    log,
    listError,
  };
}

/** Überwachung: überfällige Sicherung und Fehlerhäufung prüfen (vom Cron-Aufruf und vom Dashboard) */
export async function checkHealth(deps: BackupDeps): Promise<{ overdue: boolean; errorsLastHour: number; spike: boolean }> {
  const now = (deps.now ?? Date.now)();
  const state = await deps.ops.getState().catch(() => ({}) as BackupState);
  const overdue = cronEnabled() && isOverdue(state.lastSuccessAt, now);
  if (overdue) await signalFailure(deps, "backup_overdue", state.lastSuccessAt ? `letzte erfolgreiche Sicherung: ${state.lastSuccessAt}` : "noch keine erfolgreiche Sicherung");
  let errorsLastHour = 0;
  if (deps.alerts) {
    const { hourKey } = await import("../monitoring/signal");
    const keys = [hourKey(new Date(now)), hourKey(new Date(now - 3600_000))];
    const res = await deps.alerts.pipeline(keys.map((k) => ["HGETALL", k])).catch(() => []);
    // aktuelle + vorige Stunde (gleitend genug für eine Warnung)
    for (const r of res) {
      const flat = Array.isArray(r.result) ? (r.result as string[]) : [];
      for (let i = 1; i < flat.length; i += 2) errorsLastHour += Number(flat[i]) || 0;
    }
  }
  const threshold = Number(process.env.MONITOR_ERROR_THRESHOLD) || 50;
  const spike = errorsLastHour >= threshold;
  if (spike) await signalFailure(deps, "error_spike", `${errorsLastHour} Störungen in den letzten zwei Stunden`);
  return { overdue, errorsLastHour, spike };
}
