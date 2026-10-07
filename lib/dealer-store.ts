import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./customers";
import type { PriceSet } from "./dealer-pricing";
import { KEYS, getJSON, updateJSON } from "./store";

/** Händler-Anfragen von /haendler (nur auf dem Server verwenden). Die Freigabe erfolgt im Dashboard unter „Händler“. */
export type DealerStatus = "neu" | "freigegeben" | "abgelehnt";

export type Dealer = {
  id: string;
  createdAt: string;
  status: DealerStatus;
  company: string;
  contact: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  vatId: string;
  branch: string;
  volume: string;
  message: string;
  /** Gewerbenachweis (Datei liegt im Binärspeicher unter proof.id) */
  proof?: { id: string; name: string; type: string; size: number };
  approvedAt?: string;
  /** Händlerstufe (Prozent-Nachlass auf die Basispreise) */
  tierId?: string;
  /** Individuelle Preise dieses Händlers (Vorrang vor Stufe), je Produkt-Handle */
  customPrices?: Record<string, PriceSet>;
  /** Zugang: erst nach Freigabe – Händler:in legt über den Link selbst ein Passwort fest */
  activationToken?: string;
  activationExpires?: string;
  passwordHash?: string;
  sessionVersion?: number;
  failedLogins?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
};

export const BRANCHES = ["Einzelhandel", "Getränkemarkt / Großhandel", "Gastronomie", "Kiosk / Späti", "Tankstelle", "Event / Verein", "Online-Händler", "Sonstiges"] as const;
export const VOLUMES = ["bis 10 Trays pro Monat", "10–50 Trays pro Monat", "ab 1 Palette pro Monat", "mehrere Paletten pro Monat", "noch unklar"] as const;

/** Obergrenze, damit der Speicher nicht vollläuft */
const MAX_DEALERS = 1000;

export async function getDealers(): Promise<Dealer[]> {
  const list = await getJSON<Dealer[]>(KEYS.dealers, []);
  return Array.isArray(list) ? list : [];
}

export class DealerLimitError extends Error {}

/** Neue Anfrage speichern; dieselbe E-Mail innerhalb von 10 Minuten wird nicht doppelt eingetragen */
export async function addDealer(input: Omit<Dealer, "id" | "createdAt" | "status" | "proof"> & { proof?: Dealer["proof"] }, idOverride?: string): Promise<{ dealer: Dealer; duplicate: boolean }> {
  let result: { dealer: Dealer; duplicate: boolean } | undefined;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (current) => {
    const list = Array.isArray(current) ? current : [];
    const now = Date.now();
    const same = list.find((d) => d.email === input.email && now - Date.parse(d.createdAt) < 10 * 60_000);
    if (same) {
      result = { dealer: same, duplicate: true };
      return list;
    }
    if (list.length >= MAX_DEALERS) throw new DealerLimitError("Zu viele Händler-Anfragen gespeichert.");
    const dealer: Dealer = { ...input, id: idOverride ?? randomBytes(8).toString("hex"), createdAt: new Date(now).toISOString(), status: "neu" };
    result = { dealer, duplicate: false };
    return [dealer, ...list];
  });
  if (!result) throw new Error("Speichern fehlgeschlagen");
  return result;
}

const ACTIVATION_DAYS = 14;

/** Status ändern. Bei „freigegeben“ entsteht ein Aktivierungs-Link (14 Tage gültig); sonst wird der Zugang gesperrt. */
export async function setDealerStatus(id: string, status: DealerStatus): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== id) return d;
      found = true;
      if (status === "freigegeben") {
        const hasAccess = Boolean(d.passwordHash);
        return {
          ...d,
          status,
          approvedAt: d.approvedAt ?? new Date().toISOString(),
          ...(hasAccess ? {} : { activationToken: randomBytes(24).toString("hex"), activationExpires: new Date(Date.now() + ACTIVATION_DAYS * 86_400_000).toISOString() }),
        };
      }
      // Sperren: laufende Sitzungen enden (Version erhöhen), offene Aktivierung entfällt
      return { ...d, status, activationToken: undefined, activationExpires: undefined, sessionVersion: (d.sessionVersion ?? 0) + 1 };
    }),
  );
  return found;
}

/** Neuen Aktivierungs-Link erzeugen (z. B. wenn der alte abgelaufen ist oder das Passwort vergessen wurde) */
export async function renewActivation(id: string): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== id || d.status !== "freigegeben") return d;
      found = true;
      return { ...d, activationToken: randomBytes(24).toString("hex"), activationExpires: new Date(Date.now() + ACTIVATION_DAYS * 86_400_000).toISOString() };
    }),
  );
  return found;
}

export async function getDealer(id: string): Promise<Dealer | undefined> {
  return (await getDealers()).find((d) => d.id === id);
}

const sameToken = (a: string, b: string) => createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");

/** Aktivierungs-Link prüfen (noch gültig, Händler:in freigegeben) */
export async function checkActivation(id: string, token: string): Promise<Dealer | null> {
  const d = await getDealer(id);
  if (!d || d.status !== "freigegeben" || !d.activationToken || !d.activationExpires) return null;
  if (Date.parse(d.activationExpires) < Date.now() || !sameToken(d.activationToken, token)) return null;
  return d;
}

/** Passwort festlegen (einmalig pro Link) */
export async function completeActivation(id: string, token: string, password: string): Promise<Dealer | null> {
  if (!(await checkActivation(id, token))) return null;
  const passwordHash = await hashPassword(password);
  let result: Dealer | null = null;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== id || d.activationToken !== token) return d;
      result = { ...d, passwordHash, activationToken: undefined, activationExpires: undefined, sessionVersion: (d.sessionVersion ?? 0) + 1, failedLogins: 0, lockedUntil: undefined };
      return result;
    }),
  );
  return result;
}

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;
export type DealerLogin = { dealer: Dealer } | { error: "invalid" | "locked"; minutes?: number };

/** Anmeldung prüfen – mit kurzer Sperre nach vielen Fehlversuchen */
export async function checkDealerLogin(emailRaw: string, password: string): Promise<DealerLogin> {
  const email = emailRaw.trim().toLowerCase();
  const found = (await getDealers()).find((d) => d.email === email && d.status === "freigegeben" && d.passwordHash);
  if (!found?.passwordHash) {
    await hashPassword(password); // gleiche Rechenzeit, damit man nicht erraten kann, welche Adressen Händler sind
    return { error: "invalid" };
  }
  if (found.lockedUntil && Date.parse(found.lockedUntil) > Date.now()) return { error: "locked", minutes: Math.ceil((Date.parse(found.lockedUntil) - Date.now()) / 60_000) };
  const ok = await verifyPassword(password, found.passwordHash);
  let updated: Dealer | undefined;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== found.id) return d;
      if (ok) return (updated = { ...d, failedLogins: 0, lockedUntil: undefined, lastLoginAt: new Date().toISOString() });
      const failed = (d.failedLogins ?? 0) + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : undefined;
      return (updated = { ...d, failedLogins: lock ? 0 : failed, lockedUntil: lock });
    }),
  );
  if (!ok) return updated?.lockedUntil ? { error: "locked", minutes: LOCK_MINUTES } : { error: "invalid" };
  return { dealer: updated ?? found };
}

export async function deleteDealer(id: string): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).filter((d) => {
      if (d.id === id) found = true;
      return d.id !== id;
    }),
  );
  return found;
}

/** Stufe und individuelle Preise eines Händlers speichern */
export async function setDealerPricing(id: string, tierId: string | undefined, customPrices: Record<string, PriceSet>): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== id) return d;
      found = true;
      return { ...d, tierId, customPrices };
    }),
  );
  return found;
}
