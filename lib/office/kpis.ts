import type { OfficeOrder } from "./model";
import { type Range, addDays, berlinParts, dayRange, isoWeek, monthRange, weekRange, yearRange } from "./time";

/**
 * Kennzahlen der Büro-Übersicht – nur aus echten, gespeicherten Bestellungen berechnet.
 *
 * Regeln:
 * - Umsatz = Bruttobetrag abzüglich Erstattungen, ohne stornierte Bestellungen.
 *   Privatbestellungen zählen erst, wenn sie bezahlt sind; Händlerbestellungen (auf Rechnung) ab Bestellung.
 * - Stornierte Bestellungen zählen nicht zum Umsatz; ihre Erstattungen erscheinen nur unter „Erstattungen“.
 * - Rabatte, Versand und Pfand werden brutto summiert. Händlerwerte sind netto gespeichert und werden mit
 *   19 % USt in brutto umgerechnet (auf den Cent gerundet).
 */
export type PeriodRevenue = { gross: number; net: number; orders: number };

export type Kpis = {
  counts: {
    today: number;
    week: number;
    month: number;
    open: number;
    paid: number;
    unpaid: number;
    dealer: number;
    private: number;
    inProgress: number;
    /** wird noch nicht erfasst (Phase 3C) */
    released: null;
    shipped: number;
    cancelled: number;
    exported: number;
    total: number;
  };
  revenue: { day: PeriodRevenue; week: PeriodRevenue; month: PeriodRevenue; year: PeriodRevenue };
  money: { gross: number; net: number; discount: number; shipping: number; deposit: number; refunds: number; unpaidGross: number; shippingOnRequest: number };
  /** Stornierte Bestellungen, die bezahlt und (noch) nicht erstattet sind – Hinweis fürs Büro */
  cancelledNotRefunded: number;
};

export function standardRanges(now: number): { day: Range; week: Range; month: Range; year: Range } {
  const p = berlinParts(now);
  const today = { y: p.y, m: p.m, d: p.d };
  const w = isoWeek(today);
  return { day: dayRange(today), week: weekRange(w.year, w.week), month: monthRange(p.y, p.m), year: yearRange(p.y) };
}

/** Frühester Zeitpunkt, den die Übersicht braucht (Jahresbeginn oder Wochenbeginn, falls die Woche im Vorjahr begann) */
export function overviewStart(now: number) {
  const r = standardRanges(now);
  return Math.min(r.year.from, r.week.from);
}

const toGross = (o: OfficeOrder, cents: number) => (o.priceBasis === "brutto" ? cents : Math.round(cents * 1.19));
const inRange = (o: OfficeOrder, r: Range) => o.createdAt >= r.from && o.createdAt < r.to;
/** Zählt die Bestellung zum Umsatz? */
export const countsAsRevenue = (o: OfficeOrder) => o.processing !== "storniert" && (o.channel === "haendler" || o.paymentStatus !== "offen");
export const revenueGross = (o: OfficeOrder) => (countsAsRevenue(o) ? o.gross - o.refunded : 0);
/** Netto-Umsatz: anteilig um Erstattungen gekürzt */
export const revenueNet = (o: OfficeOrder) => (countsAsRevenue(o) ? (o.gross > 0 ? Math.round(o.net * ((o.gross - o.refunded) / o.gross)) : 0) : 0);

function revenueIn(orders: OfficeOrder[], r: Range): PeriodRevenue {
  const list = orders.filter((o) => inRange(o, r) && countsAsRevenue(o));
  return { gross: list.reduce((n, o) => n + revenueGross(o), 0), net: list.reduce((n, o) => n + revenueNet(o), 0), orders: list.length };
}

/**
 * @param orders alle geladenen Bestellungen (mindestens ab `overviewStart`)
 * @param period Zeitraum für Status-Zahlen und Geldwerte
 */
export function computeKpis(orders: OfficeOrder[], period: Range, now: number): Kpis {
  const r = standardRanges(now);
  const inP = orders.filter((o) => inRange(o, period));
  const live = inP.filter((o) => o.processing !== "storniert");
  const count = (f: (o: OfficeOrder) => boolean) => inP.filter(f).length;
  return {
    counts: {
      today: orders.filter((o) => inRange(o, r.day)).length,
      week: orders.filter((o) => inRange(o, r.week)).length,
      month: orders.filter((o) => inRange(o, r.month)).length,
      open: count((o) => o.processing === "offen"),
      paid: count((o) => o.processing !== "storniert" && (o.paymentStatus === "bezahlt" || o.paymentStatus === "teilweise_erstattet")),
      unpaid: count((o) => o.processing !== "storniert" && o.paymentStatus === "offen"),
      dealer: count((o) => o.channel === "haendler"),
      private: count((o) => o.channel === "privat"),
      inProgress: count((o) => o.processing === "in_bearbeitung"),
      released: null,
      shipped: count((o) => o.shippingStatus === "versendet"),
      cancelled: count((o) => o.processing === "storniert"),
      exported: count((o) => Boolean(o.exportedAt)),
      total: inP.length,
    },
    revenue: { day: revenueIn(orders, r.day), week: revenueIn(orders, r.week), month: revenueIn(orders, r.month), year: revenueIn(orders, r.year) },
    money: {
      gross: inP.reduce((n, o) => n + revenueGross(o), 0),
      net: inP.reduce((n, o) => n + revenueNet(o), 0),
      discount: live.reduce((n, o) => n + toGross(o, o.discount), 0),
      shipping: live.reduce((n, o) => n + (o.shipping === null ? 0 : toGross(o, o.shipping)), 0),
      deposit: live.reduce((n, o) => n + toGross(o, o.deposit), 0),
      refunds: inP.reduce((n, o) => n + o.refunded, 0),
      unpaidGross: live.filter((o) => o.paymentStatus === "offen").reduce((n, o) => n + o.gross, 0),
      shippingOnRequest: live.filter((o) => o.shipping === null).length,
    },
    // Storniert, aber Geld nicht (vollständig) zurück – auch nach einer Teilerstattung
    cancelledNotRefunded: inP.filter((o) => o.processing === "storniert" && o.channel === "privat" && (o.paymentStatus === "bezahlt" || o.paymentStatus === "teilweise_erstattet")).length,
  };
}

/** Einzelne Kalendertage eines Zeitraums (für den Tagesbericht) */
export function daysOf(range: Range): Range[] {
  const out: Range[] = [];
  const p = berlinParts(range.from);
  let c = { y: p.y, m: p.m, d: p.d };
  for (let i = 0; i < 1200; i++) {
    const d = dayRange(c);
    if (d.from >= range.to) break;
    out.push(d);
    c = addDays(c, 1);
  }
  return out;
}
