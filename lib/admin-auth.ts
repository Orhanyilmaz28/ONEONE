import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminConfigured, safeEqual, signAdmin, verifyAdminToken } from "./admin-token";

/**
 * Dashboard-Zugang: ein Passwort aus der Umgebungsvariable ADMIN_PASSWORD (mind. 8 Zeichen).
 * Nach dem Login liegt ein signiertes, httpOnly-Cookie im Browser (7 Tage gültig).
 * Wird das Passwort geändert, sind alle bestehenden Logins automatisch ungültig.
 */
const COOKIE = ADMIN_COOKIE;
const DAYS = 7;

export { adminConfigured };

export function checkPassword(input: string) {
  return adminConfigured() && safeEqual(input, process.env.ADMIN_PASSWORD ?? "");
}

const verifyToken = verifyAdminToken;
const sign = signAdmin;

export async function isAdmin() {
  return verifyToken((await cookies()).get(COOKIE)?.value);
}

/** Für Seiten im Dashboard: nicht angemeldet → zur Anmeldung */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Für Server Actions und API-Routen: wirft einen Fehler, wenn nicht angemeldet */
export async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Nicht angemeldet");
}

export async function startAdminSession() {
  const exp = Date.now() + DAYS * 86_400_000;
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}
