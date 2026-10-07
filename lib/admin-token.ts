import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Prüfung des Dashboard-Cookies ohne Next-Abhängigkeiten – damit sie auch im Proxy (proxy.ts) läuft.
 * Wird von lib/admin-auth.ts verwendet.
 */
export const ADMIN_COOKIE = "tt_admin";

export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 8;
}

function secret() {
  return process.env.ADMIN_SECRET || createHash("sha256").update(`tt-admin:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
}

export function signAdmin(exp: number) {
  return createHmac("sha256", secret()).update(`admin.${exp}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function verifyAdminToken(token?: string) {
  if (!token || !adminConfigured()) return false;
  const [e, s] = token.split(".");
  const exp = Number(e);
  if (!Number.isFinite(exp) || exp < Date.now() || !s) return false;
  return safeEqual(s, signAdmin(exp));
}
