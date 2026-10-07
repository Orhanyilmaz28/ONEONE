import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { KEYS, getJSON } from "./store";

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

export async function getSiteLock(): Promise<SiteLock> {
  const raw = await getJSON<Partial<SiteLock>>(KEYS.siteLock, {});
  return {
    enabled: raw.enabled === true && typeof raw.hash === "string",
    hash: typeof raw.hash === "string" ? raw.hash : undefined,
    message: typeof raw.message === "string" ? raw.message : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
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
