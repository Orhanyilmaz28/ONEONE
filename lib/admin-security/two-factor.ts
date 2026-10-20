import { randomBytes } from "node:crypto";
import { kv } from "../kv";
import { now } from "./clock";
import { decryptSecret, encryptSecret, encryptionConfigured, hashRecoveryCode, newRecoveryCodes } from "./crypto";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

/**
 * Zwei-Faktor-Anmeldung (TOTP) für das Dashboard.
 * - Geheimnis verschlüsselt gespeichert (ADMIN_2FA_KEY), nie im Klartext und nie im Protokoll
 * - jeder Code (Zeitschritt) nur einmal gültig
 * - 10 Wiederherstellungscodes, nur als Hash gespeichert, jeder genau einmal einlösbar (atomares Entfernen)
 * - ADMIN_REQUIRE_2FA=1: ohne eingerichtete 2FA gibt es nach dem Passwort nur die Einrichtung, kein Dashboard
 */
const STATE = "tt:adm:2fa";
const LAST = "tt:adm:2fa:last";
const RECOVERY = "tt:adm:2fa:recovery";
const SETUP = (sessionId: string) => `tt:adm:2fa:setup:${sessionId}`;
const SETUP_TTL = 15 * 60;

type State = { secret: string; salt: string; enabledAt: string };

export const twoFactorRequired = () => process.env.ADMIN_REQUIRE_2FA === "1";
export { encryptionConfigured };

async function state(): Promise<State | null> {
  const raw = await kv().get(STATE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as State;
  } catch {
    return null;
  }
}

export async function twoFactorStatus() {
  const s = await state();
  return { enabled: Boolean(s), enabledAt: s?.enabledAt, recoveryLeft: s ? await kv().scard(RECOVERY) : 0 };
}

export const twoFactorEnabled = async () => Boolean(await state());

/** Neues Geheimnis für die Einrichtung (gehört zur Sitzung, 15 Minuten gültig) */
export async function startSetup(sessionId: string, account: string) {
  const secret = newTotpSecret();
  await kv().set(SETUP(sessionId), encryptSecret(secret), { ex: SETUP_TTL });
  return { secret, uri: otpauthUri(secret, account, "EXSTASE Dashboard") };
}

/** Laufende Einrichtung lesen (für die Anzeige nach dem Neuladen) */
export async function pendingSetup(sessionId: string, account: string) {
  const box = await kv().get(SETUP(sessionId));
  if (!box) return null;
  const secret = decryptSecret(box);
  return { secret, uri: otpauthUri(secret, account, "EXSTASE Dashboard") };
}

async function storeRecoveryCodes(salt: string) {
  const codes = newRecoveryCodes();
  await kv().del(RECOVERY);
  await kv().sadd(RECOVERY, ...codes.map((c) => hashRecoveryCode(c, salt)));
  return codes;
}

/**
 * Einrichtung abschließen: Code aus der App prüfen, 2FA aktivieren, neue Wiederherstellungscodes erzeugen.
 * Liefert die Codes einmalig zur Anzeige – danach existieren sie nur noch als Hash.
 */
export async function confirmSetup(sessionId: string, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; reason: "expired" | "invalid" }> {
  const box = await kv().get(SETUP(sessionId));
  if (!box) return { ok: false, reason: "expired" };
  const secret = decryptSecret(box);
  const counter = verifyTotp(secret, code, now());
  if (counter === null) return { ok: false, reason: "invalid" };
  const salt = randomBytes(16).toString("hex");
  const st: State = { secret: encryptSecret(secret), salt, enabledAt: new Date(now()).toISOString() };
  await kv().set(STATE, JSON.stringify(st));
  await kv().del(LAST);
  await kv().setIfGreater(LAST, counter);
  await kv().del(SETUP(sessionId));
  return { ok: true, recoveryCodes: await storeRecoveryCodes(salt) };
}

/** TOTP-Code prüfen – jeder Zeitschritt nur einmal (atomar in Redis) */
export async function verifySecondFactor(code: string): Promise<boolean> {
  const s = await state();
  if (!s) return false;
  let secret: string;
  try {
    secret = decryptSecret(s.secret);
  } catch {
    console.error("[admin-security] 2FA-Geheimnis kann nicht entschlüsselt werden (ADMIN_2FA_KEY geändert?)");
    return false;
  }
  const counter = verifyTotp(secret, code, now());
  if (counter === null) return false;
  return kv().setIfGreater(LAST, counter);
}

/** Wiederherstellungscode einlösen – genau einmal (atomares SREM) */
export async function useRecoveryCode(code: string): Promise<boolean> {
  const s = await state();
  if (!s) return false;
  return (await kv().srem(RECOVERY, hashRecoveryCode(code, s.salt))) === 1;
}

export async function regenerateRecoveryCodes() {
  const s = await state();
  if (!s) throw new Error("2FA ist nicht eingerichtet");
  return storeRecoveryCodes(s.salt);
}

export async function disableTwoFactor() {
  await kv().del(STATE, LAST, RECOVERY);
}
