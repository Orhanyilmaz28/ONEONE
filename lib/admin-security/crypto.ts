import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Verschlüsselung des TOTP-Geheimnisses im Speicher (AES-256-GCM).
 * Schlüssel: Umgebungsvariable ADMIN_2FA_KEY (mindestens 32 Zeichen, zufällig) – wird nie gespeichert oder protokolliert.
 */
export const MIN_KEY_LENGTH = 32;

export function encryptionConfigured() {
  return (process.env.ADMIN_2FA_KEY ?? "").length >= MIN_KEY_LENGTH;
}

function key() {
  const raw = process.env.ADMIN_2FA_KEY ?? "";
  if (raw.length < MIN_KEY_LENGTH) throw new Error("ADMIN_2FA_KEY fehlt oder ist zu kurz");
  return Buffer.from(hkdfSync("sha256", raw, "tt-admin-2fa", "totp-secret-v1", 32));
}

/** Liefert „v1.<iv>.<tag>.<daten>“ (Base64url) */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(box: string) {
  const [v, iv, tag, data] = box.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/* Wiederherstellungscodes: 10 Stück, je 10 Zeichen (ca. 50 Bit), gespeichert nur als Hash mit Salz */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I
export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = [...b].map((x) => CODE_ALPHABET[x % 32]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (code: string, salt: string) => sha256(`${salt}:${normalizeRecoveryCode(code)}`);
