import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { KEYS, getJSON, getJSONStrict, storeKind } from "./store";

/**
 * Passwortschutz für den ganzen Shop (z. B. vor dem Start).
 * Ist er an, sehen Besucher:innen nur die Seite /zugang – bis sie das Passwort eingeben.
 * Das Dashboard (/admin) bleibt immer erreichbar; angemeldete Admins sehen den Shop ohne Passwort.
 */

export const SITE_COOKIE = "tt_site";
export const SITE_COOKIE_DAYS = 30;

export type SiteLock = {
  enabled: boolean;
  /** scrypt-Hash des Shop-Passworts */
  hash?: string;
  /** Kurzer Text auf der Passwort-Seite (optional) */
  message?: string;
  updatedAt?: string;
};

/** Gespeicherten Datensatz deuten. „An“ ohne gültiges Passwort bleibt „an“ (niemand kommt ohne Admin hinein) – nie stillschweigend offen. */
export function parseSiteLock(raw: Partial<SiteLock> | null | undefined): SiteLock {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: r.enabled === true,
    hash: typeof r.hash === "string" && r.hash.startsWith("scrypt$") ? r.hash : undefined,
    message: typeof r.message === "string" ? r.message : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
  };
}

/** Für Anzeigen im Dashboard – bei einer Störung „aus“ (nur Anzeige, keine Zugangsentscheidung) */
export async function getSiteLock(): Promise<SiteLock> {
  return parseSiteLock(await getJSON<Partial<SiteLock>>(KEYS.siteLock, {}));
}

/**
 * Für Zugangsentscheidungen: wirft bei Störung oder beschädigten Daten (statt „offen“ zu liefern).
 * Ohne verbundenen Datenspeicher kann kein Schutz eingeschaltet worden sein → offen.
 */
export async function getSiteLockStrict(): Promise<SiteLock> {
  if (storeKind() === "none") return { enabled: false };
  return parseSiteLock(await getJSONStrict<Partial<SiteLock>>(KEYS.siteLock, {}));
}

/**
 * Fail-Closed-Strategie für den Passwortschutz, wenn der Datenspeicher gestört ist:
 * 1. Frischer Stand (höchstens `cacheMs` alt) → verwenden.
 * 2. Lesen schlägt fehl → letzter bekannter Stand dieses Servers (egal wie alt): geschützter Shop bleibt geschützt,
 *    öffentlicher Shop bleibt öffentlich.
 * 3. Kein bekannter Stand (z. B. Server frisch gestartet während des Ausfalls) →
 *    SHOP_PUBLIC=1 gesetzt: Shop ist bewusst öffentlich → offen. Sonst: „unavailable“ (Besucher sehen eine Hinweisseite).
 */
export type LockResolution = SiteLock | "unavailable";

export function createLockResolver(read: () => Promise<SiteLock>, opts: { cacheMs?: number; now?: () => number; publicFallback?: () => boolean; onError?: (e: unknown) => void } = {}) {
  const cacheMs = opts.cacheMs ?? 10_000;
  const now = opts.now ?? Date.now;
  const publicFallback = opts.publicFallback ?? (() => process.env.SHOP_PUBLIC === "1");
  let last: { lock: SiteLock; at: number } | null = null;
  return {
    async resolve(): Promise<LockResolution> {
      if (last && now() - last.at < cacheMs) return last.lock;
      try {
        const lock = await read();
        last = { lock, at: now() };
        return lock;
      } catch (e) {
        opts.onError?.(e);
        if (last) return last.lock;
        return publicFallback() ? { enabled: false } : "unavailable";
      }
    },
    reset() {
      last = null;
    },
  };
}

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashSitePassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function checkSitePassword(password: string, stored?: string) {
  const [kind, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function secret() {
  return process.env.SESSION_SECRET || createHash("sha256").update(`tt-site:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
}

/** Cookie-Wert für Besucher:innen mit Passwort. Hängt am Passwort-Hash – neues Passwort = alle müssen es neu eingeben. */
export function siteToken(lock: Pick<SiteLock, "hash">) {
  return createHmac("sha256", secret()).update(`site.${lock.hash ?? ""}`).digest("base64url");
}

export function validSiteToken(token: string | undefined, lock: Pick<SiteLock, "hash">) {
  if (!token || !lock.hash) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(siteToken(lock)).digest();
  return timingSafeEqual(a, b);
}

/** Nur Ziele innerhalb des Shops (keine fremden Seiten) */
export function safeTarget(raw: unknown) {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !s.startsWith("/zugang") ? s : "/";
}
