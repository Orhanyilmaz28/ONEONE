import { promises as fs } from "node:fs";
import path from "node:path";
import { type BackupEntry, type EntryType, type EntryValue, type ExcludedSummary, entryHash } from "./format";
import { BUSINESS_KEYS, VERSION_PREFIX, classifyKey, versionKeyOf } from "./keys";
import type { Cmd, RedisClient } from "./redis-rest";

/**
 * Datenexport aus Redis mit nachweisbar konsistentem Stand.
 *
 * Warum nicht einfach SCAN + GET? SCAN liefert keinen Schnappschuss: Während des Lesens können sich Werte ändern,
 * dann passen z. B. Bestellungen und Provisionen nicht mehr zusammen. Deshalb:
 *
 * 1. Medien (Bilder, Nachweise, Pässe) werden zuerst gelesen. Sie ändern sich nie (die ID ist ein Fingerabdruck des Inhalts).
 * 2. Alle versionierten Geschäftsdaten (Phase 2A: jeder Schreibvorgang erhöht atomar tt:ver:<schlüssel>) werden
 *    zusammen mit ihrem Versionszähler gelesen (MGET – atomar je Paar). Danach werden alle Versionszähler in EINEM
 *    atomaren MGET erneut gelesen. Stimmen alle überein, galten alle gelesenen Werte gleichzeitig zu genau diesem
 *    Zeitpunkt → echter Schnappschuss. Hat sich etwas geändert, werden nur die geänderten Werte neu gelesen
 *    (höchstens MAX_ROUNDS Runden). Klappt das nicht, schlägt die Sicherung fehl – sie wird nie als erfolgreich markiert.
 * 3. Zum Schluss ein zweiter Durchgang über die Medien: Bilder, die während des Exports hochgeladen und im
 *    Schnappschuss schon verwendet werden, kommen so noch mit.
 *
 * Verbleibende Einschränkung: Schlüssel ohne Versionszähler (Einmal-Marker, Sicherheitsprotokoll) werden nur einmal
 * gelesen – sie werden nur angehängt/angelegt, nie inhaltlich umgeschrieben, deshalb ist das unkritisch.
 */
export const MAX_ROUNDS = 8;
const SCAN_COUNT = 1000;
const MAX_KEYS = 200_000;
/** Höchstmenge je Sammelanfrage (Bytes) – große Werte werden einzeln gelesen */
const BATCH_BYTES = Number(process.env.BACKUP_BATCH_BYTES) || 2 * 1024 * 1024;

export class SnapshotError extends Error {
  override name = "SnapshotError";
}

export type ExportResult = {
  entries: BackupEntry[];
  excluded: ExcludedSummary[];
  consistency: { method: string; snapshotAt: string; rounds: number; versionedKeys: number };
};

type Deadline = () => void;

const KNOWN_STRING = (k: string) => k.startsWith("tt:media:") || k.startsWith("tt:once:") || k.startsWith(VERSION_PREFIX) || BUSINESS_KEYS.includes(k);

async function scanAll(redis: RedisClient, check: Deadline): Promise<string[]> {
  const keys = new Set<string>();
  let cursor = "0";
  do {
    check();
    const [next, batch] = await redis.cmd<[string, string[]]>(["SCAN", cursor, "COUNT", SCAN_COUNT]);
    if (!Array.isArray(batch)) throw new SnapshotError("SCAN lieferte keine Liste.");
    for (const k of batch) keys.add(k);
    if (keys.size > MAX_KEYS) throw new SnapshotError("Zu viele Schlüssel für eine Sicherung.");
    cursor = String(next);
  } while (cursor !== "0");
  return [...keys];
}

/** Pipeline in Stücken; jeder Fehler eines Einzelbefehls bricht ab */
async function pipe(redis: RedisClient, cmds: Cmd[], size = 200): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < cmds.length; i += size) {
    const res = await redis.pipeline(cmds.slice(i, i + size));
    for (const r of res) {
      if (r.error) throw new SnapshotError("Redis meldete einen Fehler beim Lesen.");
      out.push(r.result);
    }
  }
  return out;
}

const pairs = (flat: unknown): [string, string][] => {
  const a = Array.isArray(flat) ? (flat as unknown[]).map(String) : [];
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]);
  return out;
};

/** Strings lesen – nach Größe gebündelt, große einzeln. Fehlende Schlüssel (inzwischen gelöscht) entfallen. */
async function readStrings(redis: RedisClient, keys: string[], check: Deadline): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!keys.length) return out;
  const sizes = (await pipe(redis, keys.map((k) => ["STRLEN", k]))) as number[];
  let batch: string[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    check();
    const vals = (await redis.cmd<(string | null)[]>(["MGET", ...batch])) ?? [];
    if (vals.length !== batch.length) throw new SnapshotError("Unvollständige Antwort beim Lesen.");
    batch.forEach((k, i) => {
      if (vals[i] !== null && vals[i] !== undefined) out.set(k, vals[i] as string);
    });
    batch = [];
    bytes = 0;
  };
  for (const [i, k] of keys.entries()) {
    const n = Number(sizes[i]) || 0;
    if (n > BATCH_BYTES) {
      check();
      const v = await redis.cmd<string | null>(["GET", k]);
      if (v !== null) out.set(k, v);
      continue;
    }
    if (bytes + n > BATCH_BYTES || batch.length >= 100) await flush();
    batch.push(k);
    bytes += n;
  }
  await flush();
  return out;
}

function makeEntry(k: string, t: EntryType, v: EntryValue, ttl?: number): BackupEntry {
  return { k, t, v, ...(ttl && ttl > 0 ? { ttl } : {}), h: entryHash(t, v) };
}

export async function exportRedis(redis: RedisClient, opts: { deadline?: number } = {}): Promise<ExportResult> {
  const check: Deadline = () => {
    if (opts.deadline && Date.now() > opts.deadline) throw new SnapshotError("Zeitlimit der Sicherung überschritten – abgebrochen.");
  };

  // ── Schlüssel ermitteln und einordnen ──
  const scanned = await scanAll(redis, check);
  const all = new Set([...scanned, ...BUSINESS_KEYS]);
  const excluded = new Map<string, ExcludedSummary>();
  const included: string[] = [];
  for (const k of all) {
    const c = classifyKey(k);
    if (c.include) included.push(k);
    else if (scanned.includes(k)) {
      const cur = excluded.get(c.category) ?? { category: c.category, count: 0, reason: c.reason ?? "" };
      cur.count++;
      excluded.set(c.category, cur);
    }
  }
  const scannedSet = new Set(scanned);
  // Versioniert: alle Geschäftsdaten und jeder Wert, zu dem ein Versionszähler existiert
  const versioned = included.filter((k) => !k.startsWith(VERSION_PREFIX) && (BUSINESS_KEYS.includes(k) || scannedSet.has(versionKeyOf(k))));
  const versionedSet = new Set(versioned);
  const rest = included.filter((k) => !versionedSet.has(k) && !k.startsWith(VERSION_PREFIX));

  // ── Typen der übrigen Schlüssel ──
  const unknownType = rest.filter((k) => !KNOWN_STRING(k));
  const types = new Map<string, string>(rest.filter(KNOWN_STRING).map((k) => [k, "string"]));
  if (unknownType.length) {
    const t = (await pipe(redis, unknownType.map((k) => ["TYPE", k]))) as string[];
    unknownType.forEach((k, i) => types.set(k, String(t[i])));
  }

  const entries: BackupEntry[] = [];

  // ── 1. Unversionierte Werte (Medien, Marker, Listen …) ──
  async function readRest(keys: string[]) {
    const strings = keys.filter((k) => types.get(k) === "string");
    const values = await readStrings(redis, strings, check);
    const withTtl = keys.filter((k) => !k.startsWith("tt:media:") && types.get(k) !== "none");
    const ttls = new Map<string, number>();
    if (withTtl.length) {
      const r = (await pipe(redis, withTtl.map((k) => ["PTTL", k]))) as number[];
      withTtl.forEach((k, i) => ttls.set(k, Number(r[i])));
    }
    for (const k of strings) {
      const v = values.get(k);
      if (v === undefined) continue; // zwischenzeitlich gelöscht
      const ttl = ttls.get(k);
      if (ttl === -2) continue;
      entries.push(makeEntry(k, "string", v, ttl));
    }
    for (const k of keys) {
      const t = types.get(k);
      if (t === "string" || t === "none") continue;
      check();
      const ttl = ttls.get(k);
      if (ttl === -2) continue;
      if (t === "list") entries.push(makeEntry(k, "list", ((await redis.cmd<string[]>(["LRANGE", k, 0, -1])) ?? []).map(String), ttl));
      else if (t === "set") entries.push(makeEntry(k, "set", ((await redis.cmd<string[]>(["SMEMBERS", k])) ?? []).map(String), ttl));
      else if (t === "hash") entries.push(makeEntry(k, "hash", Object.fromEntries(pairs(await redis.cmd(["HGETALL", k]))), ttl));
      else if (t === "zset") entries.push(makeEntry(k, "zset", pairs(await redis.cmd(["ZRANGE", k, 0, -1, "WITHSCORES"])), ttl));
      else throw new SnapshotError(`Datentyp „${t}“ wird nicht unterstützt (${k}) – Sicherung abgebrochen.`);
    }
  }
  await readRest(rest);

  // ── 2. Versionierte Geschäftsdaten: Schnappschuss über Versionszähler ──
  const got = new Map<string, { raw: string | null; ver: string }>();
  let pending = [...versioned];
  let rounds = 0;
  let snapshotAt = "";
  while (true) {
    if (++rounds > MAX_ROUNDS) throw new SnapshotError("Daten haben sich während der Sicherung ständig geändert – kein konsistenter Stand erreichbar. Sicherung nicht abgeschlossen.");
    check();
    const sizes = (await pipe(redis, pending.map((k) => ["STRLEN", k]))) as number[];
    let batch: string[] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      check();
      const vals = (await redis.cmd<(string | null)[]>(["MGET", ...batch.flatMap((k) => [k, versionKeyOf(k)])])) ?? [];
      if (vals.length !== batch.length * 2) throw new SnapshotError("Unvollständige Antwort beim Lesen.");
      batch.forEach((k, i) => got.set(k, { raw: vals[2 * i] ?? null, ver: vals[2 * i + 1] ?? "0" }));
      batch = [];
      bytes = 0;
    };
    for (const [i, k] of pending.entries()) {
      const n = Number(sizes[i]) || 0;
      if (batch.length && (bytes + n > BATCH_BYTES || batch.length >= 50)) await flush();
      batch.push(k);
      bytes += n;
    }
    await flush();
    // alle Versionszähler in EINEM atomaren Befehl
    const now = (await redis.cmd<(string | null)[]>(["MGET", ...versioned.map(versionKeyOf)])) ?? [];
    if (now.length !== versioned.length) throw new SnapshotError("Unvollständige Antwort beim Prüfen der Versionen.");
    pending = versioned.filter((k, i) => got.get(k)?.ver !== (now[i] ?? "0"));
    if (!pending.length) {
      snapshotAt = new Date().toISOString();
      break;
    }
  }
  for (const k of versioned) {
    const g = got.get(k);
    if (!g) continue;
    if (g.raw !== null) entries.push(makeEntry(k, "string", g.raw));
    if (g.ver !== "0") entries.push(makeEntry(versionKeyOf(k), "string", g.ver));
  }
  // Versionszähler ohne zugehörigen Wert (sollte nicht vorkommen) trotzdem sichern
  const orphanVersions = included.filter((k) => k.startsWith(VERSION_PREFIX) && !versionedSet.has(k.slice(VERSION_PREFIX.length)));
  if (orphanVersions.length) {
    const v = await readStrings(redis, orphanVersions, check);
    for (const [k, val] of v) entries.push(makeEntry(k, "string", val));
  }

  // ── 3. Medien, die während des Exports hinzukamen ──
  const have = new Set(entries.map((e) => e.k));
  const late = (await scanAll(redis, check)).filter((k) => k.startsWith("tt:media:") && !have.has(k) && classifyKey(k).include);
  if (late.length) {
    for (const k of late) types.set(k, "string");
    await readRest(late);
  }

  entries.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return {
    entries,
    excluded: [...excluded.values()],
    consistency: { method: "Versionszähler-Schnappschuss (Phase 2A) + unveränderliche Medien", snapshotAt, rounds, versionedKeys: versioned.length },
  };
}

/** Lokaler Datenspeicher (.data/store.json + .data/media) – nur Entwicklung */
export async function exportFileStore(file: string, mediaDir: string): Promise<ExportResult> {
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new SnapshotError("Lokale Datendatei nicht lesbar oder beschädigt.");
  }
  const entries: BackupEntry[] = [];
  const excluded = new Map<string, ExcludedSummary>();
  for (const [k, v] of Object.entries(all)) {
    const c = classifyKey(k);
    if (!c.include) {
      const cur = excluded.get(c.category) ?? { category: c.category, count: 0, reason: c.reason ?? "" };
      cur.count++;
      excluded.set(c.category, cur);
      continue;
    }
    entries.push(makeEntry(k, "string", JSON.stringify(v)));
  }
  try {
    for (const name of await fs.readdir(mediaDir)) {
      const data = await fs.readFile(path.join(mediaDir, name));
      entries.push(makeEntry(`tt:media:${name}`, "string", data.toString("base64")));
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new SnapshotError("Lokale Medien nicht lesbar.");
  }
  entries.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return { entries, excluded: [...excluded.values()], consistency: { method: "Lokale Datei (atomar geschrieben)", snapshotAt: new Date().toISOString(), rounds: 1, versionedKeys: 0 } };
}
