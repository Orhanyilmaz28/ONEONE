/**
 * Zeiträume der Büroverwaltung – immer in deutscher Zeit (Europe/Berlin).
 * Ohne Server-Abhängigkeiten (dadurch automatisch testbar).
 *
 * - Tage beginnen um 00:00 Uhr Berliner Zeit, auch an Tagen der Zeitumstellung (23 bzw. 25 Stunden).
 * - Wochen nach ISO 8601: Montag bis Sonntag, KW 1 ist die Woche mit dem 4. Januar.
 * - Ein Zeitraum ist [from, to) in Millisekunden (UTC): `from` gehört dazu, `to` nicht mehr.
 */
export const TZ = "Europe/Berlin";
const DAY = 86_400_000;

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type CalDate = { y: number; m: number; d: number };

/** Kalenderdatum und Uhrzeit in Berlin */
export function berlinParts(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute), s: Number(p.second) };
}

/** Abstand Berlin ↔ UTC in Millisekunden zu einem Zeitpunkt (+1 h Winter, +2 h Sommer) */
export function berlinOffset(ms: number): number {
  const p = berlinParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Berliner Ortszeit → UTC-Millisekunden. Überzählige Tage/Monate werden normalisiert (z. B. 32.1. = 1.2.). */
export function berlinToUtc(y: number, m: number, d: number, h = 0, min = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  // zweimal korrigieren: beim ersten Mal kann die Umstellung zwischen Schätzung und Ergebnis liegen
  let t = guess - berlinOffset(guess);
  t = guess - berlinOffset(t);
  return t;
}

/** Beginn des Berliner Kalendertags (00:00 Uhr) */
export const dayStart = (c: CalDate) => berlinToUtc(c.y, c.m, c.d);

/** Kalenderrechnung ohne Uhrzeit (UTC-Mittag, dadurch nie Probleme mit der Zeitumstellung) */
export function addDays(c: CalDate, n: number): CalDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n, 12));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Wochentag nach ISO: 1 = Montag … 7 = Sonntag */
export function isoWeekday(c: CalDate): number {
  const wd = new Date(Date.UTC(c.y, c.m - 1, c.d, 12)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** ISO-Kalenderwoche eines Kalendertags (Jahr der Woche kann vom Kalenderjahr abweichen, z. B. 31.12. = KW 1) */
export function isoWeek(c: CalDate): { year: number; week: number } {
  const thursday = addDays(c, 4 - isoWeekday(c));
  const jan1 = Date.UTC(thursday.y, 0, 1, 12);
  const week = Math.floor((Date.UTC(thursday.y, thursday.m - 1, thursday.d, 12) - jan1) / DAY / 7) + 1;
  return { year: thursday.y, week };
}

/** Montag der ISO-Woche */
export function isoWeekMonday(year: number, week: number): CalDate {
  const jan4: CalDate = { y: year, m: 1, d: 4 };
  return addDays(jan4, 1 - isoWeekday(jan4) + (week - 1) * 7);
}

/** Anzahl ISO-Wochen eines Jahres (52 oder 53) */
export const isoWeeksInYear = (year: number) => isoWeek({ y: year, m: 12, d: 28 }).week;

export type Range = { from: number; to: number; label: string };

export const PRESETS = [
  { key: "heute", label: "Heute" },
  { key: "gestern", label: "Gestern" },
  { key: "woche", label: "Diese Woche" },
  { key: "letzte-woche", label: "Letzte Woche" },
  { key: "monat", label: "Dieser Monat" },
  { key: "letzter-monat", label: "Letzter Monat" },
  { key: "jahr", label: "Dieses Jahr" },
  { key: "letztes-jahr", label: "Letztes Jahr" },
  { key: "tag", label: "Bestimmter Tag" },
  { key: "kw", label: "Bestimmte Kalenderwoche" },
  { key: "monat-wahl", label: "Bestimmter Monat" },
  { key: "jahr-wahl", label: "Bestimmtes Jahr" },
  { key: "zeitraum", label: "Individueller Zeitraum" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];
export const isPreset = (v: string): v is PresetKey => PRESETS.some((p) => p.key === v);

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad = (n: number) => String(n).padStart(2, "0");
export const formatCal = (c: CalDate) => `${pad(c.d)}.${pad(c.m)}.${c.y}`;
export const calKey = (c: CalDate) => `${c.y}-${pad(c.m)}-${pad(c.d)}`;

/** „JJJJ-MM-TT“ → Kalenderdatum (nur echte Tage zwischen 2000 und 2100) */
export function parseCal(v: string | undefined): CalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (c.y < 2000 || c.y > 2100) return null;
  const back = addDays(c, 0);
  return back.y === c.y && back.m === c.m && back.d === c.d ? c : null;
}

export const dayRange = (c: CalDate, label = formatCal(c)): Range => ({ from: dayStart(c), to: dayStart(addDays(c, 1)), label });
export function weekRange(year: number, week: number): Range {
  const mon = isoWeekMonday(year, week);
  return { from: dayStart(mon), to: dayStart(addDays(mon, 7)), label: `KW ${week}/${year} (${formatCal(mon)} – ${formatCal(addDays(mon, 6))})` };
}
export const monthRange = (y: number, m: number): Range => ({ from: berlinToUtc(y, m, 1), to: berlinToUtc(y, m + 1, 1), label: `${MONTHS[m - 1]} ${y}` });
export const yearRange = (y: number): Range => ({ from: berlinToUtc(y, 1, 1), to: berlinToUtc(y + 1, 1, 1), label: `Jahr ${y}` });

export type RangeInput = { preset?: string; day?: string; week?: string; month?: string; year?: string; from?: string; to?: string };
export type RangeResult = { ok: true; range: Range; preset: PresetKey } | { ok: false; error: string };

/** Längster erlaubter individueller Zeitraum (Schutz vor sehr großen Abfragen) */
export const MAX_RANGE_DAYS = 3 * 366;

/** Zeitraum aus Formularwerten – ungültige Angaben ergeben eine verständliche Fehlermeldung, nie einen falschen Zeitraum */
export function resolveRange(input: RangeInput, now: number): RangeResult {
  const preset: PresetKey = input.preset && isPreset(input.preset) ? input.preset : "monat";
  const t = berlinParts(now);
  const today: CalDate = { y: t.y, m: t.m, d: t.d };
  const ok = (range: Range): RangeResult => ({ ok: true, range, preset });
  switch (preset) {
    case "heute":
      return ok(dayRange(today, `Heute (${formatCal(today)})`));
    case "gestern": {
      const y = addDays(today, -1);
      return ok(dayRange(y, `Gestern (${formatCal(y)})`));
    }
    case "woche": {
      const w = isoWeek(today);
      return ok({ ...weekRange(w.year, w.week), label: `Diese Woche · ${weekRange(w.year, w.week).label}` });
    }
    case "letzte-woche": {
      const w = isoWeek(addDays(today, -7));
      return ok({ ...weekRange(w.year, w.week), label: `Letzte Woche · ${weekRange(w.year, w.week).label}` });
    }
    case "monat":
      return ok(monthRange(today.y, today.m));
    case "letzter-monat":
      return ok(today.m === 1 ? monthRange(today.y - 1, 12) : monthRange(today.y, today.m - 1));
    case "jahr":
      return ok(yearRange(today.y));
    case "letztes-jahr":
      return ok(yearRange(today.y - 1));
    case "tag": {
      const c = parseCal(input.day);
      return c ? ok(dayRange(c)) : { ok: false, error: "Bitte einen gültigen Tag wählen." };
    }
    case "kw": {
      const m = /^(\d{4})-W(\d{1,2})$/.exec(input.week ?? "");
      const y = Number(m?.[1]);
      const w = Number(m?.[2]);
      if (!m || y < 2000 || y > 2100 || w < 1 || w > isoWeeksInYear(y)) return { ok: false, error: "Bitte eine gültige Kalenderwoche wählen." };
      return ok(weekRange(y, w));
    }
    case "monat-wahl": {
      const m = /^(\d{4})-(\d{2})$/.exec(input.month ?? "");
      const y = Number(m?.[1]);
      const mo = Number(m?.[2]);
      if (!m || y < 2000 || y > 2100 || mo < 1 || mo > 12) return { ok: false, error: "Bitte einen gültigen Monat wählen." };
      return ok(monthRange(y, mo));
    }
    case "jahr-wahl": {
      const y = Number(input.year);
      if (!Number.isInteger(y) || y < 2000 || y > 2100) return { ok: false, error: "Bitte ein gültiges Jahr wählen." };
      return ok(yearRange(y));
    }
    case "zeitraum": {
      const a = parseCal(input.from);
      const b = parseCal(input.to);
      if (!a || !b) return { ok: false, error: "Bitte Start- und Enddatum wählen." };
      if (calKey(a) > calKey(b)) return { ok: false, error: "Das Startdatum liegt nach dem Enddatum." };
      const range: Range = { from: dayStart(a), to: dayStart(addDays(b, 1)), label: `${formatCal(a)} – ${formatCal(b)}` };
      if ((range.to - range.from) / DAY > MAX_RANGE_DAYS) return { ok: false, error: "Der Zeitraum darf höchstens 3 Jahre lang sein." };
      return ok(range);
    }
  }
}

/** Excel-Datumszahl (Tage seit 30.12.1899) in Berliner Ortszeit */
export function excelSerial(ms: number): number {
  return (ms + berlinOffset(ms)) / DAY + 25569;
}

/** Berliner Kalendertag eines Zeitpunkts als „JJJJ-MM-TT“ */
export function berlinDayKey(ms: number) {
  const p = berlinParts(ms);
  return calKey(p);
}
