import type { Product } from "../types";
import type { Activity } from "./activity";
import { collectUnits } from "./export";
import { computeKpis, countsAsRevenue } from "./kpis";
import { CHANNEL_LABEL, type Channel, type OfficeOrder } from "./model";
import { type CalDate, type Range, addDays, berlinParts, berlinToUtc, calKey, dayRange, formatCal, isoWeek, isoWeekday, monthRange, weekRange } from "./time";
import { addressComplete, attention, changedSinceRelease, officeStatus } from "./workflow";

/**
 * Büroautomatisierung (Phase 3D) – rein, ohne Speicher und ohne Netz (vollständig testbar).
 *
 * - Automatische Berichte: täglich / wöchentlich / monatlich zu einer Uhrzeit in deutscher Zeit (Europe/Berlin).
 *   Standardmäßig ist nichts aktiv. Ein Bericht läuft je Termin höchstens einmal (Lauf-Schlüssel je Termin).
 * - Büro-Benachrichtigungen und Erinnerungen werden aus den vorhandenen Bestellungen berechnet – keine zweite
 *   Bestelldatenbank. Sie enthalten nie vollständige Kundenadressen (nur Bestellnummer, Kanal, Grund).
 * - E-Mails: nur, wenn OFFICE_REPORT_EMAILS=1 gesetzt ist (Freigabe). Sonst werden Berichte nur intern abgelegt.
 * - Keine automatische Logistikübertragung, keine Kundennachrichten.
 */

/* ───────────── Konfiguration ───────────── */

export const FREQUENCIES = ["taeglich", "woechentlich", "monatlich"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<Frequency, string> = { taeglich: "Täglich", woechentlich: "Wöchentlich", monatlich: "Monatlich" };

export const REPORT_TYPES = ["tagesbericht", "kennzahlen", "versandliste", "sammelliste"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  tagesbericht: "Tagesbericht (Kennzahlen + Bestellungen)",
  kennzahlen: "Kennzahlen-Übersicht",
  versandliste: "Versandliste",
  sammelliste: "Artikel-Sammelliste",
};
/** Welche PDF-Art des Dokument-Endpunkts zum Bericht gehört (für „PDF ansehen“) */
export const REPORT_DOC: Record<ReportType, "tagesbericht" | "versandliste" | "sammelliste"> = { tagesbericht: "tagesbericht", kennzahlen: "tagesbericht", versandliste: "versandliste", sammelliste: "sammelliste" };

/** „abgeschlossen“ = Vortag / Vorwoche / Vormonat · „laufend“ = heutiger Tag / laufende Woche / laufender Monat bis zur Uhrzeit */
export const SCOPES = ["abgeschlossen", "laufend"] as const;
export type Scope = (typeof SCOPES)[number];

export type ReportSchedule = {
  id: string;
  name: string;
  active: boolean;
  frequency: Frequency;
  /** „HH:MM“ deutscher Zeit */
  time: string;
  /** 1 = Montag … 7 = Sonntag (nur wöchentlich) */
  weekday: number;
  /** 1–28 (nur monatlich; 29–31 bewusst nicht, damit es jeden Monat gibt) */
  monthDay: number;
  type: ReportType;
  scope: Scope;
  /** Kanal-Filter */
  channel: "alle" | Channel;
  /** E-Mail-Empfänger (nur genutzt, wenn E-Mails freigegeben sind) */
  recipients: string[];
  updatedAt: string;
  updatedBy: string;
};

export const NOTIFY_KINDS = ["neue_bestellung", "neue_haendlerbestellung", "zahlung_offen", "pruefung", "geaendert", "export_fehler", "bericht"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export const NOTIFY_LABEL: Record<NotifyKind, string> = {
  neue_bestellung: "Neue Privatbestellung",
  neue_haendlerbestellung: "Neue Händlerbestellung",
  zahlung_offen: "Zahlung offen oder fehlgeschlagen",
  pruefung: "Auftrag benötigt Prüfung",
  geaendert: "Bestellung nach Freigabe geändert",
  export_fehler: "Export oder Dokument fehlgeschlagen",
  bericht: "Bericht verfügbar / fehlgeschlagen",
};

export const REMINDER_KINDS = ["offen", "nicht_weitergegeben", "nicht_versendet", "lieferdaten", "export"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const REMINDER_LABEL: Record<ReminderKind, string> = {
  offen: "Bestellung länger offen",
  nicht_weitergegeben: "Freigegeben, aber nicht an die Logistik weitergegeben",
  nicht_versendet: "Weitergegeben, aber nicht als versendet dokumentiert",
  lieferdaten: "Unvollständige Lieferdaten",
  export: "Fehlerhafter Export",
};

export type ReminderRule = { enabled: boolean; hours: number };

export type AutomationConfig = {
  version: 1;
  schedules: ReportSchedule[];
  notify: Record<NotifyKind, boolean>;
  reminders: Record<ReminderKind, ReminderRule>;
  /** Empfänger der Benachrichtigungs-/Erinnerungs-Zusammenfassung (nur mit Freigabe OFFICE_REPORT_EMAILS=1) */
  digestRecipients: string[];
  /** Tägliche Zusammenfassung der Benachrichtigungen und Erinnerungen erstellen */
  digest: boolean;
  updatedAt: string;
  updatedBy: string;
};

export const MAX_SCHEDULES = 12;
export const MAX_RECIPIENTS = 5;

export const DEFAULT_CONFIG: AutomationConfig = {
  version: 1,
  schedules: [],
  notify: { neue_bestellung: true, neue_haendlerbestellung: true, zahlung_offen: true, pruefung: true, geaendert: true, export_fehler: true, bericht: true },
  reminders: {
    offen: { enabled: true, hours: 24 },
    nicht_weitergegeben: { enabled: true, hours: 24 },
    nicht_versendet: { enabled: true, hours: 48 },
    lieferdaten: { enabled: true, hours: 0 },
    export: { enabled: true, hours: 0 },
  },
  digestRecipients: [],
  digest: false,
  updatedAt: "",
  updatedBy: "",
};

/** Gespeicherte Konfiguration mit Standardwerten auffüllen (unbekannte/kaputte Werte → Standard, nie „aktiv“ raten) */
export function normalizeConfig(raw: unknown): AutomationConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AutomationConfig>;
  const notify = { ...DEFAULT_CONFIG.notify };
  for (const k of NOTIFY_KINDS) if (typeof r.notify?.[k] === "boolean") notify[k] = r.notify[k];
  const reminders = { ...DEFAULT_CONFIG.reminders };
  for (const k of REMINDER_KINDS) {
    const x = r.reminders?.[k];
    if (x && typeof x.enabled === "boolean" && Number.isFinite(x.hours)) reminders[k] = { enabled: x.enabled, hours: clampHours(x.hours) };
  }
  const schedules = (Array.isArray(r.schedules) ? r.schedules : []).flatMap((s) => {
    const v = validateSchedule(s as unknown as Record<string, unknown>);
    return v.ok ? [{ ...v.schedule, id: String((s as ReportSchedule).id), updatedAt: String((s as ReportSchedule).updatedAt ?? ""), updatedBy: String((s as ReportSchedule).updatedBy ?? "") }] : [];
  });
  return {
    version: 1,
    schedules: schedules.filter((s) => /^[A-Za-z0-9_-]{6,40}$/.test(s.id)).slice(0, MAX_SCHEDULES),
    notify,
    reminders,
    digestRecipients: cleanRecipients(r.digestRecipients).list,
    digest: r.digest === true,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
  };
}

const clampHours = (h: number) => Math.max(0, Math.min(24 * 60, Math.round(Number(h) || 0)));
const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}$/i;

export function cleanRecipients(raw: unknown): { list: string[]; invalid: string[] } {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,;]+/);
  const list: string[] = [];
  const invalid: string[] = [];
  for (const p of parts.map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!EMAIL.test(p) || p.length > 120) invalid.push(p.slice(0, 60));
    else if (!list.includes(p)) list.push(p);
  }
  return { list: list.slice(0, MAX_RECIPIENTS), invalid: list.length > MAX_RECIPIENTS ? [...invalid, `mehr als ${MAX_RECIPIENTS} Empfänger`] : invalid };
}

export type ScheduleInput = Omit<ReportSchedule, "id" | "updatedAt" | "updatedBy">;

/** Bericht prüfen (Formular oder gespeicherter Wert) */
export function validateSchedule(raw: Record<string, unknown>): { ok: true; schedule: ScheduleInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = String(raw.name ?? "")
    .replace(/[\u0000-\u001f\u007f<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (name.length < 2) errors.push("Bitte einen Namen für den Bericht angeben.");
  const frequency = FREQUENCIES.find((f) => f === raw.frequency);
  if (!frequency) errors.push("Bitte die Häufigkeit wählen.");
  const time = String(raw.time ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push("Bitte eine Uhrzeit im Format HH:MM angeben.");
  const weekday = Number(raw.weekday ?? 1);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) errors.push("Bitte einen Wochentag wählen.");
  const monthDay = Number(raw.monthDay ?? 1);
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28) errors.push("Tag im Monat: bitte 1 bis 28 (gibt es in jedem Monat).");
  const type = REPORT_TYPES.find((t) => t === raw.type);
  if (!type) errors.push("Bitte die Berichtsart wählen.");
  const scope = SCOPES.find((t) => t === raw.scope) ?? "abgeschlossen";
  const channel = raw.channel === "privat" || raw.channel === "haendler" ? raw.channel : "alle";
  const rec = cleanRecipients(raw.recipients);
  if (rec.invalid.length) errors.push(`Ungültige Empfänger: ${rec.invalid.join(", ")}`);
  if (errors.length || !frequency || !type) return { ok: false, errors };
  return { ok: true, schedule: { name, active: raw.active === true || raw.active === "1", frequency, time, weekday, monthDay, type, scope, channel, recipients: rec.list } };
}

/* ───────────── Zeitplan (Europe/Berlin) ───────────── */

const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
};
const todayCal = (now: number): CalDate => {
  const p = berlinParts(now);
  return { y: p.y, m: p.m, d: p.d };
};
/** Zeitpunkt (UTC) eines Termins an einem Kalendertag */
export const occurrenceAt = (c: CalDate, time: string) => {
  const { h, m } = hm(time);
  return berlinToUtc(c.y, c.m, c.d, h, m);
};

/** Letzter Termin, der zu `now` bereits fällig war (Kalendertag + Zeitpunkt) */
export function latestOccurrence(s: Pick<ReportSchedule, "frequency" | "time" | "weekday" | "monthDay">, now: number): { day: CalDate; at: number } {
  const today = todayCal(now);
  if (s.frequency === "taeglich") {
    const at = occurrenceAt(today, s.time);
    if (at <= now) return { day: today, at };
    const y = addDays(today, -1);
    return { day: y, at: occurrenceAt(y, s.time) };
  }
  if (s.frequency === "woechentlich") {
    for (let back = 0; back <= 7; back++) {
      const c = addDays(today, -back);
      if (isoWeekday(c) !== s.weekday) continue;
      const at = occurrenceAt(c, s.time);
      if (at <= now) return { day: c, at };
    }
  }
  // monatlich (und Rückfall)
  let c: CalDate = { y: today.y, m: today.m, d: s.monthDay };
  let at = occurrenceAt(c, s.time);
  if (at > now) {
    c = today.m === 1 ? { y: today.y - 1, m: 12, d: s.monthDay } : { y: today.y, m: today.m - 1, d: s.monthDay };
    at = occurrenceAt(c, s.time);
  }
  return { day: c, at };
}

/** Nächster Termin nach `now` (für die Anzeige) */
export function nextOccurrence(s: Pick<ReportSchedule, "frequency" | "time" | "weekday" | "monthDay">, now: number): number {
  const today = todayCal(now);
  for (let i = 0; i <= 62; i++) {
    const c = addDays(today, i);
    if (s.frequency === "woechentlich" && isoWeekday(c) !== s.weekday) continue;
    if (s.frequency === "monatlich" && c.d !== s.monthDay) continue;
    const at = occurrenceAt(c, s.time);
    if (at > now) return at;
  }
  return Number.NaN;
}

/** Zeitraum, über den der Bericht eines Termins berichtet */
export function reportRange(s: Pick<ReportSchedule, "frequency" | "scope">, day: CalDate, at: number): Range {
  if (s.frequency === "taeglich") {
    if (s.scope === "laufend") return { ...dayRange(day), to: at, label: `${formatCal(day)} (bis ${clock(at)} Uhr)` };
    return dayRange(addDays(day, -1));
  }
  if (s.frequency === "woechentlich") {
    const w = isoWeek(day);
    if (s.scope === "laufend") {
      const r = weekRange(w.year, w.week);
      return { ...r, to: at, label: `${r.label} (bis ${formatCal(day)} ${clock(at)} Uhr)` };
    }
    const prev = isoWeek(addDays(day, -7));
    return weekRange(prev.year, prev.week);
  }
  if (s.scope === "laufend") {
    const r = monthRange(day.y, day.m);
    return { ...r, to: at, label: `${r.label} (bis ${formatCal(day)} ${clock(at)} Uhr)` };
  }
  return day.m === 1 ? monthRange(day.y - 1, 12) : monthRange(day.y, day.m - 1);
}

const clock = (ms: number) => {
  const p = berlinParts(ms);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
};

/** Eindeutiger Schlüssel eines Termins – derselbe Termin läuft nie zweimal (auch bei doppeltem Cron-Aufruf) */
export const runKey = (scheduleId: string, day: CalDate) => `${scheduleId}:${calKey(day)}`;

/**
 * Fällige Berichte: aktiv, Termin erreicht, noch nicht gelaufen, nicht älter als `maxLateMs` (Standard 36 Stunden –
 * damit ein nur täglich laufender Cron einen Termin noch nachholt, aber nichts Uraltes nachgeschoben wird) und nicht
 * vor der letzten Änderung des Berichts (ein neu eingeschalteter Bericht holt keine alten Termine nach).
 */
export function dueSchedules(schedules: ReportSchedule[], done: Set<string>, now: number, maxLateMs = 36 * 3_600_000) {
  return schedules
    .filter((s) => s.active)
    .map((s) => ({ s, occ: latestOccurrence(s, now) }))
    .filter(({ s, occ }) => {
      const since = Date.parse(s.updatedAt);
      return now - occ.at <= maxLateMs && !(Number.isFinite(since) && occ.at < since) && !done.has(runKey(s.id, occ.day));
    })
    .map(({ s, occ }) => ({ schedule: s, day: occ.day, at: occ.at, key: runKey(s.id, occ.day), range: reportRange(s, occ.day, occ.at) }));
}

/* ───────────── Berichtsinhalt (bestehende Berechnungen) ───────────── */

export type ReportSummary = {
  orders: number;
  privat: number;
  haendler: number;
  open: number;
  released: number;
  handedOver: number;
  shipped: number;
  cancelled: number;
  gross: number;
  net: number;
  deposit: number;
  shipping: number;
  discount: number;
  refunds: number;
  /** Bestellmengen je Sorte (nur Mengen – keine Lagerbestände) */
  units: { sort: string; units: number }[];
  /** Positionen mit unbekannter Menge (z. B. Mixpaket ohne Zusammensetzung) */
  unknownUnits: number;
};

export function summarize(orders: OfficeOrder[], range: Range, products: Map<string, Product>, now: number): ReportSummary {
  const inRange = orders.filter((o) => o.createdAt >= range.from && o.createdAt < range.to);
  const k = computeKpis(orders, range, now);
  const units = collectUnits(inRange, products);
  return {
    orders: inRange.length,
    privat: inRange.filter((o) => o.channel === "privat").length,
    haendler: inRange.filter((o) => o.channel === "haendler").length,
    open: inRange.filter((o) => o.processing === "offen").length,
    released: k.office.freigegeben,
    handedOver: k.office.logistik,
    shipped: inRange.filter((o) => ["versendet", "abgeschlossen"].includes(officeStatus(o, o.office))).length,
    cancelled: k.counts.cancelled,
    gross: k.money.gross,
    net: k.money.net,
    deposit: k.money.deposit,
    shipping: k.money.shipping,
    discount: k.money.discount,
    refunds: k.money.refunds,
    units: units.rows.map((r) => ({ sort: r.sort, units: r.units })).sort((a, b) => b.units - a.units),
    unknownUnits: units.unknown.length,
  };
}

/** Bestellungen für den Kanal-Filter */
export const forChannel = (orders: OfficeOrder[], channel: ReportSchedule["channel"]) => (channel === "alle" ? orders : orders.filter((o) => o.channel === channel));

/* ───────────── Benachrichtigungen & Erinnerungen ───────────── */

export type Notice = {
  /** Eindeutige ID (für „nur einmal melden“) */
  id: string;
  kind: NotifyKind | ReminderKind;
  reminder: boolean;
  at: number;
  /** Bestellnummer (nie Name oder Adresse) */
  order: string;
  orderKey?: string;
  channel?: Channel;
  text: string;
};

const HOUR = 3_600_000;

/** Seit wann steht die Bestellung im aktuellen Bürostatus? (letztes Ereignis mit diesem Zielstatus, sonst Bestellzeit) */
function since(o: OfficeOrder): number {
  const rec = o.office;
  const status = officeStatus(o, rec);
  const ev = [...(rec?.events ?? [])].reverse().find((e) => e.to === status && e.from !== e.to);
  const t = ev ? Date.parse(ev.at) : o.createdAt;
  return Number.isFinite(t) ? t : o.createdAt;
}

/**
 * Erinnerungen aus den Bestellungen berechnen (nur offene Vorgänge). `activities` = Exporthistorie für „Fehlerhafter Export“.
 * Kein Kundenname, keine Adresse – nur Bestellnummer, Kanal und Grund.
 */
export function reminders(orders: OfficeOrder[], cfg: AutomationConfig, now: number, activities: Activity[] = []): Notice[] {
  const out: Notice[] = [];
  const r = cfg.reminders;
  for (const o of orders) {
    const status = officeStatus(o, o.office);
    if (status === "storniert" || status === "abgeschlossen" || status === "versendet") continue;
    const age = now - since(o);
    const base = { order: o.number, orderKey: o.key, channel: o.channel, reminder: true };
    if (r.offen.enabled && (status === "neu" || status === "pruefung") && age >= r.offen.hours * HOUR)
      out.push({ ...base, id: `offen:${o.key}`, kind: "offen", at: since(o), text: `Seit ${hours(age)} offen (${status === "neu" ? "neu eingegangen" : "in Prüfung"}).` });
    if (r.nicht_weitergegeben.enabled && status === "freigegeben" && age >= r.nicht_weitergegeben.hours * HOUR)
      out.push({ ...base, id: `freigegeben:${o.key}:${o.office?.release?.version ?? 0}`, kind: "nicht_weitergegeben", at: since(o), text: `Seit ${hours(age)} freigegeben, Weitergabe an die Logistik noch nicht dokumentiert.` });
    if (r.nicht_versendet.enabled && status === "logistik" && age >= r.nicht_versendet.hours * HOUR)
      out.push({ ...base, id: `logistik:${o.key}:${o.office?.handovers.length ?? 0}`, kind: "nicht_versendet", at: since(o), text: `Seit ${hours(age)} an die Logistik weitergegeben, Versand noch nicht dokumentiert.` });
    if (r.lieferdaten.enabled && !addressComplete(o.delivery ?? o.billing) && age >= r.lieferdaten.hours * HOUR)
      out.push({ ...base, id: `adresse:${o.key}`, kind: "lieferdaten", at: o.createdAt, text: "Lieferadresse unvollständig." });
  }
  if (r.export.enabled) {
    for (const a of activities) {
      if (a.result !== "fehler" || now - Date.parse(a.at) > 7 * 24 * HOUR) continue;
      out.push({ id: `export:${a.id}`, kind: "export", reminder: true, at: Date.parse(a.at), order: a.refs[0] ?? "", text: `${a.kind === "excel" ? "Excel-Export" : "Dokument"} fehlgeschlagen${a.error ? `: ${a.error.slice(0, 120)}` : ""}.` });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const hours = (ms: number) => {
  const h = Math.floor(ms / HOUR);
  return h >= 48 ? `${Math.floor(h / 24)} Tagen` : `${h} Stunden`;
};

/** Benachrichtigungen (Ereignisse seit `sinceMs`) – neue Bestellungen, offene Zahlungen, Prüfbedarf, Änderungen, Fehler */
export function notifications(orders: OfficeOrder[], cfg: AutomationConfig, sinceMs: number, products: Map<string, Product>, extra: { activities?: Activity[]; reports?: { id: string; at: string; name: string; status: string; range: string }[] } = {}): Notice[] {
  const n = cfg.notify;
  const out: Notice[] = [];
  for (const o of orders) {
    const base = { order: o.number, orderKey: o.key, channel: o.channel, reminder: false };
    const status = officeStatus(o, o.office);
    if (o.createdAt >= sinceMs) {
      if (o.channel === "privat" && n.neue_bestellung) out.push({ ...base, id: `neu:${o.key}`, kind: "neue_bestellung", at: o.createdAt, text: `Neue Privatbestellung (${o.lines.length} Position${o.lines.length === 1 ? "" : "en"}).` });
      if (o.channel === "haendler" && n.neue_haendlerbestellung) out.push({ ...base, id: `neu:${o.key}`, kind: "neue_haendlerbestellung", at: o.createdAt, text: `Neue Händlerbestellung (${o.lines.length} Position${o.lines.length === 1 ? "" : "en"}).` });
      if (o.channel === "privat" && o.paymentStatus === "offen" && n.zahlung_offen && status !== "storniert")
        out.push({ ...base, id: `zahlung:${o.key}`, kind: "zahlung_offen", at: o.createdAt, text: "Zahlung noch nicht eingegangen oder fehlgeschlagen (Stripe: nicht bezahlt)." });
    }
    if (n.pruefung && (status === "neu" || status === "pruefung") && o.createdAt >= sinceMs) {
      const a = attention(o, o.office, products).filter((x) => x.kind !== "zahlung");
      if (a.length) out.push({ ...base, id: `pruefung:${o.key}`, kind: "pruefung", at: o.createdAt, text: `Prüfung nötig: ${a.map((x) => x.text).join(" · ").slice(0, 160)}` });
    }
    if (n.geaendert) {
      const changed = changedSinceRelease(o, o.office, products);
      if (changed.length && status !== "versendet") out.push({ ...base, id: `geaendert:${o.key}:${o.office?.release?.version ?? 0}:${changed.join(",")}`, kind: "geaendert", at: Date.parse(o.office?.release?.at ?? "") || o.createdAt, text: "Nach der Versandfreigabe geändert – bitte erneut prüfen." });
    }
  }
  if (n.export_fehler) {
    for (const a of extra.activities ?? []) {
      const at = Date.parse(a.at);
      if (a.result === "fehler" && at >= sinceMs) out.push({ id: `exportfehler:${a.id}`, kind: "export_fehler", reminder: false, at, order: a.refs[0] ?? "", text: `${a.kind === "excel" ? "Excel-Export" : "Dokument"} fehlgeschlagen.` });
    }
  }
  if (n.bericht) {
    for (const r of extra.reports ?? []) {
      const at = Date.parse(r.at);
      if (at >= sinceMs) out.push({ id: `bericht:${r.id}`, kind: "bericht", reminder: false, at, order: "", text: r.status === "ok" ? `Bericht „${r.name}“ (${r.range}) verfügbar.` : `Bericht „${r.name}“ (${r.range}) fehlgeschlagen.` });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Zählt die Bestellung zum Umsatz? (für die Zusammenfassung, gleiche Regel wie die Übersicht) */
export { countsAsRevenue };

/* ───────────── Texte (E-Mail-Entwürfe ohne Kundendaten) ───────────── */

const eur = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const int = (n: number) => n.toLocaleString("de-DE");

/** Textfassung eines Berichts – Zahlen und Sorten, keine Namen, Adressen oder E-Mails */
export function reportText(name: string, range: Range, s: ReportSummary, channel: ReportSchedule["channel"], url: string): { subject: string; text: string } {
  const lines = [
    `${name} – ${range.label}${channel === "alle" ? "" : ` (${CHANNEL_LABEL[channel]})`}`,
    "",
    `Neue Bestellungen: ${int(s.orders)} (Privat ${int(s.privat)}, Händler ${int(s.haendler)})`,
    `Offen: ${int(s.open)} · Freigegeben: ${int(s.released)} · An Logistik weitergegeben: ${int(s.handedOver)} · Versendet: ${int(s.shipped)} · Storniert: ${int(s.cancelled)}`,
    `Umsatz brutto: ${eur(s.gross)} · netto: ${eur(s.net)}`,
    `Pfand: ${eur(s.deposit)} · Versandkosten: ${eur(s.shipping)} · Rabatte: ${eur(s.discount)} · Erstattungen: ${eur(s.refunds)}`,
    "",
    "Bestellmengen je Sorte (keine Lagerbestände):",
    ...(s.units.length ? s.units.slice(0, 30).map((u) => `- ${u.sort}: ${int(u.units)}`) : ["- keine"]),
    ...(s.unknownUnits ? [`(${s.unknownUnits} Position(en) mit unbekannter Menge)`] : []),
    "",
    `Details und PDF in der Büroverwaltung (Anmeldung nötig): ${url}`,
  ];
  return { subject: `EXSTASE · ${name} · ${range.label}`, text: lines.join("\n") };
}

/** Zusammenfassung von Benachrichtigungen und Erinnerungen (nur Bestellnummern) */
export function digestText(items: Notice[], url: string): { subject: string; text: string } {
  const rem = items.filter((i) => i.reminder);
  const not = items.filter((i) => !i.reminder);
  const row = (i: Notice) => `- ${i.order ? `${i.order}${i.channel ? ` (${CHANNEL_LABEL[i.channel]})` : ""}: ` : ""}${i.text}`;
  return {
    subject: `EXSTASE · Büro: ${not.length} Benachrichtigung(en), ${rem.length} Erinnerung(en)`,
    text: [...(not.length ? ["Benachrichtigungen:", ...not.slice(0, 50).map(row), ""] : []), ...(rem.length ? ["Erinnerungen:", ...rem.slice(0, 50).map(row), ""] : []), `Büroverwaltung: ${url}`].join("\n"),
  };
}
