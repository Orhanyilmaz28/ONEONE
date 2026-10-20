import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ADMIN_COOKIE, adminConfigured } from "./admin-token";
import { type Origin } from "./admin-security/flow";
import { clientIp, userAgent } from "./admin-security/request-info";
import { type AdminSession, PENDING_TTL, SESSION_ABSOLUTE, readSession } from "./admin-security/sessions";
import { KvUnavailableError } from "./kv";
import { OfficeAccessError, type Permission, type Principal, can } from "./office/roles";
import { resolvePrincipal } from "./office/principal";

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

/**
 * Wer ist angemeldet? Administrator (ohne Benutzername) oder Büro-Zugang.
 * Büro-Zugänge werden bei jeder Anfrage gegen den gespeicherten Zugang geprüft (gesperrt, gelöscht oder
 * geändert → Sitzung endet). Ist der Datenspeicher nicht erreichbar, gilt niemand als angemeldet.
 */
export const currentPrincipal = cache(async (): Promise<Principal | null> => resolvePrincipal(await currentAdminSession()));

/** Voll angemeldet als Administrator (Passwort und – falls eingerichtet – zweiter Faktor)? Büro-Zugänge zählen nicht. */
export async function isAdmin() {
  return (await currentPrincipal())?.role === "admin";
}

/** Für Seiten im Dashboard (nur Administrator): nicht angemeldet → zur Anmeldung, Büro-Zugang → zur Büroverwaltung */
export async function requireAdmin() {
  const p = await currentPrincipal();
  if (!p) redirect("/admin/login");
  if (p.role !== "admin") redirect("/admin/buero");
}

/** Für Seiten der Büroverwaltung: liefert die angemeldete Person, sonst Anmeldung bzw. Hinweis „keine Berechtigung“ */
export async function requireOffice(permission: Permission = "office.view"): Promise<Principal> {
  const p = await currentPrincipal();
  if (!p) redirect("/admin/login");
  if (!can(p.role, permission)) redirect("/admin/buero?keine-berechtigung=1");
  return p;
}

/** Für API-Routen und Server Actions der Büroverwaltung: wirft OfficeAccessError (401/403) */
export async function assertOffice(permission: Permission = "office.view"): Promise<Principal> {
  const p = await currentPrincipal();
  if (!p) throw new OfficeAccessError(401);
  if (!can(p.role, permission)) throw new OfficeAccessError(403);
  return p;
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
