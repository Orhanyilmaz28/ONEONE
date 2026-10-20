import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ADMIN_COOKIE, adminConfigured } from "./admin-token";
import { type Origin } from "./admin-security/flow";
import { clientIp, userAgent } from "./admin-security/request-info";
import { type AdminSession, PENDING_TTL, SESSION_ABSOLUTE, readSession, touchSession } from "./admin-security/sessions";
import { KvUnavailableError } from "./kv";

/**
 * Dashboard-Zugang: Passwort (ADMIN_PASSWORD) + optional/verpflichtend TOTP-Zwei-Faktor.
 * Sitzungen liegen serverseitig in Redis und sind jederzeit widerrufbar (Dashboard → Sicherheit).
 * Ohne erreichbaren Datenspeicher gilt niemand als angemeldet.
 */
export { adminConfigured };

/** Aktuelle Sitzung (pro Anfrage nur einmal aus Redis gelesen) */
export const currentAdminSession = cache(async (): Promise<AdminSession | null> => {
  try {
    return await readSession((await cookies()).get(ADMIN_COOKIE)?.value);
  } catch (error) {
    if (!(error instanceof KvUnavailableError)) console.error("[admin-auth] Sitzung konnte nicht geprüft werden");
    return null;
  }
});

/** Voll angemeldet (Passwort und – falls eingerichtet – zweiter Faktor)? */
export async function isAdmin() {
  const s = await currentAdminSession();
  if (s?.stage !== "full") return false;
  await touchSession(s).catch(() => undefined);
  return true;
}

/** Für Seiten im Dashboard: nicht angemeldet → zur Anmeldung */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Für Server Actions und API-Routen: wirft einen Fehler, wenn nicht angemeldet */
export async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Nicht angemeldet");
}

/** Herkunft der aktuellen Anfrage (für Begrenzung und Protokoll) */
export async function requestOrigin(): Promise<Origin> {
  const h = await headers();
  return { ip: clientIp(h), ua: userAgent(h) };
}

/** Sitzungs-Cookie setzen – httpOnly, nur HTTPS (online), nur eigene Seite (SameSite=Strict) */
export async function setAdminCookie(token: string, stage: "full" | "pending") {
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: stage === "full" ? SESSION_ABSOLUTE : PENDING_TTL,
    priority: "high",
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  // altes Cookie aus der Zeit vor den Server-Sitzungen ebenfalls entfernen
  if (ADMIN_COOKIE !== "tt_admin") jar.delete("tt_admin");
}
