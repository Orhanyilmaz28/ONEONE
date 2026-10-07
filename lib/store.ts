import { promises as fs } from "node:fs";
import path from "node:path";

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
} as const;

export function storeKind(): StoreKind {
  if (REDIS_URL && REDIS_TOKEN) return "redis";
  // Auf Vercel ist das Dateisystem schreibgeschützt
  if (process.env.VERCEL) return "none";
  return "file";
}

export class StoreUnavailableError extends Error {
  constructor() {
    super("Kein Datenspeicher verbunden. Bitte in Vercel unter „Storage“ eine Upstash-Redis-Datenbank verbinden.");
  }
}

async function readFileStore(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let fileQueue: Promise<unknown> = Promise.resolve();

/** Liest einen Wert; wirft bei Lesefehlern (statt still den Standardwert zu liefern) */
async function readStrict<T>(key: string, fallback: T, fresh: boolean): Promise<T> {
  const kind = storeKind();
  if (kind === "redis") {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      ...(fresh ? { cache: "no-store" as const } : {}),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const { result } = (await res.json()) as { result: string | null };
    return result ? (JSON.parse(result) as T) : fallback;
  }
  if (kind === "file") {
    const all = await readFileStore();
    return key in all ? (all[key] as T) : fallback;
  }
  return fallback;
}

/** Wert lesen; bei Fehlern oder fehlendem Speicher wird `fallback` geliefert */
export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    return await readStrict(key, fallback, false);
  } catch (error) {
    console.error(`[store] Lesen von ${key} fehlgeschlagen`, error);
    return fallback;
  }
}

/** Wert speichern (wirft StoreUnavailableError, wenn kein Speicher verbunden ist) */
export async function setJSON<T>(key: string, value: T): Promise<void> {
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "redis") {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, JSON.stringify(value)]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Speichern fehlgeschlagen (Redis ${res.status})`);
    return;
  }
  // Dateispeicher: Schreibvorgänge nacheinander ausführen
  const run = fileQueue.then(async () => {
    const all = await readFileStore();
    all[key] = value;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
  });
  fileQueue = run.catch(() => undefined);
  await run;
}

/**
 * Lesen → ändern → speichern. Liest immer frisch und bricht bei Lesefehlern ab,
 * damit ein kurzer Ausfall nie gespeicherte Daten überschreibt.
 */
export async function updateJSON<T>(key: string, fallback: T, change: (current: T) => T): Promise<T> {
  if (storeKind() === "none") throw new StoreUnavailableError();
  const next = change(await readStrict(key, fallback, true));
  await setJSON(key, next);
  return next;
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
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", mediaKey(id), data.toString("base64")]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Bild speichern fehlgeschlagen (Redis ${res.status})`);
    return;
  }
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, id), data);
}

export async function getBinary(id: string): Promise<Buffer | null> {
  const kind = storeKind();
  if (kind === "redis") {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(mediaKey(id))}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const { result } = (await res.json()) as { result: string | null };
    return result ? Buffer.from(result, "base64") : null;
  }
  if (kind === "file") return fs.readFile(path.join(MEDIA_DIR, id)).catch(() => null);
  return null;
}

export async function deleteBinary(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const kind = storeKind();
  if (kind === "redis") {
    await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["DEL", ...ids.map(mediaKey)]),
      cache: "no-store",
    });
    return;
  }
  if (kind === "file") await Promise.all(ids.map((id) => fs.unlink(path.join(MEDIA_DIR, id)).catch(() => undefined)));
}

/* ───────────── Einmal-Sperre ─────────────
 * Sorgt dafür, dass etwas nur einmal passiert (z. B. die Bestellbestätigung), auch wenn zwei Wege gleichzeitig auslösen.
 * Liefert true für den ersten Aufruf, danach false (bis `ttlSeconds` abgelaufen sind).
 */
let onceQueue: Promise<unknown> = Promise.resolve();

export async function claimOnce(name: string, ttlSeconds = 60 * 60 * 24 * 90): Promise<boolean> {
  const key = `tt:once:${name}`;
  const kind = storeKind();
  if (kind === "none") throw new StoreUnavailableError();
  if (kind === "redis") {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, "1", "NX", "EX", String(ttlSeconds)]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const { result } = (await res.json()) as { result: string | null };
    return result === "OK";
  }
  // Datei: nacheinander prüfen und setzen
  const run = onceQueue.then(async () => {
    const all = await readFileStore();
    const entries = (all["tt:once"] ?? {}) as Record<string, number>;
    const now = Date.now();
    if (entries[name] && entries[name] > now) return false;
    entries[name] = now + ttlSeconds * 1000;
    all["tt:once"] = entries;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
    return true;
  });
  onceQueue = run.catch(() => undefined);
  return run;
}

/** Sperre wieder freigeben (z. B. wenn das Senden fehlgeschlagen ist und es später erneut versucht werden soll) */
export async function releaseOnce(name: string): Promise<void> {
  const key = `tt:once:${name}`;
  const kind = storeKind();
  if (kind === "redis") {
    await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(["DEL", key]),
      cache: "no-store",
    }).catch(() => undefined);
    return;
  }
  if (kind === "file") {
    const run = onceQueue.then(async () => {
      const all = await readFileStore();
      const entries = (all["tt:once"] ?? {}) as Record<string, number>;
      delete entries[name];
      all["tt:once"] = entries;
      await fs.writeFile(FILE, JSON.stringify(all, null, 2));
    });
    onceQueue = run.catch(() => undefined);
    await run.catch(() => undefined);
  }
}
