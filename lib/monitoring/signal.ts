/**
 * Grundlage der Datenbanküberwachung: Störungen melden, zählen und (wenn möglich) in Redis vermerken.
 *
 * Bewusst ohne Abhängigkeiten zu lib/store.ts, damit der Datenspeicher selbst Störungen melden kann, ohne Kreisbezug.
 * - Jede Meldung erscheint als eine Zeile im Server-Protokoll (Vercel → Logs), ohne Tokens, Passwörter oder Inhalte.
 * - Zusätzlich wird sie – gedrosselt – in Redis gespeichert (tt:monitor:events, tt:monitor:h:<stunde>), damit das
 *   Dashboard sie anzeigen kann. Ist Redis selbst gestört, bleibt es beim Server-Protokoll.
 */
export type IncidentType =
  | "redis_unreachable"
  | "redis_timeout"
  | "data_corrupt"
  | "write_conflict"
  | "backup_failed"
  | "restore_failed"
  | "backup_overdue"
  | "error_spike"
  | "office_report_failed"
  | "stripe_unreachable";

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  redis_unreachable: "Datenbank nicht erreichbar",
  redis_timeout: "Datenbank-Zeitüberschreitung",
  data_corrupt: "Beschädigte Daten",
  write_conflict: "Schreibkonflikt",
  backup_failed: "Sicherung fehlgeschlagen",
  restore_failed: "Wiederherstellung fehlgeschlagen",
  backup_overdue: "Sicherung überfällig",
  error_spike: "Ungewöhnlich viele Fehler",
  office_report_failed: "Automatischer Bürobericht fehlgeschlagen",
  stripe_unreachable: "Stripe nicht erreichbar",
};

export type Incident = { at: string; type: IncidentType; detail?: string };

export const EVENTS_KEY = "tt:monitor:events";
export const hourKey = (d: Date) => `tt:monitor:h:${d.toISOString().slice(0, 13).replace(/[-T]/g, "")}`;
const MAX_EVENTS = 500;
/** je Art höchstens alle 30 Sekunden pro Server in Redis schreiben (Schutz vor Befehlsflut bei einem Ausfall) */
const PERSIST_EVERY_MS = 30_000;

type State = { recent: Incident[]; lastPersist: Map<IncidentType, number>; suppressed: Map<IncidentType, number> };
const g = globalThis as unknown as { __ttMonitor?: State };
const state = (): State => (g.__ttMonitor ??= { recent: [], lastPersist: new Map(), suppressed: new Map() });

/** Text kürzen und alles entfernen, was wie ein Geheimnis aussieht */
export function scrub(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  return detail
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
    .replace(/\b(token|key|secret|password|passwort)=\S+/gi, "$1=***")
    .replace(/https?:\/\/[^\s]+/g, "[Adresse]")
    .slice(0, 160);
}

/** Störung melden – wirft nie, blockiert nie */
export function reportIncident(type: IncidentType, detail?: string) {
  const incident: Incident = { at: new Date().toISOString(), type, ...(detail ? { detail: scrub(detail) } : {}) };
  const s = state();
  s.recent.unshift(incident);
  s.recent.length = Math.min(s.recent.length, 100);
  console.error(`[monitor] ${type}${incident.detail ? ` – ${incident.detail}` : ""}`);
  if (process.env.MONITOR_PERSIST === "0") return;
  const last = s.lastPersist.get(type) ?? 0;
  const now = Date.now();
  if (now - last < PERSIST_EVERY_MS) {
    s.suppressed.set(type, (s.suppressed.get(type) ?? 0) + 1);
    return;
  }
  s.lastPersist.set(type, now);
  const extra = s.suppressed.get(type) ?? 0;
  s.suppressed.set(type, 0);
  void persist(incident, 1 + extra);
}

/** In diesem Server seit dem Start gesehene Störungen (neueste zuerst) */
export function recentIncidents(): Incident[] {
  return [...state().recent];
}

async function persist(incident: Incident, count: number) {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return;
  const hk = hourKey(new Date(incident.at));
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["LPUSH", EVENTS_KEY, JSON.stringify(count > 1 ? { ...incident, detail: `${incident.detail ?? ""} (${count}×)`.trim() } : incident)],
        ["LTRIM", EVENTS_KEY, 0, MAX_EVENTS - 1],
        ["HINCRBY", hk, incident.type, count],
        ["EXPIRE", hk, 60 * 60 * 48],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Redis gestört – die Meldung steht bereits im Server-Protokoll
  }
}
