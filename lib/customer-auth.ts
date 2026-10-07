import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "./admin-auth";
import { type Customer, getAccountsConfig, getCustomer } from "./customers";

/**
 * Anmeldung für Kund:innen: signiertes, httpOnly-Cookie (30 Tage).
 * Inhalt: Kunden-ID, Sitzungsversion und Ablaufzeit – die Version im Konto entscheidet, ob es noch gilt.
 */
const COOKIE = "tt_kunde";
const DAYS = 30;

function secret() {
  return process.env.SESSION_SECRET || createHash("sha256").update(`tt-kunde:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(`kunde.${payload}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** Sind Kundenkonten nutzbar? Ausgeschaltet dürfen nur Admins sie als Vorschau ansehen. */
export async function accountAccess(): Promise<{ allowed: boolean; preview: boolean }> {
  const { enabled } = await getAccountsConfig();
  if (enabled) return { allowed: true, preview: false };
  const admin = await isAdmin();
  return { allowed: admin, preview: admin };
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, version, exp, sig] = parts;
  if (!/^[0-9a-f-]{36}$/.test(id) || Number(exp) < Date.now() || !safeEqual(sig, sign(`${id}.${version}.${exp}`))) return null;
  const customer = await getCustomer(id);
  if (!customer || String(customer.sessionVersion) !== version) return null;
  return customer;
}

/** Für Seiten im Kundenbereich: nicht angemeldet → zur Anmeldung */
export async function requireCustomer(next = "/konto"): Promise<Customer> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/konto/anmelden?weiter=${encodeURIComponent(next)}`);
  return customer;
}

export async function startCustomerSession(customer: Pick<Customer, "id" | "sessionVersion">) {
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = `${customer.id}.${customer.sessionVersion}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endCustomerSession() {
  (await cookies()).delete(COOKIE);
}

/** Nur interne Ziele nach der Anmeldung erlauben (keine fremden Seiten) */
export function safeNext(raw: unknown) {
  const s = typeof raw === "string" ? raw : "";
  return /^\/konto(\/[a-z0-9-]*)*(\?[\w=&-]*)?$/.test(s) ? s : "/konto";
}
