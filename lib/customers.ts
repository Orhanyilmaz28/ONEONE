import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { KEYS, getJSON, updateJSON } from "./store";

/**
 * Kundenkonten (vorbereitet – im Dashboard unter „Kunden“ einschaltbar).
 * Gespeichert im Datenspeicher unter tt:customers. Passwörter nur als scrypt-Hash mit eigenem Salz.
 */

export type CustomerAddress = { line1: string; line2: string; postalCode: string; city: string; country: string };

export type Customer = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  address?: CustomerAddress;
  /** Wird erhöht bei Abmelden, Passwortwechsel und Sperre – macht alle alten Anmeldungen ungültig */
  sessionVersion: number;
  failedLogins?: number;
  lockedUntil?: string;
  /** Passwort vergessen: nur der Hash des Links wird gespeichert */
  resetTokenHash?: string;
  resetExpires?: string;
  resetRequestedAt?: string;
};

export type Customers = Record<string, Customer>;

/** Öffentliche Ansicht (ohne Passwort-Hash) */
export type CustomerView = Omit<Customer, "passwordHash" | "failedLogins" | "lockedUntil" | "sessionVersion" | "resetTokenHash" | "resetExpires" | "resetRequestedAt">;

export { EMAIL, PASSWORD_MAX, PASSWORD_MIN } from "./customer-rules";

/** Nach so vielen Fehlversuchen wird das Konto kurz gesperrt */
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { ...PARAMS, N: Number(n) || PARAMS.N });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Einheitliche Schreibweise für E-Mail-Adressen */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function getCustomers(): Promise<Customers> {
  return getJSON<Customers>(KEYS.customers, {});
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return (await getCustomers())[id];
}

export function toView(c: Customer): CustomerView {
  const { passwordHash: _h, failedLogins: _f, lockedUntil: _l, sessionVersion: _v, resetTokenHash: _r, resetExpires: _e, resetRequestedAt: _q, ...view } = c;
  return view;
}

export class EmailTakenError extends Error {}

export async function createCustomer(input: { email: string; name: string; password: string }): Promise<Customer> {
  const email = normalizeEmail(input.email);
  const now = new Date().toISOString();
  const customer: Customer = {
    id: randomUUID(),
    email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    sessionVersion: 1,
  };
  await updateJSON<Customers>(KEYS.customers, {}, (all) => {
    if (Object.values(all).some((c) => c.email === email)) throw new EmailTakenError();
    return { ...all, [customer.id]: customer };
  });
  return customer;
}

export type LoginResult = { customer: Customer } | { error: "invalid" | "locked"; minutes?: number };

/** Anmeldung prüfen – mit kurzer Sperre nach vielen Fehlversuchen */
export async function checkLogin(emailRaw: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(emailRaw);
  const found = Object.values(await getCustomers()).find((c) => c.email === email);
  if (!found) {
    // gleiche Rechenzeit wie bei einem echten Konto, damit man nicht erraten kann, welche Adressen registriert sind
    await hashPassword(password);
    return { error: "invalid" };
  }
  if (found.lockedUntil && new Date(found.lockedUntil).getTime() > Date.now()) {
    return { error: "locked", minutes: Math.ceil((new Date(found.lockedUntil).getTime() - Date.now()) / 60_000) };
  }
  const ok = await verifyPassword(password, found.passwordHash);
  const now = new Date().toISOString();
  const updated = await updateJSON<Customers>(KEYS.customers, {}, (all) => {
    const c = all[found.id];
    if (!c) return all;
    if (ok) return { ...all, [c.id]: { ...c, failedLogins: 0, lockedUntil: undefined, lastLoginAt: now } };
    const failed = (c.failedLogins ?? 0) + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : undefined;
    return { ...all, [c.id]: { ...c, failedLogins: lock ? 0 : failed, lockedUntil: lock } };
  });
  if (!ok) {
    const c = updated[found.id];
    return c?.lockedUntil ? { error: "locked", minutes: LOCK_MINUTES } : { error: "invalid" };
  }
  return { customer: updated[found.id] ?? found };
}

export async function updateCustomer(id: string, change: (c: Customer) => Customer): Promise<Customer | undefined> {
  let result: Customer | undefined;
  await updateJSON<Customers>(KEYS.customers, {}, (all) => {
    const c = all[id];
    if (!c) return all;
    result = { ...change(c), id: c.id, updatedAt: new Date().toISOString() };
    return { ...all, [id]: result };
  });
  return result;
}

export async function deleteCustomer(id: string) {
  await updateJSON<Customers>(KEYS.customers, {}, (all) => {
    if (!(id in all)) return all;
    const next = { ...all };
    delete next[id];
    return next;
  });
}

/* ───────── Passwort vergessen ───────── */

const RESET_MINUTES = 60;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Link zum Zurücksetzen erzeugen (60 Minuten gültig, nur einmal nutzbar).
 * Liefert null, wenn es kein Konto gibt oder gerade erst ein Link angefordert wurde (höchstens alle 2 Minuten).
 */
export async function createPasswordReset(emailRaw: string): Promise<{ customer: Customer; token: string } | null> {
  const email = normalizeEmail(emailRaw);
  const found = Object.values(await getCustomers()).find((c) => c.email === email);
  if (!found) return null;
  if (found.resetRequestedAt && Date.now() - Date.parse(found.resetRequestedAt) < 2 * 60_000) return null;
  const token = randomBytes(32).toString("base64url");
  const updated = await updateCustomer(found.id, (c) => ({
    ...c,
    resetTokenHash: sha(token),
    resetExpires: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
    resetRequestedAt: new Date().toISOString(),
  }));
  return updated ? { customer: updated, token } : null;
}

/** Gültigen Link prüfen (ohne ihn zu verbrauchen) */
export async function checkPasswordReset(id: string, token: string): Promise<Customer | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const c = await getCustomer(id);
  if (!c?.resetTokenHash || !c.resetExpires || Date.parse(c.resetExpires) < Date.now()) return null;
  const a = Buffer.from(c.resetTokenHash);
  const b = Buffer.from(sha(token));
  return a.length === b.length && timingSafeEqual(a, b) ? c : null;
}

/** Neues Passwort setzen: Link wird verbraucht, alle anderen Anmeldungen enden, Sperre wird aufgehoben */
export async function completePasswordReset(id: string, token: string, password: string): Promise<Customer | null> {
  if (!(await checkPasswordReset(id, token))) return null;
  const hash = await hashPassword(password);
  return (
    (await updateCustomer(id, (c) => ({
      ...c,
      passwordHash: hash,
      sessionVersion: c.sessionVersion + 1,
      resetTokenHash: undefined,
      resetExpires: undefined,
      failedLogins: 0,
      lockedUntil: undefined,
    }))) ?? null
  );
}

/* ───────── Ein/Aus ───────── */

export type AccountsConfig = { enabled: boolean; enabledAt?: string };

export async function getAccountsConfig(): Promise<AccountsConfig> {
  const c = await getJSON<Partial<AccountsConfig>>(KEYS.accounts, {});
  return { enabled: c.enabled === true, enabledAt: c.enabledAt };
}
