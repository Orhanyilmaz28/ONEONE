import { sha256Hex } from "./crypto";
import { VERSION_PREFIX, classifyKey, expectsJson } from "./keys";

/**
 * Inhalt einer Sicherung (vor der Verschlüsselung) und seine Prüfung.
 */
export type EntryType = "string" | "list" | "set" | "hash" | "zset";
export type EntryValue = string | string[] | Record<string, string> | [string, string][];

export type BackupEntry = {
  k: string;
  t: EntryType;
  v: EntryValue;
  /** verbleibende Laufzeit in Millisekunden (nur bei Schlüsseln mit Ablauf, z. B. Einmal-Marker) */
  ttl?: number;
  /** SHA-256 des Inhalts */
  h: string;
};

export type CategorySummary = { category: string; count: number; bytes: number };
export type ExcludedSummary = { category: string; count: number; reason: string };

export type BackupPayload = {
  format: "exstase-backup";
  version: 1;
  id: string;
  createdAt: string;
  source: { kind: "redis" | "file"; target: string };
  consistency: {
    method: string;
    /** Zeitpunkt, zu dem alle versionierten Werte nachweislich gleichzeitig galten */
    snapshotAt: string;
    rounds: number;
    versionedKeys: number;
  };
  entries: BackupEntry[];
  summary: CategorySummary[];
  excluded: ExcludedSummary[];
  manifest: { count: number; bytes: number; sha256: string };
};

export class BackupFormatError extends Error {
  override name = "BackupFormatError";
}

/** Eindeutige Textform eines Werts (für Prüfsummen und Vergleiche) */
export function canonical(t: EntryType, v: EntryValue): string {
  if (t === "string") return v as string;
  if (t === "list" || t === "zset") return JSON.stringify(v);
  if (t === "set") return JSON.stringify([...(v as string[])].sort());
  return JSON.stringify(Object.entries(v as Record<string, string>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export const entryHash = (t: EntryType, v: EntryValue) => sha256Hex(canonical(t, v));
export const entryBytes = (e: Pick<BackupEntry, "k" | "t" | "v">) => Buffer.byteLength(e.k) + Buffer.byteLength(canonical(e.t, e.v));

export function manifestOf(entries: BackupEntry[]) {
  const lines = [...entries].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)).map((e) => `${e.k}\u0000${e.t}\u0000${e.h}\n`);
  return { count: entries.length, bytes: entries.reduce((n, e) => n + entryBytes(e), 0), sha256: sha256Hex(lines.join("")) };
}

export function summarize(entries: BackupEntry[]): CategorySummary[] {
  const m = new Map<string, CategorySummary>();
  for (const e of entries) {
    const c = classifyKey(e.k).category;
    const cur = m.get(c) ?? { category: c, count: 0, bytes: 0 };
    cur.count++;
    cur.bytes += entryBytes(e);
    m.set(c, cur);
  }
  return [...m.values()].sort((a, b) => b.bytes - a.bytes);
}

const TYPES = new Set<EntryType>(["string", "list", "set", "hash", "zset"]);

/**
 * Vollständige Strukturprüfung einer entschlüsselten Sicherung:
 * Format, jeder Eintrag (Typ, Wert, Prüfsumme), Manifest (Anzahl, Gesamtprüfsumme), Versionszähler, JSON-Inhalte.
 * Wirft BackupFormatError mit einer verständlichen Meldung.
 */
export function validatePayload(raw: unknown): BackupPayload {
  const p = raw as BackupPayload;
  if (!p || typeof p !== "object" || p.format !== "exstase-backup" || p.version !== 1) throw new BackupFormatError("Unbekanntes Sicherungsformat.");
  if (typeof p.id !== "string" || typeof p.createdAt !== "string" || !Array.isArray(p.entries) || !p.manifest) throw new BackupFormatError("Sicherung unvollständig (Pflichtangaben fehlen).");
  const seen = new Set<string>();
  for (const e of p.entries) {
    if (!e || typeof e.k !== "string" || !TYPES.has(e.t) || typeof e.h !== "string") throw new BackupFormatError("Ungültiger Eintrag in der Sicherung.");
    if (seen.has(e.k)) throw new BackupFormatError(`Schlüssel doppelt: ${e.k}`);
    seen.add(e.k);
    const okValue =
      e.t === "string"
        ? typeof e.v === "string"
        : e.t === "list" || e.t === "set"
          ? Array.isArray(e.v) && (e.v as unknown[]).every((x) => typeof x === "string")
          : e.t === "zset"
            ? Array.isArray(e.v) && (e.v as unknown[]).every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && typeof x[1] === "string")
            : typeof e.v === "object" && e.v !== null && !Array.isArray(e.v) && Object.values(e.v).every((x) => typeof x === "string");
    if (!okValue) throw new BackupFormatError(`Ungültiger Wert: ${e.k}`);
    if (e.ttl !== undefined && !(Number.isInteger(e.ttl) && e.ttl > 0)) throw new BackupFormatError(`Ungültige Laufzeit: ${e.k}`);
    if (entryHash(e.t, e.v) !== e.h) throw new BackupFormatError(`Prüfsumme stimmt nicht: ${e.k}`);
    if (!classifyKey(e.k).include) throw new BackupFormatError(`Schlüssel darf nicht in einer Sicherung stehen: ${e.k}`);
    if (e.t === "string" && e.k.startsWith(VERSION_PREFIX) && !/^\d+$/.test(e.v as string)) throw new BackupFormatError(`Versionszähler ungültig: ${e.k}`);
  }
  const m = manifestOf(p.entries);
  if (m.count !== p.manifest.count || m.sha256 !== p.manifest.sha256) throw new BackupFormatError("Manifest stimmt nicht – Sicherung unvollständig oder verändert.");
  return p;
}

/**
 * Geschäftsdaten, die kein gültiges JSON sind (beschädigt). Sie werden trotzdem unverändert gesichert –
 * eine einzelne beschädigte Stelle darf nicht alle künftigen Sicherungen verhindern – und als Warnung gemeldet.
 */
export function corruptEntries(entries: BackupEntry[]): string[] {
  return entries
    .filter((e) => e.t === "string" && expectsJson(e.k))
    .filter((e) => {
      try {
        JSON.parse(e.v as string);
        return false;
      } catch {
        return true;
      }
    })
    .map((e) => e.k);
}

export function parsePayload(plain: Buffer): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(plain.toString("utf8"));
  } catch {
    throw new BackupFormatError("Inhalt ist kein gültiges JSON.");
  }
  return validatePayload(raw);
}
