import { kv } from "../kv";
import { sha256 } from "./crypto";

/**
 * Begrenzung von Versuchen über atomare Redis-Zähler (fester Zeitraum je Schlüssel).
 * Gilt instanzübergreifend – mehrere Vercel-Instanzen teilen sich dieselben Zähler.
 */
export const LIMITS = {
  /** Passwort: je IP 10 Versuche in 15 Minuten, insgesamt 50 */
  loginIp: { max: 10, window: 15 * 60 },
  loginGlobal: { max: 50, window: 15 * 60 },
  /** Büro-Zugang: je Benutzername 10 Versuche in 15 Minuten */
  loginUser: { max: 10, window: 15 * 60 },
  /** Zweiter Faktor (TOTP oder Wiederherstellungscode): je Anmeldevorgang 5, je IP 10 / 15 Min., insgesamt 30 */
  secondFactorSession: { max: 5, window: 10 * 60 },
  secondFactorIp: { max: 10, window: 15 * 60 },
  secondFactorGlobal: { max: 30, window: 15 * 60 },
  /** Sicherheitsaktionen im Dashboard (2FA einrichten/ändern, Sitzungen beenden): je IP 20 pro Stunde */
  securityAction: { max: 20, window: 60 * 60 },
  /** Datensicherung (sichern, prüfen, Testwiederherstellung): je IP 12 pro Stunde */
  backupAction: { max: 12, window: 60 * 60 },
  /** Excel-Exporte der Büroverwaltung: je Person 60 pro Stunde */
  officeExport: { max: 60, window: 60 * 60 },
  /** PDF-Dokumente der Büroverwaltung (Lieferscheine, Listen, Berichte): je Person 120 pro Stunde */
  officeDocument: { max: 120, window: 60 * 60 },
  /** Bearbeitungsschritte der Büroverwaltung (Freigabe, Weitergabe, Versand …): je Person 600 pro Stunde (Sammelaktion = 1) */
  officeWorkflow: { max: 600, window: 60 * 60 },
  /** Büro-Zugänge anlegen/ändern: je IP 30 pro Stunde */
  officeUsers: { max: 30, window: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export type LimitResult = { ok: boolean; count: number; retryAfter: number };

export async function hitLimit(name: LimitName, subject: string): Promise<LimitResult> {
  const { max, window } = LIMITS[name];
  const { count, ttl } = await kv().incrWindow(`tt:adm:rl:${name}:${sha256(subject).slice(0, 32)}`, window);
  return { ok: count <= max, count, retryAfter: Math.max(1, ttl) };
}

/** Mehrere Begrenzungen auf einmal zählen – blockiert, sobald eine überschritten ist */
export async function hitLimits(checks: [LimitName, string][]): Promise<LimitResult> {
  const results = await Promise.all(checks.map(([n, s]) => hitLimit(n, s)));
  const blocked = results.filter((r) => !r.ok);
  if (!blocked.length) return { ok: true, count: 0, retryAfter: 0 };
  return { ok: false, count: Math.max(...blocked.map((b) => b.count)), retryAfter: Math.max(...blocked.map((b) => b.retryAfter)) };
}
