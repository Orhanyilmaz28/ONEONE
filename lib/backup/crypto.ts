import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Verschlüsselung der Sicherungsdateien – AES-256-GCM (authentifiziert).
 *
 * - Schlüssel: Umgebungsvariable BACKUP_ENCRYPTION_KEY (mind. 32 zufällige Zeichen), getrennt von allen anderen Schlüsseln.
 *   Er steht nie im Code, nie in der Sicherung und nie im Protokoll.
 * - Je Sicherung ein eigener Datenschlüssel: HKDF-SHA256 aus dem Hauptschlüssel und einem zufälligen Salz (32 Byte).
 *   Dazu eine zufällige Nonce (12 Byte). Weil jeder Datenschlüssel nur ein einziges Mal benutzt wird,
 *   kann sich eine Nonce nie mit demselben Schlüssel wiederholen.
 * - Der Dateikopf (Format, Salz, Nonce, Schlüssel-Kennung, Zeitpunkt) ist als „zusätzliche Daten“ mit geschützt:
 *   Jede Änderung an Kopf oder Inhalt lässt die Entschlüsselung scheitern.
 * - Schlüsselwechsel: der alte Schlüssel kann als BACKUP_ENCRYPTION_KEY_PREVIOUS (nur zum Lesen) stehen bleiben.
 *
 * Dateiaufbau: "EXSTBK1\n" · Kopflänge (4 Byte) · Kopf (JSON) · verschlüsselte Daten · Prüfwert (16 Byte)
 */
export const MIN_BACKUP_KEY_LENGTH = 32;
const MAGIC = Buffer.from("EXSTBK1\n", "ascii");
const INFO = "exstase-backup-v1";
const TAG_BYTES = 16;
const MAX_HEADER = 4096;

export type BackupHeader = {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "HKDF-SHA256";
  compression: "gzip";
  salt: string;
  iv: string;
  /** kurzer Fingerabdruck des Schlüssels (verrät nichts über ihn) – zeigt, mit welchem Schlüssel verschlüsselt wurde */
  keyId: string;
  id: string;
  createdAt: string;
};

export class BackupKeyMissingError extends Error {
  override name = "BackupKeyMissingError";
  constructor() {
    super("BACKUP_ENCRYPTION_KEY fehlt oder ist kürzer als 32 Zeichen.");
  }
}
export class BackupDecryptError extends Error {
  override name = "BackupDecryptError";
}

export function backupKeyConfigured() {
  return (process.env.BACKUP_ENCRYPTION_KEY ?? "").length >= MIN_BACKUP_KEY_LENGTH;
}

export const keyIdOf = (raw: string) => createHmac("sha256", raw).update("exstase-backup-key-id").digest("hex").slice(0, 12);

function currentKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY ?? "";
  if (raw.length < MIN_BACKUP_KEY_LENGTH) throw new BackupKeyMissingError();
  return raw;
}

/** Schlüssel, mit denen entschlüsselt werden darf (aktueller + optional vorheriger) */
function readableKeys() {
  return [process.env.BACKUP_ENCRYPTION_KEY, process.env.BACKUP_ENCRYPTION_KEY_PREVIOUS].filter((k): k is string => typeof k === "string" && k.length >= MIN_BACKUP_KEY_LENGTH);
}

export function currentKeyId() {
  return backupKeyConfigured() ? keyIdOf(currentKey()) : null;
}

const derive = (raw: string, salt: Buffer) => Buffer.from(hkdfSync("sha256", raw, salt, INFO, 32));

export const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** Klartext (JSON) → komprimiert → verschlüsselt */
export function encryptBackup(plain: Buffer, meta: { id: string; createdAt: string }): Buffer {
  const raw = currentKey();
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const header: BackupHeader = { v: 1, alg: "AES-256-GCM", kdf: "HKDF-SHA256", compression: "gzip", salt: salt.toString("base64"), iv: iv.toString("base64"), keyId: keyIdOf(raw), id: meta.id, createdAt: meta.createdAt };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(headerBytes.length);
  const prefix = Buffer.concat([MAGIC, len, headerBytes]);
  const cipher = createCipheriv("aes-256-gcm", derive(raw, salt), iv);
  cipher.setAAD(prefix);
  const body = Buffer.concat([cipher.update(gzipSync(plain, { level: 6 })), cipher.final()]);
  return Buffer.concat([prefix, body, cipher.getAuthTag()]);
}

/** Nur den Kopf lesen (ohne Schlüssel) – z. B. um die Schlüssel-Kennung zu prüfen */
export function readHeader(file: Buffer): { header: BackupHeader; prefixLength: number } {
  if (file.length < MAGIC.length + 4 + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupDecryptError("Keine EXSTASE-Sicherungsdatei (Kennung fehlt).");
  const n = file.readUInt32BE(MAGIC.length);
  if (n < 2 || n > MAX_HEADER || MAGIC.length + 4 + n + TAG_BYTES > file.length) throw new BackupDecryptError("Dateikopf beschädigt.");
  let header: BackupHeader;
  try {
    header = JSON.parse(file.subarray(MAGIC.length + 4, MAGIC.length + 4 + n).toString("utf8")) as BackupHeader;
  } catch {
    throw new BackupDecryptError("Dateikopf beschädigt.");
  }
  if (header.v !== 1 || header.alg !== "AES-256-GCM" || header.kdf !== "HKDF-SHA256" || typeof header.salt !== "string" || typeof header.iv !== "string") throw new BackupDecryptError("Unbekanntes Sicherungsformat.");
  return { header, prefixLength: MAGIC.length + 4 + n };
}

/** Entschlüsseln und entpacken. Falscher Schlüssel oder jede Veränderung → BackupDecryptError */
export function decryptBackup(file: Buffer): { header: BackupHeader; plain: Buffer } {
  const { header, prefixLength } = readHeader(file);
  const keys = readableKeys();
  if (!keys.length) throw new BackupKeyMissingError();
  const salt = Buffer.from(header.salt, "base64");
  const iv = Buffer.from(header.iv, "base64");
  if (salt.length !== 32 || iv.length !== 12) throw new BackupDecryptError("Dateikopf beschädigt.");
  // passenden Schlüssel über die Kennung wählen; bei unbekannter Kennung alle versuchen
  const ordered = [...keys.filter((k) => keyIdOf(k) === header.keyId), ...keys.filter((k) => keyIdOf(k) !== header.keyId)];
  const prefix = file.subarray(0, prefixLength);
  const body = file.subarray(prefixLength, file.length - TAG_BYTES);
  const tag = file.subarray(file.length - TAG_BYTES);
  for (const raw of ordered) {
    try {
      const d = createDecipheriv("aes-256-gcm", derive(raw, salt), iv);
      d.setAAD(prefix);
      d.setAuthTag(tag);
      const packed = Buffer.concat([d.update(body), d.final()]);
      return { header, plain: gunzipSync(packed) };
    } catch {
      // nächster Schlüssel
    }
  }
  throw new BackupDecryptError("Entschlüsselung fehlgeschlagen – falscher Schlüssel oder die Datei wurde verändert.");
}
