import type { Order } from "@/lib/orders";

/**
 * Reine Rechen-Helfer für die Übersicht (ohne Datenbank- oder Stripe-Zugriff).
 * Alle Tage werden in deutscher Zeit (Europe/Berlin) gezählt – „heute“ ist also
 * immer der Kalendertag, den die Shop-Inhaberin gerade vor sich hat.
 */

const TZ = "Europe/Berlin";
const DAY_MS = 86_400_000;

const keyFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

/** Kalendertag in Berlin als „JJJJ-MM-TT“ */
export function dayKey(ms: number): string {
  const parts = Object.fromEntries(keyFmt.formatToParts(ms).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Aktuelle Stunde (0–23) in Berlin – für die Begrüßung */
export function berlinHour(ms: number): number {
  return Number(hourFmt.format(ms)) % 24;
}

/** Die letzten `n` Kalendertage bis einschließlich heute, älteste zuerst */
export function lastDays(n: number, now: number): string[] {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  // Reine Kalender-Rechnung in UTC → keine Probleme mit der Zeitumstellung
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - (n - 1 - i))).toISOString().slice(0, 10));
}

/** Kalendertag-Schlüssel → Date (12 Uhr UTC, damit die Formatierung nie auf den Vortag rutscht) */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const shortDay = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "numeric", month: "numeric" });
const longDay = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

/** „5.10.“ */
export function formatShortDay(key: string) {
  return shortDay.format(keyToDate(key));
}
/** „Mo., 5. Okt.“ */
export function formatLongDay(key: string) {
  return longDay.format(keyToDate(key));
}

export type DayBucket = { key: string; revenue: number; orders: number };

export type Delta = { current: number; previous: number };

export type TopProduct = { handle: string; name: string; quantity: number; orders: number };

export type Overview = {
  today: { revenue: number; orders: number };
  week: { revenue: number; orders: number };
  month: { revenue: number; orders: number; average: number };
  /** Vergleich mit den 30 Tagen davor */
  previousMonth: { revenue: number; orders: number; average: number };
  /** 30 Tage, älteste zuerst */
  days: DayBucket[];
  /** Alle offenen (noch nicht versendeten) Bestellungen, älteste zuerst – die müssen zuerst raus */
  openOrders: Order[];
  topProducts: TopProduct[];
  /** Anzahl stornierter Bestellungen der letzten 30 Tage (fließen nicht in den Umsatz ein) */
  cancelled: number;
};

function sum(list: Order[]) {
  return list.reduce((n, o) => n + o.amountTotal, 0);
}

/**
 * Wertet die Bestellungen der letzten ~60 Tage aus.
 * Stornierte Bestellungen zählen nicht zum Umsatz.
 */
export function computeOverview(orders: Order[], now: number): Overview {
  const keys60 = lastDays(60, now);
  const keys30 = keys60.slice(30);
  const prevKeys = new Set(keys60.slice(0, 30));
  const curKeys = new Set(keys30);
  const weekKeys = new Set(keys60.slice(-7));
  const todayKey = keys60[keys60.length - 1];

  const withKey = orders.map((o) => ({ o, key: dayKey(o.createdAt) }));
  const active = withKey.filter(({ o }) => o.meta.status !== "storniert");

  const cur = active.filter((x) => curKeys.has(x.key)).map((x) => x.o);
  const prev = active.filter((x) => prevKeys.has(x.key)).map((x) => x.o);
  const week = active.filter((x) => weekKeys.has(x.key)).map((x) => x.o);
  const today = active.filter((x) => x.key === todayKey).map((x) => x.o);

  // Umsatz je Tag
  const byDay = new Map<string, DayBucket>(keys30.map((key) => [key, { key, revenue: 0, orders: 0 }]));
  for (const { o, key } of active) {
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.revenue += o.amountTotal;
      bucket.orders += 1;
    }
  }

  // Meistverkaufte Produkte (nach Stückzahl)
  const top = new Map<string, TopProduct>();
  for (const o of cur) {
    const seen = new Set<string>();
    for (const item of o.items) {
      const handle = item.handle || item.name;
      if (!handle) continue;
      const entry = top.get(handle) ?? { handle, name: item.name || handle, quantity: 0, orders: 0 };
      entry.quantity += Math.max(0, item.quantity || 0);
      if (!seen.has(handle)) {
        entry.orders += 1;
        seen.add(handle);
      }
      top.set(handle, entry);
    }
  }

  const monthRevenue = sum(cur);
  const prevRevenue = sum(prev);

  return {
    today: { revenue: sum(today), orders: today.length },
    week: { revenue: sum(week), orders: week.length },
    month: { revenue: monthRevenue, orders: cur.length, average: cur.length ? Math.round(monthRevenue / cur.length) : 0 },
    previousMonth: { revenue: prevRevenue, orders: prev.length, average: prev.length ? Math.round(prevRevenue / prev.length) : 0 },
    days: keys30.map((k) => byDay.get(k) as DayBucket),
    openOrders: orders.filter((o) => o.meta.status === "offen").sort((a, b) => a.createdAt - b.createdAt),
    topProducts: [...top.values()].sort((a, b) => b.quantity - a.quantity || b.orders - a.orders).slice(0, 5),
    cancelled: withKey.filter(({ o, key }) => o.meta.status === "storniert" && curKeys.has(key)).length,
  };
}

/** Veränderung in Prozent (gerundet) – null, wenn es keinen Vergleichswert gibt */
export function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** „vor 5 Minuten“, „vor 3 Stunden“, „gestern“, „vorgestern“, „vor 4 Tagen“ */
export function timeAgo(ms: number, now: number): string {
  // Ab gestern nach Kalendertagen zählen, sonst Minuten/Stunden
  const calendarDays = Math.round((keyToDate(dayKey(now)).getTime() - keyToDate(dayKey(ms)).getTime()) / DAY_MS);
  if (calendarDays >= 1) return rtf.format(-calendarDays, "day");
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  return rtf.format(-Math.floor(diff / 3_600_000), "hour");
}
