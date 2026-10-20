import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./customers";
import { CODE_RE, DEFAULT_COMMISSION_PCT, DEFAULT_DISCOUNT_PCT, INFLUENCER_MARKETING_TEXT, normalizeCode } from "./influencer-rules";
import { KEYS, getJSON, updateJSON } from "./store";

/** Influencer (Registrierung unter /influencer, Freigabe im Dashboard unter „Influencer“) – nur auf dem Server verwenden */
export type InfluencerStatus = "neu" | "freigegeben" | "abgelehnt";

export type Influencer = {
  id: string;
  createdAt: string;
  status: InfluencerStatus;
  name: string;
  /** Künstlername / Kanalname */
  alias: string;
  email: string;
  phone: string;
  platform: string;
  channelUrl: string;
  followers: string;
  message: string;
  /** Wunsch-Code aus der Registrierung */
  wishCode: string;
  /** Vergebener Code (bei der Freigabe festgelegt) */
  code?: string;
  /** Rabatt für Zuschauer in % */
  discountPct: number;
  /** Provision in % vom Netto-Warenwert */
  commissionPct: number;
  /** Code kann pausiert werden, ohne den Zugang zu sperren */
  active: boolean;
  /** Angaben für die Gutschrift */
  street: string;
  zip: string;
  city: string;
  /** Kleinunternehmer nach § 19 UStG (Gutschrift ohne USt.) */
  smallBusiness: boolean;
  taxNo: string;
  vatId: string;
  iban: string;
  accountHolder: string;
  approvedAt?: string;
  activationToken?: string;
  activationExpires?: string;
  passwordHash?: string;
  sessionVersion?: number;
  failedLogins?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  marketing?: { granted: boolean; at: string; text: string };
};

const MAX_INFLUENCERS = 2000;
const ACTIVATION_DAYS = 14;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export class InfluencerLimitError extends Error {}
export class CodeTakenError extends Error {}

const list = (v: unknown) => (Array.isArray(v) ? (v as Influencer[]) : []);

export async function getInfluencers(): Promise<Influencer[]> {
  return list(await getJSON<Influencer[]>(KEYS.influencers, []));
}

export async function getInfluencer(id: string) {
  return (await getInfluencers()).find((i) => i.id === id);
}

/** Aktiven, freigegebenen Influencer zu einem Code finden */
export async function findByCode(raw: string): Promise<Influencer | undefined> {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) return undefined;
  return (await getInfluencers()).find((i) => i.code === code && i.status === "freigegeben" && i.active);
}

type NewInfluencer = Omit<Influencer, "id" | "createdAt" | "status" | "discountPct" | "commissionPct" | "active" | "iban" | "accountHolder">;

/** Neue Anmeldung; dieselbe E-Mail innerhalb von 10 Minuten wird nicht doppelt eingetragen */
export async function addInfluencer(input: NewInfluencer): Promise<{ influencer: Influencer; duplicate: boolean }> {
  let result: { influencer: Influencer; duplicate: boolean } | undefined;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    const all = list(current);
    const now = Date.now();
    const same = all.find((i) => i.email === input.email && now - Date.parse(i.createdAt) < 10 * 60_000);
    if (same) {
      result = { influencer: same, duplicate: true };
      return all;
    }
    if (all.length >= MAX_INFLUENCERS) throw new InfluencerLimitError("Zu viele Anmeldungen gespeichert.");
    const influencer: Influencer = {
      ...input,
      id: randomBytes(8).toString("hex"),
      createdAt: new Date(now).toISOString(),
      status: "neu",
      discountPct: DEFAULT_DISCOUNT_PCT,
      commissionPct: DEFAULT_COMMISSION_PCT,
      active: true,
      iban: "",
      accountHolder: "",
    };
    result = { influencer, duplicate: false };
    return [influencer, ...all];
  });
  if (!result) throw new Error("Speichern fehlgeschlagen");
  return result;
}

const token = () => ({ activationToken: randomBytes(24).toString("hex"), activationExpires: new Date(Date.now() + ACTIVATION_DAYS * 86_400_000).toISOString() });

/** Code, Rabatt und Provision festlegen (prüft, dass der Code frei ist) */
export async function setInfluencerTerms(id: string, terms: { code: string; discountPct: number; commissionPct: number; active: boolean }) {
  const code = normalizeCode(terms.code);
  if (!CODE_RE.test(code)) throw new CodeTakenError("Der Code braucht 3–20 Zeichen (A–Z, 0–9).");
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    const all = list(current);
    if (all.some((i) => i.id !== id && i.code === code)) throw new CodeTakenError(`Der Code ${code} ist schon vergeben.`);
    return all.map((i) => (i.id === id ? { ...i, code, discountPct: terms.discountPct, commissionPct: terms.commissionPct, active: terms.active } : i));
  });
}

/** Status ändern. Bei „freigegeben“ entsteht ein Aktivierungs-Link (14 Tage); sonst wird der Zugang gesperrt. */
export async function setInfluencerStatus(id: string, status: InfluencerStatus): Promise<boolean> {
  let found = false;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    found = false; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).map((i) => {
      if (i.id !== id) return i;
      found = true;
      if (status === "freigegeben") return { ...i, status, approvedAt: i.approvedAt ?? new Date().toISOString(), ...(i.passwordHash ? {} : token()) };
      return { ...i, status, activationToken: undefined, activationExpires: undefined, sessionVersion: (i.sessionVersion ?? 0) + 1 };
    });
  });
  return found;
}

/** Neuer Aktivierungs-Link (abgelaufen oder Passwort vergessen) */
export async function renewInfluencerActivation(id: string): Promise<boolean> {
  let found = false;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    found = false; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).map((i) => {
      if (i.id !== id || i.status !== "freigegeben") return i;
      found = true;
      return { ...i, ...token() };
    });
  });
  return found;
}

const sameToken = (a: string, b: string) => createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");

export async function checkInfluencerActivation(id: string, t: string): Promise<Influencer | null> {
  const i = await getInfluencer(id);
  if (!i || i.status !== "freigegeben" || !i.activationToken || !i.activationExpires) return null;
  if (Date.parse(i.activationExpires) < Date.now() || !sameToken(i.activationToken, t)) return null;
  return i;
}

export async function completeInfluencerActivation(id: string, t: string, password: string): Promise<Influencer | null> {
  if (!(await checkInfluencerActivation(id, t))) return null;
  const passwordHash = await hashPassword(password);
  let result: Influencer | null = null;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    result = null; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).map((i) => {
      if (i.id !== id || i.activationToken !== t) return i;
      result = { ...i, passwordHash, activationToken: undefined, activationExpires: undefined, sessionVersion: (i.sessionVersion ?? 0) + 1, failedLogins: 0, lockedUntil: undefined };
      return result;
    });
  });
  return result;
}

export type InfluencerLogin = { influencer: Influencer } | { error: "invalid" | "locked"; minutes?: number };

export async function checkInfluencerLogin(emailRaw: string, password: string): Promise<InfluencerLogin> {
  const email = emailRaw.trim().toLowerCase();
  const found = (await getInfluencers()).find((i) => i.email === email && i.status === "freigegeben" && i.passwordHash);
  if (!found?.passwordHash) {
    await hashPassword(password); // gleiche Rechenzeit für unbekannte Adressen
    return { error: "invalid" };
  }
  if (found.lockedUntil && Date.parse(found.lockedUntil) > Date.now()) return { error: "locked", minutes: Math.ceil((Date.parse(found.lockedUntil) - Date.now()) / 60_000) };
  const ok = await verifyPassword(password, found.passwordHash);
  let updated: Influencer | undefined;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    updated = undefined; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).map((i) => {
      if (i.id !== found.id) return i;
      if (ok) return (updated = { ...i, failedLogins: 0, lockedUntil: undefined, lastLoginAt: new Date().toISOString() });
      const failed = (i.failedLogins ?? 0) + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : undefined;
      return (updated = { ...i, failedLogins: lock ? 0 : failed, lockedUntil: lock });
    });
  });
  if (!ok) return updated?.lockedUntil ? { error: "locked", minutes: LOCK_MINUTES } : { error: "invalid" };
  return { influencer: updated ?? found };
}

/** Angaben aus dem Konto (Anschrift, Steuer, Bank) */
export type InfluencerProfile = Pick<Influencer, "name" | "alias" | "phone" | "street" | "zip" | "city" | "smallBusiness" | "taxNo" | "vatId" | "iban" | "accountHolder" | "channelUrl">;

export async function updateInfluencerProfile(id: string, patch: Partial<InfluencerProfile>): Promise<boolean> {
  let found = false;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    found = false; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).map((i) => {
      if (i.id !== id) return i;
      found = true;
      return { ...i, ...patch };
    });
  });
  return found;
}

export async function setInfluencerMarketing(id: string, granted: boolean) {
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) =>
    list(current).map((i) => (i.id === id ? { ...i, marketing: { granted, at: new Date().toISOString(), text: INFLUENCER_MARKETING_TEXT } } : i)),
  );
}

export async function deleteInfluencer(id: string): Promise<boolean> {
  let found = false;
  await updateJSON<Influencer[]>(KEYS.influencers, [], (current) => {
    found = false; // Callback kann bei Schreibkonflikt erneut laufen
    return list(current).filter((i) => {
      if (i.id === id) found = true;
      return i.id !== id;
    });
  });
  return found;
}
