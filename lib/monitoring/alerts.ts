import type { RedisClient } from "../backup/redis-rest";
import { EVENTS_KEY, INCIDENT_LABEL, type Incident, type IncidentType, scrub } from "./signal";

/**
 * Grundlage für Benachrichtigungen an den Administrator.
 *
 * Jede Warnung wird als fertige E-Mail vorbereitet und im Dashboard (Datensicherung → Meldungen) angezeigt.
 * Versendet wird NUR, wenn ALERT_EMAILS_ENABLED=1 UND ADMIN_ALERT_EMAIL gesetzt sind – beides ist standardmäßig aus.
 * Gleiche Warnungen höchstens alle 6 Stunden (keine Flut bei einem längeren Ausfall).
 */
export type AlertDraft = { at: string; type: IncidentType; subject: string; text: string; sent: boolean; note: string };

const ALERTS_KEY = "tt:monitor:alerts";
const DEDUPE = (t: IncidentType) => `tt:monitor:alert:${t}`;
const DEDUPE_SECONDS = 6 * 60 * 60;

export const alertEmailsEnabled = () => process.env.ALERT_EMAILS_ENABLED === "1" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_ALERT_EMAIL ?? "");

export function draftAlert(type: IncidentType, detail?: string): Omit<AlertDraft, "sent" | "note"> {
  const label = INCIDENT_LABEL[type];
  const clean = scrub(detail);
  return {
    at: new Date().toISOString(),
    type,
    subject: `EXSTASE Shop: ${label}`,
    text: [`Hallo,`, ``, `im EXSTASE-Shop wurde eine Störung erkannt: ${label}.`, clean ? `Details: ${clean}` : "", ``, `Bitte im Dashboard unter „Datensicherung“ nachsehen.`, ``, `– Automatische Meldung, bitte nicht antworten.`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

/** Warnung auslösen. `send` wird nur aufgerufen, wenn E-Mails ausdrücklich freigeschaltet sind. */
export async function raiseAlert(
  redis: RedisClient | null,
  type: IncidentType,
  detail?: string,
  send?: (draft: Omit<AlertDraft, "sent" | "note">, to: string) => Promise<boolean>,
): Promise<AlertDraft | null> {
  try {
    if (redis) {
      const fresh = (await redis.cmd<string | null>(["SET", DEDUPE(type), "1", "NX", "EX", DEDUPE_SECONDS])) === "OK";
      if (!fresh) return null;
    }
    const draft = draftAlert(type, detail);
    let sent = false;
    let note = "Nicht versendet – E-Mail-Benachrichtigungen sind noch nicht freigeschaltet (ALERT_EMAILS_ENABLED).";
    if (alertEmailsEnabled() && send) {
      sent = await send(draft, process.env.ADMIN_ALERT_EMAIL as string).catch(() => false);
      note = sent ? "Per E-Mail an den Administrator gesendet." : "Versand fehlgeschlagen.";
    }
    const full: AlertDraft = { ...draft, sent, note };
    if (redis) {
      await redis.pipeline([
        ["LPUSH", ALERTS_KEY, JSON.stringify(full)],
        ["LTRIM", ALERTS_KEY, 0, 99],
      ]);
    }
    console.error(`[monitor] Warnung: ${type} (${sent ? "gesendet" : "nicht gesendet"})`);
    return full;
  } catch {
    console.error(`[monitor] Warnung ${type} konnte nicht gespeichert werden`);
    return null;
  }
}

export async function listAlerts(redis: RedisClient, limit = 20): Promise<AlertDraft[]> {
  const raw = (await redis.cmd<string[]>(["LRANGE", ALERTS_KEY, 0, limit - 1])) ?? [];
  return raw.flatMap((r) => {
    try {
      return [JSON.parse(r) as AlertDraft];
    } catch {
      return [];
    }
  });
}

/** Gespeicherte Störungsmeldungen (neueste zuerst) */
export async function listIncidents(redis: RedisClient, limit = 30): Promise<Incident[]> {
  const raw = (await redis.cmd<string[]>(["LRANGE", EVENTS_KEY, 0, limit - 1])) ?? [];
  return raw.flatMap((r) => {
    try {
      return [JSON.parse(r) as Incident];
    } catch {
      return [];
    }
  });
}
