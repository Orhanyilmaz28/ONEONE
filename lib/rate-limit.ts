import { createHash } from "node:crypto";
import { storeKind } from "./store";

/**
 * Bremse gegen Durchprobieren und Spam: zählt Versuche je Zweck + Absender (z. B. IP) in einem Zeitfenster.
 * - Online: Upstash Redis (gleiche Zugangsdaten wie lib/store.ts), damit die Grenze über alle Server-Instanzen gilt.
 * - Lokal oder ohne Datenbank: Zähler im Arbeitsspeicher.
 * Fällt Redis kurz aus, wird nicht blockiert (der Shop soll weiter funktionieren) – nur protokolliert.
 */

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

export type Limit = { /** erlaubte Versuche im Zeitfenster */ max: number; /** Zeitfenster in Sekunden */ windowSec: number };

/** Grenzen an einer Stelle */
export const LIMITS = {
  /** Dashboard-Login: 5 Fehlversuche je IP, dann 15 Minuten Pause */
  adminLogin: { max: 5, windowSec: 15 * 60 },
  newsletter: { max: 5, windowSec: 10 * 60 },
  review: { max: 5, windowSec: 60 * 60 },
  dealerSignup: { max: 3, windowSec: 60 * 60 },
  customerSignup: { max: 5, windowSec: 60 * 60 },
  passwordReset: { max: 5, windowSec: 60 * 60 },
  /** dieselbe E-Mail-Adresse bekommt höchstens 3 Reset-Mails pro Stunde */
  passwordResetEmail: { max: 3, windowSec: 60 * 60 },
  checkout: { max: 30, windowSec: 10 * 60 },
} satisfies Record<string, Limit>;

/** IP der Anfrage (auf Vercel setzt die Plattform x-forwarded-for / x-real-ip) */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unbekannt";
}

/** IP-Adressen und E-Mails nur als Fingerabdruck speichern (Datenschutz) */
function keyFor(bucket: string, id: string) {
  return `tt:rl:${bucket}:${createHash("sha256").update(id.toLowerCase()).digest("base64url").slice(0, 22)}`;
}

const memory = new Map<string, { count: number; until: number }>();

async function redis(commands: (string | number)[][]): Promise<{ result: unknown }[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()) as { result: unknown }[];
}

/** Aktueller Zählerstand (ohne zu erhöhen) */
async function current(key: string): Promise<number> {
  if (storeKind() === "redis") {
    const [get] = await redis([["GET", key]]);
    return Number(get?.result ?? 0) || 0;
  }
  const entry = memory.get(key);
  return entry && entry.until > Date.now() ? entry.count : 0;
}

/** Zähler um 1 erhöhen; das Zeitfenster beginnt mit dem ersten Versuch */
async function increment(key: string, limit: Limit): Promise<number> {
  if (storeKind() === "redis") {
    const [, incr] = await redis([
      ["SET", key, 0, "EX", limit.windowSec, "NX"],
      ["INCR", key],
    ]);
    return Number(incr?.result ?? 0) || 0;
  }
  const now = Date.now();
  const entry = memory.get(key);
  const next = entry && entry.until > now ? { count: entry.count + 1, until: entry.until } : { count: 1, until: now + limit.windowSec * 1000 };
  memory.set(key, next);
  if (memory.size > 5000) for (const [k, v] of memory) if (v.until <= now) memory.delete(k);
  return next.count;
}

/** Ist die Grenze schon erreicht? (für Logins: vor der Passwortprüfung fragen, nur Fehlversuche zählen) */
export async function isLimited(bucket: string, id: string, limit: Limit): Promise<boolean> {
  try {
    return (await current(keyFor(bucket, id))) >= limit.max;
  } catch (error) {
    console.error(`[rate-limit] ${bucket}: Prüfung fehlgeschlagen`, error);
    return false;
  }
}

/** Versuch zählen, ohne zu blockieren (z. B. Fehlversuch beim Login) */
export async function countAttempt(bucket: string, id: string, limit: Limit): Promise<void> {
  try {
    await increment(keyFor(bucket, id), limit);
  } catch (error) {
    console.error(`[rate-limit] ${bucket}: Zählen fehlgeschlagen`, error);
  }
}

/** Versuch zählen und sagen, ob er noch erlaubt ist (für Formulare: jeder Versuch zählt) */
export async function allowAttempt(bucket: string, id: string, limit: Limit): Promise<boolean> {
  try {
    return (await increment(keyFor(bucket, id), limit)) <= limit.max;
  } catch (error) {
    console.error(`[rate-limit] ${bucket}: Zählen fehlgeschlagen`, error);
    return true;
  }
}

/** Zähler löschen (z. B. nach erfolgreichem Login) */
export async function resetAttempts(bucket: string, id: string): Promise<void> {
  const key = keyFor(bucket, id);
  try {
    if (storeKind() === "redis") await redis([["DEL", key]]);
    else memory.delete(key);
  } catch (error) {
    console.error(`[rate-limit] ${bucket}: Zurücksetzen fehlgeschlagen`, error);
  }
}

export const TOO_MANY = "Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann noch einmal.";
