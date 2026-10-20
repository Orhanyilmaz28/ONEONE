import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP nach RFC 6238 (HMAC-SHA1, 30 Sekunden, 6 Ziffern) – kompatibel mit Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password, Bitwarden usw.
 */
export const TOTP_STEP = 30;
export const TOTP_DIGITS = 6;
/** Erlaubte Abweichung: ein Zeitschritt davor/danach (Uhren laufen nie ganz gleich) */
export const TOTP_WINDOW = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Ungültiges Base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Neues Geheimnis: 160 Bit (Empfehlung RFC 4226), Base32 */
export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const code = ((h[offset] & 127) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const counterAt = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP);

export function totp(secretB32: string, ms: number) {
  return hotp(base32Decode(secretB32), counterAt(ms));
}

/**
 * Code prüfen. Liefert den Zeitschritt (counter), zu dem der Code passt, sonst null.
 * Der Aufrufer muss zusätzlich verhindern, dass ein Zeitschritt zweimal benutzt wird (Wiederverwendung).
 */
export function verifyTotp(secretB32: string, code: string, ms: number): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secretB32);
  const c = counterAt(ms);
  let match: number | null = null;
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const expected = Buffer.from(hotp(key, c + d));
    // alle Fenster prüfen (gleiche Laufzeit), zeitkonstant vergleichen
    if (timingSafeEqual(expected, Buffer.from(clean)) && match === null) match = c + d;
  }
  return match;
}

/** otpauth://-Adresse für den QR-Code */
export function otpauthUri(secretB32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`;
}
