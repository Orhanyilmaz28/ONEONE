import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Grundlagen des Dashboard-Zugangs ohne Next-Abhängigkeiten (auch im Proxy nutzbar).
 * Sitzungen liegen serverseitig in Redis – siehe lib/admin-security/sessions.ts.
 */

/** Cookie-Name: online mit __Host-Präfix (nur HTTPS, nur diese Domain, Pfad „/“) */
export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-tt_admin" : "tt_admin";

export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 8;
}

/** Zeitkonstanter Vergleich (über Hashes, damit auch unterschiedliche Längen nichts verraten) */
export function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}
