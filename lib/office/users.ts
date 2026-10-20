import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, hashRecoveryCode, newRecoveryCodes } from "../admin-security/crypto";
import { now } from "../admin-security/clock";
import { verifyTotp } from "../admin-security/totp";
import { hashPassword, verifyPassword } from "../customers";
import { kv } from "../kv";
import { KEYS, getJSONStrict, updateJSON } from "../store";
import { type StaffRole, isStaffRole } from "./roles";

/**
 * Zugänge für Büro-Mitarbeiter:innen (nur auf dem Server verwenden).
 * - Passwort nur als scrypt-Hash, 2FA (TOTP) ist Pflicht und wird verschlüsselt gespeichert (ADMIN_2FA_KEY)
 * - jede Änderung (Rolle, Passwort, Sperre, 2FA zurücksetzen) erhöht `version` → laufende Sitzungen enden sofort
 * - Wiederherstellungscodes nur als Hash, jeder genau einmal einlösbar
 */
export type OfficeUser = {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  passwordHash: string;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  totp?: { secret: string; enabledAt: string };
  recovery?: { salt: string; hashes: string[] };
};
type Users = Record<string, OfficeUser>;

export const MAX_USERS = 50;
export const MIN_PASSWORD = 12;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const LAST = (id: string) => `tt:adm:office-2fa:last:${id}`;

export class OfficeUserError extends Error {}

export const normalizeUsername = (v: string) => v.trim().toLowerCase();

export async function listUsers(): Promise<OfficeUser[]> {
  const all = await getJSONStrict<Users>(KEYS.officeUsers, {});
  return Object.values(all ?? {}).sort((a, b) => a.username.localeCompare(b.username));
}

export async function getUser(id: string): Promise<OfficeUser | null> {
  const all = await getJSONStrict<Users>(KEYS.officeUsers, {});
  return all?.[id] ?? null;
}

export async function findUser(username: string): Promise<OfficeUser | null> {
  const u = normalizeUsername(username);
  return (await listUsers()).find((x) => x.username === u) ?? null;
}

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new OfficeUserError(`Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
  if (pw.length > 200) throw new OfficeUserError("Das Passwort ist zu lang.");
  if (pw === process.env.ADMIN_PASSWORD) throw new OfficeUserError("Bitte nicht das Administrator-Passwort verwenden.");
}

export async function createUser(input: { username: string; name: string; role: string; password: string }): Promise<OfficeUser> {
  const username = normalizeUsername(input.username);
  const name = input.name.trim().slice(0, 80);
  if (!USERNAME.test(username)) throw new OfficeUserError("Benutzername: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Minus oder Unterstrich.");
  if (!name) throw new OfficeUserError("Bitte einen Namen eintragen.");
  if (!isStaffRole(input.role)) throw new OfficeUserError("Bitte eine Rolle wählen.");
  checkPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const t = new Date(now()).toISOString();
  let created: OfficeUser | undefined;
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => {
    created = undefined;
    const list = Object.values(all ?? {});
    if (list.some((u) => u.username === username)) throw new OfficeUserError("Diesen Benutzernamen gibt es schon.");
    if (list.length >= MAX_USERS) throw new OfficeUserError(`Höchstens ${MAX_USERS} Büro-Zugänge.`);
    created = { id: randomBytes(8).toString("hex"), username, name, role: input.role as StaffRole, passwordHash, version: 1, active: true, createdAt: t, updatedAt: t };
    return { ...all, [created.id]: created };
  });
  if (!created) throw new Error("Speichern fehlgeschlagen");
  return created;
}

export type UserChange = { name?: string; role?: string; active?: boolean; password?: string; resetTwoFactor?: boolean };

/** Ändern – jede Änderung beendet die laufenden Sitzungen dieser Person (neue Version) */
export async function updateUser(id: string, change: UserChange): Promise<OfficeUser> {
  if (change.role !== undefined && !isStaffRole(change.role)) throw new OfficeUserError("Unbekannte Rolle.");
  if (change.password !== undefined) checkPassword(change.password);
  const passwordHash = change.password !== undefined ? await hashPassword(change.password) : undefined;
  let updated: OfficeUser | undefined;
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => {
    updated = undefined;
    const u = all?.[id];
    if (!u) throw new OfficeUserError("Zugang nicht gefunden.");
    const next: OfficeUser = { ...u, version: u.version + 1, updatedAt: new Date(now()).toISOString() };
    if (change.name !== undefined) next.name = change.name.trim().slice(0, 80) || u.name;
    if (change.role !== undefined) next.role = change.role as StaffRole;
    if (change.active !== undefined) next.active = change.active;
    if (passwordHash) next.passwordHash = passwordHash;
    if (change.resetTwoFactor) {
      delete next.totp;
      delete next.recovery;
    }
    updated = next;
    return { ...all, [id]: next };
  });
  if (!updated) throw new Error("Speichern fehlgeschlagen");
  if (change.resetTwoFactor) await kv().del(LAST(id));
  return updated;
}

export async function deleteUser(id: string) {
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => {
    const { [id]: _, ...rest } = all ?? {};
    return rest;
  });
  await kv().del(LAST(id));
}

// Vergleichs-Hash, damit unbekannte Benutzernamen gleich lange dauern wie falsche Passwörter
let dummyHash: Promise<string> | undefined;

/** Benutzername + Passwort prüfen. Gesperrte oder unbekannte Zugänge → null (gleiche Dauer). */
export async function verifyLogin(username: string, password: string): Promise<OfficeUser | null> {
  const u = await findUser(username);
  if (!u) {
    dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(password, await dummyHash);
    return null;
  }
  const ok = await verifyPassword(password.slice(0, 512), u.passwordHash);
  return ok && u.active ? u : null;
}

/** Zweiter Faktor einer Büro-Person: TOTP (jeder Zeitschritt nur einmal) oder Wiederherstellungscode (genau einmal) */
export async function verifyUserSecondFactor(id: string, code: string, kind: "totp" | "recovery"): Promise<boolean> {
  const u = await getUser(id);
  if (!u?.active || !u.totp) return false;
  if (kind === "totp") {
    let secret: string;
    try {
      secret = decryptSecret(u.totp.secret);
    } catch {
      console.error("[office] 2FA-Geheimnis kann nicht entschlüsselt werden (ADMIN_2FA_KEY geändert?)");
      return false;
    }
    const counter = verifyTotp(secret, code, now());
    if (counter === null) return false;
    return kv().setIfGreater(LAST(id), counter);
  }
  if (!u.recovery) return false;
  const hash = hashRecoveryCode(code, u.recovery.salt);
  let used = false;
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => {
    used = false;
    const cur = all?.[id];
    if (!cur?.recovery?.hashes.includes(hash)) return all;
    used = true;
    return { ...all, [id]: { ...cur, recovery: { ...cur.recovery, hashes: cur.recovery.hashes.filter((h) => h !== hash) } } };
  });
  return used;
}

/** 2FA nach erfolgreicher Einrichtung speichern; liefert die Wiederherstellungscodes einmalig im Klartext */
export async function enableUserTwoFactor(id: string, secret: string, counter: number): Promise<string[]> {
  const codes = newRecoveryCodes();
  const salt = randomBytes(16).toString("hex");
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => {
    const u = all?.[id];
    if (!u) throw new OfficeUserError("Zugang nicht gefunden.");
    return { ...all, [id]: { ...u, totp: { secret: encryptSecret(secret), enabledAt: new Date(now()).toISOString() }, recovery: { salt, hashes: codes.map((c) => hashRecoveryCode(c, salt)) } } };
  });
  await kv().del(LAST(id));
  await kv().setIfGreater(LAST(id), counter);
  return codes;
}

export async function noteLogin(id: string) {
  await updateJSON<Users>(KEYS.officeUsers, {}, (all) => (all?.[id] ? { ...all, [id]: { ...all[id], lastLoginAt: new Date(now()).toISOString() } } : all)).catch(() => undefined);
}

/** Für die Anzeige: ohne Hashes und Geheimnisse */
export type PublicUser = Pick<OfficeUser, "id" | "username" | "name" | "role" | "active" | "createdAt" | "lastLoginAt"> & { twoFactor: boolean; recoveryLeft: number };
export const publicUser = (u: OfficeUser): PublicUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
  twoFactor: Boolean(u.totp),
  recoveryLeft: u.recovery?.hashes.length ?? 0,
});
