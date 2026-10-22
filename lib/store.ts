import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "node:fs";
import path from "node:path";
import { reportIncident } from "./monitoring/signal";

/**
 * Kleiner Datenspeicher für alles, was im Dashboard geändert wird
 * (Produkt-Anpassungen, Einstellungen, Bewertungen, Newsletter, Versandstatus).
 *
 * - Online (Vercel): Upstash Redis über die REST-API – Zugangsdaten kommen automatisch,
 *   wenn man in Vercel unter „Storage“ eine Upstash-Datenbank verbindet
 *   (UPSTASH_REDIS_REST_URL/_TOKEN oder KV_REST_API_URL/_TOKEN).
 * - Lokal (npm run dev / start): Datei .data/store.json
 * - Online ohne Datenbank: nur lesen (Standardwerte), Speichern ist nicht möglich.
 */

export type StoreKind = "redis" | "file" | "none";

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
const FILE = path.join(process.cwd(), ".data", "store.json");

/** Alle Schlüssel an einer Stelle */
export const KEYS = {
  products: "tt:products",
  settings: "tt:settings",
  reviews: "tt:reviews",
  newsletter: "tt:newsletter",
  orders: "tt:orders",
  /** Neue und inhaltlich bearbeitete Produkte */
  custom: "tt:custom",
  /** Kundenkonten */
  customers: "tt:customers",
  /** Kundenkonten ein/aus */
  accounts: "tt:accounts",
  /** KI-Kennzeichnung je Medium (Dashboard „KI-Kennzeichnung“) */
  aiMedia: "tt:ai-media",
  /** E-Mail-Einstellungen (Dashboard → Einstellungen → E-Mails) */
  mail: "tt:mail",
  /** Passwortschutz für den ganzen Shop (Dashboard → Einstellungen) */
  siteLock: "tt:site-lock",
  /** Händler-Anfragen (Registrierung auf /haendler) */
  dealers: "tt:dealers",
  /** Händlerpreise (netto) je Produkt */
  dealerPrices: "tt:dealer-prices",
  /** Händlerstufen (Name + Prozent) */
  dealerTiers: "tt:dealer-tiers",
  /** Artikelpässe (PDF) je Produkt – nur für freigegebene Händler */
  dealerPasses: "tt:dealer-passes",
  /** Händler-Bestellungen (auf Rechnung) */
  dealerOrders: "tt:dealer-orders",
  /** Nachrichten an Händler (Händlerbereich → Nachrichten) */
  dealerMessages: "tt:dealer-messages",
  /** Bankverbindung und Zahlungsziel für Händler-Rechnungen */
  dealerInvoiceSettings: "tt:dealer-invoice-settings",
  /** Letzte Messung der Speicherbelegung (Dashboard → Speicher) */
  storageUsage: "tt:storage-usage",
  /** Speicher-Limit des Upstash-Tarifs in MB (Dashboard → Speicher) */
  storageLimit: "tt:storage-limit",
  /** Influencer (Registrierung, Code, Zugang) – Dashboard → Influencer */
  influencers: "tt:influencers",
  /** Provisionen je Bestellung mit Influencer-Code */
  commissions: "tt:commissions",
  /** Monatliche Provisionsgutschriften an Influencer */
  influencerStatements: "tt:influencer-statements",
  /** Büroverwaltung: Zugänge für Büro-Mitarbeiter:innen (Rollen, Passwort-Hash, 2FA verschlüsselt) */
  officeUsers: "tt:office-users",
  /** Büroverwaltung: welche Bestellung wann in einen Excel-Export aufgenommen wurde */
  officeExported: "tt:office-exported",
  /** Büroverwaltung (Phase 3B, nur noch gelesen): früheres gemeinsames Lieferschein-Nummernbuch */
  officeDeliveryNotes: "tt:office-delivery-notes",
  /** Büroverwaltung: Zähler der Lieferscheinnummern je Jahr (die Lieferscheine selbst liegen je Bestellung unter tt:office-ls:<Bestellung>) */
  officeNoteSeq: "tt:office-ls-seq",
  /** Kundenservice (Phase 3E): Nummernzähler je Jahr + Liste aller Fallnummern (die Fälle selbst liegen unter tt:office-ticket:<Nummer>) */
  officeTickets: "tt:office-tickets",
  /** Rechnungen für Privatbestellungen: Nummernzähler je Jahr (die Rechnungen selbst liegen unter tt:office-re:<Bestellung>) */
  officeInvoiceSeq: "tt:office-re-seq",
} as const;

export function storeKind(): StoreKind {
  if (REDIS_URL && REDIS_TOKEN) return "redis";
  // Auf Vercel ist das Dateisystem schreibgeschützt
  if (process.env.VERCEL) return "none";
  return "file";
}

/* ───────────── Fehlerarten ─────────────
 * Ein Ausfall darf nie wie eine leere Datenbank behandelt werden. Deshalb unterscheiden wir:
 * - Datensatz existiert nicht      → Standardwert (fallback), kein Fehler
 * - kein Speicher verbunden        → StoreUnavailableError
 * - Redis nicht erreichbar/Fehler  → StoreUnreachableError
 * - Zeitüberschreitung             → StoreTimeoutError
 * - gespeicherte Daten ungültig    → StoreDataError (wird nie überschrieben)
 * - Schreibkonflikt nach Versuchen → WriteConflictError
 */
export class StoreError extends Error {
  override name = "StoreError";
}

export class StoreUnavailableError extends StoreError {
  override name = "StoreUnavailableError";
  constructor() {
    super("Kein Datenspeicher verbunden. Bitte in Vercel unter „Storage“ eine Upstash-Redis-Datenbank verbinden.");
  }
}
export class StoreUnreachableError extends StoreError {
  override name = "StoreUnreachableError";
  constructor(detail?: string) {
    super(`Datenspeicher nicht erreichbar${detail ? ` (${detail})` : ""}. Bitte gleich noch einmal versuchen.`);
  }
}
export class StoreTimeoutError extends StoreError {
  override name = "StoreTimeoutError";
  constructor() {
    super("Der Datenspeicher antwortet nicht rechtzeitig. Bitte gleich noch einmal versuchen.");
  }
}
export class StoreDataError extends StoreError {
  override name = "StoreDataError";
  constructor(public readonly key: string) {
    super(`Gespeicherte Daten unter „${key}“ sind beschädigt – es wurde nichts geändert.`);
  }
}
export class WriteConflictError extends StoreError {
  override name = "WriteConflictError";
  constructor(public readonly key: string) {
    super("Gerade wurden dieselben Daten gleichzeitig geändert. Bitte noch einmal versuchen.");
  }
}

/** Zeitlimit je Redis-Anfrage */
const TIMEOUT_MS = Number(process.env.STORE_TIMEOUT_MS) || 8000;

/** Ein Redis-Befehl über die Upstash-REST-Schnittstelle – mit Zeitlimit und klaren Fehlerarten */
async function redis<T>(command: (string | number)[]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      reportIncident("redis_timeout", String(command[0]));
      throw new StoreTimeoutError();
    }
    reportIncident("redis_unreachable", "Netzwerk");
    throw new StoreUnreachableError("Netzwerk");
  }
  if (!res.ok) {
    reportIncident("redis_unreachable", `HTTP ${res.status}`);
    throw new StoreUnreachableError(`HTTP ${res.status}`);
  }
  let body: { result?: T; error?: string };
  try {
    body = (await res.json()) as { result?: T; error?: string };
  } catch {
    reportIncident("redis_unreachable", "ungültige Antwort");
    throw new StoreUnreachableError("ungültige Antwort");
  }
  if (body.error) {
    reportIncident("redis_unreachable", `Redis-Fehler bei ${String(command[0])}`);
    throw new StoreUnreachableError("Redis-Fehler");
  }
  return body.result as T;
}

function parse<T>(key: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    reportIncident("data_corrupt", key);
    throw new StoreDataError(key);
  }
}

/* ───────────── Lokale Datei ─────────────
 * Alle Dateizugriffe (Werte, Einmal-Sperren) laufen über EINE Warteschlange – Lesen, Ändern und Schreiben
 * passieren damit nie gleichzeitig. Eine beschädigte Datei wird nie überschrieben.
 */
async function readFileStore(): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await fs.readFile(FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new StoreUnreachableError("Datei nicht lesbar");
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    reportIncident("data_corrupt", "lokale Datei");
    throw new StoreDataError(FILE);
  }
}

async function writeFileStore(all: Record<string, unknown>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // erst in eine Zwischendatei, dann umbenennen – ein Abbruch hinterlässt nie eine halbe Datei
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(all, null, 2));
  await fs.rename(tmp, FILE);
}

let fileQueue: Promise<unknown> = Promise.resolve();
function withFile<R>(fn: () => Promise<R>): Promise<R> {
  const run = fileQueue.then(fn);
  fileQueue = run.catch(() => undefined);
  return run;
}

/* ───────────── Versionierte JSON-Werte (Redis) ─────────────
 * Jeder JSON-Wert bekommt einen Versionszähler (tt:ver:<schlüssel>). Ändern = Wert + Version gemeinsam lesen (MGET, atomar),
 * neu berechnen und nur speichern, wenn die Version noch dieselbe ist (Lua-Skript, atomar). Sonst neu lesen und erneut
 * versuchen – höchstens MAX_ATTEMPTS-mal. Der Wert selbst bleibt unverändert im bisherigen Format.
 */
const versionKey = (key: string) => `tt:ver:${key}`;
const MAX_ATTEMPTS = 12;

const CAS_SCRIPT =
  "local v = redis.call('GET', KEYS[2]) if (v or '0') ~= ARGV[1] then return 0 end redis.call('SET', KEYS[1], ARGV[2]) redis.call('INCR', KEYS[2]) return 1";
const SET_SCRIPT = "redis.call('SET', KEYS[1], ARGV[1]) return redis.call('INCR', KEYS[2])";

/** Änderungen am selben Schlüssel innerhalb eines Servers nacheinander ausführen (weniger Konflikte) */
const keyQueues = new Map<string, Promise<unknown>>();
function serialize<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const prev = keyQueues.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  keyQueues.set(key, tail);
  void tail.then(() => {
    if (keyQueues.get(key) === tail) keyQueues.delete(key);
  });
  return run;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(250, 10 * 2 ** attempt) * (0.5 + Math.random());

/** Liest einen Wert; wirft bei Lese- oder Datenfehlern (statt still den Standardwert zu liefern) */
async function readStrict<T>(key: string, fallback: T): Promise<T> {
  const kind = storeKind();
  if (kind === "redis") {
    const raw = await redis<string | null>(["GET", key]);
    return raw === null ? fallback : parse<T>(key, raw);
  }
  if (kind === "file") {
    const all = await withFile(readFileStore);
    return key in all ? (all[key] as T) : fallback;
  }
  return fallback;
}

/**
 * Wert lesen – für Anzeigen: bei fehlendem Datensatz ODER Fehler kommt `fallback` (Fehler werden protokolliert).
 * Für Entscheidungen, die auf vollständigen Daten beruhen müssen, `getJSONStrict` verwenden.
 */
export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    return await readStrict(key, fallback);
  } catch (error) {
    console.error(`[store] Lesen von ${key} fehlgeschlagen: ${(error as Error).name}`);
    if (strictContext.getStore()) throw error;
    return fallback;
  }
}

const strictContext = new AsyncLocalStorage<boolean>();

/**
 * Für Bearbeitungsformulare im Dashboard: alle Lesevorgänge innerhalb von `fn` werfen bei einem Fehler,
 * statt still Standardwerte zu liefern. So wird nie ein Formular mit Standardwerten angezeigt, dessen
 * Speichern die echten Daten überschreiben würde (stattdessen erscheint die Fehlerseite).
 */
export function strictReads<R>(fn: () => Promise<R>): Promise<R> {
  return strictContext.run(true, fn);
}

/** Wert lesen – fehlt der Datensatz, kommt `fallback`; bei Ausfall oder kaputten Daten wird ein Fehler geworfen */
export async function getJSONStrict<T>(key: string, fallback: T): Promise<T> {
  if (storeKind() === "none") throw new StoreUnavailableError();
  return readStrict(key, fallback);
}

/**
 * Mehrere Werte auf einmal lesen (strikt, wie getJSONStrict) – fehlende Schlüssel liefern null.
 * Online in Blöcken zu je 100 Schlüsseln (MGET), damit auch lange Listen mit wenigen Anfragen auskommen.
 */
export async function getManyJSONStrict<T>(keys: string[]): Promise<(T | null)[]> {
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (!keys.length) return [];
  if (kind === "file") {
    const all = await withFile(readFileStore);
    return keys.map((k) => (k in all ? (all[k] as T) : null));
  }
  const out: (T | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const raw = await redis<(string | null)[]>(["MGET", ...chunk]);
    chunk.forEach((k, j) => out.push(raw?.[j] == null ? null : parse<T>(k, raw[j] as string)));
  }
  return out;
}

/** Wert vollständig ersetzen (ohne vorher zu lesen). Erhöht die Version, damit laufende Änderungen das bemerken. */
export async function setJSON<T>(key: string, value: T): Promise<void> {
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "redis") {
    await serialize(key, () => redis(["EVAL", SET_SCRIPT, 2, key, versionKey(key), JSON.stringify(value)]));
    return;
  }
  await withFile(async () => {
    const all = await readFileStore();
    all[key] = value;
    await writeFileStore(all);
  });
}

/**
 * Lesen → ändern → speichern, atomar gegen gleichzeitige Änderungen (auch über mehrere Server hinweg).
 *
 * - `change` bekommt immer den frischen Stand und kann bei einem Konflikt mehrfach aufgerufen werden –
 *   sie darf deshalb keine Nebenwirkungen haben (Ergebnisse nur über Variablen, die sie bei jedem Aufruf neu setzt).
 * - Lesefehler oder kaputte Daten brechen ab, BEVOR etwas geschrieben wird – vorhandene Daten werden nie durch
 *   einen Standardwert ersetzt.
 * - Nach MAX_ATTEMPTS Konflikten: WriteConflictError (nichts geschrieben).
 */
export async function updateJSON<T>(key: string, fallback: T, change: (current: T) => T): Promise<T> {
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "file") {
    return withFile(async () => {
      const all = await readFileStore();
      const next = change(key in all ? (all[key] as T) : structuredClone(fallback));
      all[key] = next;
      await writeFileStore(all);
      return next;
    });
  }
  return serialize(key, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const [raw, version] = await redis<[string | null, string | null]>(["MGET", key, versionKey(key)]);
      const current = raw === null ? structuredClone(fallback) : parse<T>(key, raw);
      const next = change(current);
      const serialized = JSON.stringify(next);
      if (serialized === raw) return next; // nichts geändert – nichts schreiben
      const ok = await redis<number>(["EVAL", CAS_SCRIPT, 2, key, versionKey(key), version ?? "0", serialized]);
      if (Number(ok) === 1) return next;
      await sleep(backoff(attempt));
    }
    console.error(`[store] Schreibkonflikt bei ${key} – ${MAX_ATTEMPTS} Versuche`);
    reportIncident("write_conflict", key);
    throw new WriteConflictError(key);
  });
}

/* ───────────── Binärdaten (Produktbilder) ─────────────
 * Online liegen Bilder als Base64-Text in Upstash (Schlüssel tt:media:<id>), lokal als Datei in .data/media.
 * Inhalte ändern sich nie (die ID ist ein Fingerabdruck des Bildes) – deshalb kann der Browser sie für immer zwischenspeichern.
 */

const MEDIA_DIR = path.join(process.cwd(), ".data", "media");
const mediaKey = (id: string) => `tt:media:${id}`;

export async function putBinary(id: string, data: Buffer): Promise<void> {
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "redis") {
    await redis(["SET", mediaKey(id), data.toString("base64")]);
    return;
  }
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, id), data);
}

export async function getBinary(id: string): Promise<Buffer | null> {
  const kind = storeKind();
  if (kind === "redis") {
    const result = await redis<string | null>(["GET", mediaKey(id)]);
    return result ? Buffer.from(result, "base64") : null;
  }
  if (kind === "file") return fs.readFile(path.join(MEDIA_DIR, id)).catch(() => null);
  return null;
}

/** Bilder löschen – ein Fehler wird nur protokolliert (übrig gebliebene Bilder stören nicht, verlorene Daten schon) */
export async function deleteBinary(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const kind = storeKind();
  if (kind === "redis") {
    await redis(["DEL", ...ids.map(mediaKey)]).catch((e: Error) => console.error(`[store] Löschen von Bildern fehlgeschlagen: ${e.name}`));
    return;
  }
  if (kind === "file") await Promise.all(ids.map((id) => fs.unlink(path.join(MEDIA_DIR, id)).catch(() => undefined)));
}

/* ───────────── Einmal-Sperre ─────────────
 * Sorgt dafür, dass etwas nur einmal passiert (z. B. die Bestellbestätigung), auch wenn zwei Wege gleichzeitig auslösen.
 * Liefert true für den ersten Aufruf, danach false (bis `ttlSeconds` abgelaufen sind). Atomar über SET NX.
 */
export async function claimOnce(name: string, ttlSeconds = 60 * 60 * 24 * 90): Promise<boolean> {
  const key = `tt:once:${name}`;
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "redis") {
    const result = await redis<string | null>(["SET", key, "1", "NX", "EX", String(ttlSeconds)]);
    return result === "OK";
  }
  return withFile(async () => {
    const all = await readFileStore();
    const entries = (all["tt:once"] ?? {}) as Record<string, number>;
    const now = Date.now();
    if (entries[name] && entries[name] > now) return false;
    entries[name] = now + ttlSeconds * 1000;
    all["tt:once"] = entries;
    await writeFileStore(all);
    return true;
  });
}

/** Sperre wieder freigeben (z. B. wenn das Senden fehlgeschlagen ist und es später erneut versucht werden soll) */
export async function releaseOnce(name: string): Promise<void> {
  const key = `tt:once:${name}`;
  const kind = storeKind();
  if (kind === "redis") {
    await redis(["DEL", key]).catch(() => undefined);
    return;
  }
  if (kind === "file") {
    await withFile(async () => {
      const all = await readFileStore();
      const entries = (all["tt:once"] ?? {}) as Record<string, number>;
      delete entries[name];
      all["tt:once"] = entries;
      await writeFileStore(all);
    }).catch(() => undefined);
  }
}

/** Zugang und Pfade für Auswertungen (Dashboard → Speicher) – nur auf dem Server verwenden */
export function storeInternals() {
  return { redisUrl: REDIS_URL, redisToken: REDIS_TOKEN, file: FILE, mediaDir: MEDIA_DIR };
}
