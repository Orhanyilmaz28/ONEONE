import type { Product } from "../types";
import { revenueGross, revenueNet, countsAsRevenue } from "./kpis";
import { type OfficeLine, type OfficeOrder, unitsBySort } from "./model";
import { type Range, addDays, berlinParts, dayRange, formatCal, isoWeek, monthRange, weekRange, yearRange } from "./time";
import type { PresetKey } from "./time";

/**
 * Verkaufsanalysen (Phase 3F) – rein, ohne Speicher und ohne Netz.
 *
 * Regeln (dieselben wie Büro-Übersicht und Tagesbericht, `kpis.ts`):
 * - Umsatz = brutto abzüglich Erstattungen, ohne Stornos. Privat zählt erst nach Zahlung (Zahlungseingang),
 *   Händler (auf Rechnung) ab Bestellung (Rechnungsauftrag). Netto anteilig um Erstattungen gekürzt.
 * - Händlerwerte sind netto gespeichert und werden mit 19 % in brutto umgerechnet.
 * - Produkt-/Sortenumsatz = Positionsbetrag nach Positionsrabatt (ohne Pfand und Versand), brutto.
 * - Sortenmengen von Mixpaketen nur, wenn die Zusammensetzung zum Kaufzeitpunkt gespeichert ist – sonst „unbekannt“.
 * - Kein Gewinn: es gibt keine Einkaufspreise und Kosten im System. Keine Lagerbestände.
 */

const toGross = (o: OfficeOrder, cents: number) => (o.priceBasis === "brutto" ? cents : Math.round(cents * 1.19));
const inRange = (o: OfficeOrder, r: Range) => o.createdAt >= r.from && o.createdAt < r.to;

export type Totals = {
  orders: number;
  gross: number;
  net: number;
  vat: number;
  deposit: number;
  shipping: number;
  discount: number;
  refunds: number;
  cancelled: number;
  cancelledGross: number;
  /** Durchschnittlicher Bestellwert brutto (null = keine Bestellung) */
  aov: number | null;
  b2c: { orders: number; gross: number; net: number };
  b2b: { orders: number; gross: number; net: number };
  /** Bestellungen im Zeitraum, die (noch) nicht zum Umsatz zählen (z. B. Privat unbezahlt) */
  pending: number;
};

export function totals(orders: OfficeOrder[]): Totals {
  const rev = orders.filter(countsAsRevenue);
  const live = orders.filter((o) => o.processing !== "storniert");
  const cancelled = orders.filter((o) => o.processing === "storniert");
  const sum = (list: OfficeOrder[], f: (o: OfficeOrder) => number) => list.reduce((n, o) => n + f(o), 0);
  const gross = sum(rev, revenueGross);
  const net = sum(rev, revenueNet);
  const part = (ch: OfficeOrder["channel"]) => {
    const l = rev.filter((o) => o.channel === ch);
    return { orders: l.length, gross: sum(l, revenueGross), net: sum(l, revenueNet) };
  };
  return {
    orders: rev.length,
    gross,
    net,
    vat: gross - net,
    deposit: sum(rev, (o) => toGross(o, o.deposit)),
    shipping: sum(rev, (o) => (o.shipping === null ? 0 : toGross(o, o.shipping))),
    discount: sum(rev, (o) => toGross(o, o.discount)),
    refunds: sum(orders, (o) => o.refunded),
    cancelled: cancelled.length,
    cancelledGross: sum(cancelled, (o) => o.gross),
    aov: rev.length ? Math.round(gross / rev.length) : null,
    b2c: part("privat"),
    b2b: part("haendler"),
    pending: live.length - rev.length,
  };
}

/* ───────────── Vergleiche ───────────── */

export type Change = { now: number; before: number; abs: number; /** null = keine Basis (Vorzeitraum 0) */ pct: number | null };
export const change = (now: number, before: number): Change => ({ now, before, abs: now - before, pct: before === 0 ? null : ((now - before) / Math.abs(before)) * 100 });

/** Vergleichszeitraum: Tag → Vortag, Woche → Vorwoche, Monat → Vormonat, Jahr → Vorjahr, sonst gleich lang direkt davor */
export function previousRange(range: Range, preset: PresetKey | string): Range {
  const p = berlinParts(range.from);
  const c = { y: p.y, m: p.m, d: p.d };
  if (preset === "heute" || preset === "gestern" || preset === "tag") {
    const y = addDays(c, -1);
    return dayRange(y, `Vortag (${formatCal(y)})`);
  }
  if (preset === "woche" || preset === "letzte-woche" || preset === "kw") {
    const w = isoWeek(addDays(c, -7));
    const r = weekRange(w.year, w.week);
    return { ...r, label: `Vorwoche · ${r.label}` };
  }
  if (preset === "monat" || preset === "letzter-monat" || preset === "monat-wahl") {
    const r = c.m === 1 ? monthRange(c.y - 1, 12) : monthRange(c.y, c.m - 1);
    return { ...r, label: `Vormonat · ${r.label}` };
  }
  if (preset === "jahr" || preset === "letztes-jahr" || preset === "jahr-wahl") {
    const r = yearRange(c.y - 1);
    return { ...r, label: `Vorjahr · ${r.label}` };
  }
  const len = range.to - range.from;
  const from = range.from - len;
  const lp = berlinParts(from);
  const lastDay = berlinParts(range.from - 1);
  return { from, to: range.from, label: `Zeitraum davor (${formatCal({ y: lp.y, m: lp.m, d: lp.d })} – ${formatCal({ y: lastDay.y, m: lastDay.m, d: lastDay.d })})` };
}

export type Comparison = { range: Range; previous: Range; rows: { key: string; label: string; money: boolean; change: Change }[] };

export function compare(cur: Totals, prev: Totals, range: Range, previous: Range): Comparison {
  const row = (key: string, label: string, money: boolean, a: number, b: number) => ({ key, label, money, change: change(a, b) });
  return {
    range,
    previous,
    rows: [
      row("gross", "Umsatz brutto", true, cur.gross, prev.gross),
      row("net", "Umsatz netto", true, cur.net, prev.net),
      row("orders", "Bestellungen (umsatzwirksam)", false, cur.orders, prev.orders),
      row("aov", "Ø Bestellwert brutto", true, cur.aov ?? 0, prev.aov ?? 0),
      row("b2c", "Privat (Zahlungseingänge) brutto", true, cur.b2c.gross, prev.b2c.gross),
      row("b2b", "Händler (Rechnungsaufträge) brutto", true, cur.b2b.gross, prev.b2b.gross),
      row("discount", "Rabatte brutto", true, cur.discount, prev.discount),
      row("refunds", "Erstattungen", true, cur.refunds, prev.refunds),
      row("cancelled", "Stornierungen", false, cur.cancelled, prev.cancelled),
    ],
  };
}

/* ───────────── Zeitverlauf ───────────── */

export type Bucket = { label: string; from: number; to: number; b2c: number; b2b: number; orders: number; discount: number };

/** Tage (bis 62 Tage), sonst Monate */
export function timeline(orders: OfficeOrder[], range: Range): Bucket[] {
  const days = (range.to - range.from) / 86_400_000;
  const out: Bucket[] = [];
  const p = berlinParts(range.from);
  if (days <= 62) {
    let c = { y: p.y, m: p.m, d: p.d };
    for (let i = 0; i < 70; i++) {
      const d = dayRange(c);
      if (d.from >= range.to) break;
      out.push({ label: `${String(c.d).padStart(2, "0")}.${String(c.m).padStart(2, "0")}.`, from: d.from, to: Math.min(d.to, range.to), b2c: 0, b2b: 0, orders: 0, discount: 0 });
      c = addDays(c, 1);
    }
  } else {
    let y = p.y;
    let m = p.m;
    for (let i = 0; i < 48; i++) {
      const r = monthRange(y, m);
      if (r.from >= range.to) break;
      out.push({ label: `${String(m).padStart(2, "0")}/${String(y).slice(2)}`, from: Math.max(r.from, range.from), to: Math.min(r.to, range.to), b2c: 0, b2b: 0, orders: 0, discount: 0 });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  for (const o of orders) {
    if (!countsAsRevenue(o)) continue;
    const b = out.find((x) => o.createdAt >= x.from && o.createdAt < x.to);
    if (!b) continue;
    if (o.channel === "privat") b.b2c += revenueGross(o);
    else b.b2b += revenueGross(o);
    b.orders++;
    b.discount += toGross(o, o.discount);
  }
  return out;
}

/* ───────────── Produkte, Gruppen, Sorten ───────────── */

export const GROUP_NAMES: Record<string, string> = { energy: "Energy", "ice-coffee": "Ice Coffee", "ice-tea": "X-Tea", mineralwasser: "Wasser", mixpakete: "Mixpakete" };
const GROUP_ORDER = ["energy", "ice-coffee", "ice-tea", "mineralwasser", "mixpakete"];

function groupOf(handle: string | undefined, products: Map<string, Product>): string {
  const p = handle ? products.get(handle) : undefined;
  if (!p) return "sonstige";
  if (p.collections?.includes("mixpakete") || p.contents?.length) return "mixpakete";
  return GROUP_ORDER.find((g) => p.collections?.includes(g)) ?? p.collections?.[0] ?? "sonstige";
}
export const groupName = (g: string) => GROUP_NAMES[g] ?? (g === "sonstige" ? "Sonstige / nicht zugeordnet" : g);

export type ProductRow = { key: string; title: string; group: string; packs: number; orders: number; revenue: number; share: number; avgPerOrder: number | null };

/** Je Produkt bzw. Produktgruppe: Bestellmengen (Verpackungseinheiten), Bestellanzahl, Umsatz, Anteil */
export function productStats(orders: OfficeOrder[], products: Map<string, Product>, by: "product" | "group" = "product"): ProductRow[] {
  const rows = new Map<string, ProductRow & { set: Set<string> }>();
  let total = 0;
  for (const o of orders) {
    if (!countsAsRevenue(o)) continue;
    const factor = o.gross > 0 ? (o.gross - o.refunded) / o.gross : 0;
    for (const l of o.lines) {
      const g = groupOf(l.handle, products);
      const key = by === "group" ? g : (l.handle ?? `t:${l.product}`);
      const title = by === "group" ? groupName(g) : (l.handle ? (products.get(l.handle)?.title ?? l.product) : l.product);
      const r = rows.get(key) ?? { key, title, group: groupName(g), packs: 0, orders: 0, revenue: 0, share: 0, avgPerOrder: null, set: new Set<string>() };
      const rev = Math.round(toGross(o, l.total) * factor);
      r.packs += l.quantity;
      r.revenue += rev;
      r.set.add(o.key);
      total += rev;
      rows.set(key, r);
    }
  }
  return [...rows.values()]
    .map(({ set, ...r }) => ({ ...r, orders: set.size, share: total ? (r.revenue / total) * 100 : 0, avgPerOrder: set.size ? Math.round(r.revenue / set.size) : null }))
    .sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title, "de"));
}

export type SortRow = { handle: string; sort: string; units: number; orders: number; /** nur Einzelprodukte – Mixpakete lassen sich nicht sicher auf Sorten verteilen */ revenue: number };

const isMixLine = (l: OfficeLine, products: Map<string, Product>) => Boolean(l.handle && (products.get(l.handle)?.contents?.length || products.get(l.handle)?.collections?.includes("mixpakete")));

/** Sorten: Dosen/Flaschen je Sorte. Mixpakete nur mit gespeicherter Zusammensetzung (Kaufzeitpunkt). */
export function sortStats(orders: OfficeOrder[], products: Map<string, Product>): { rows: SortRow[]; unknownLines: number } {
  const rows = new Map<string, SortRow & { set: Set<string> }>();
  let unknownLines = 0;
  for (const o of orders) {
    if (!countsAsRevenue(o)) continue;
    const factor = o.gross > 0 ? (o.gross - o.refunded) / o.gross : 0;
    for (const l of o.lines) {
      const mix = isMixLine(l, products);
      if (mix && !l.mixSnapshot?.length) {
        unknownLines++;
        continue;
      }
      const units = unitsBySort(l, products);
      if (!units) {
        unknownLines++;
        continue;
      }
      for (const u of units) {
        const r = rows.get(u.handle) ?? { handle: u.handle, sort: u.sort, units: 0, orders: 0, revenue: 0, set: new Set<string>() };
        r.units += u.units;
        r.set.add(o.key);
        if (!mix) r.revenue += Math.round(toGross(o, l.total) * factor);
        rows.set(u.handle, r);
      }
    }
  }
  return { rows: [...rows.values()].map(({ set, ...r }) => ({ ...r, orders: set.size })).sort((a, b) => b.units - a.units || a.sort.localeCompare(b.sort, "de")), unknownLines };
}

/* ───────────── Händler ───────────── */

export type DealerRow = { id: string; company: string; orders: number; gross: number; net: number; aov: number | null; lastOrder: number; topProducts: string[]; topSorts: string[]; recurring: boolean };
export type DealerInfo = { id: string; company: string; status: string };

const top = (m: Map<string, number>, n = 3) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);

/** `lastOrder` = letzte (nicht stornierte) Bestellung je Händler aus der gesamten Händler-Bestellliste */
export function dealerStats(orders: OfficeOrder[], products: Map<string, Product>, dealers: DealerInfo[] = [], lastOrder: Map<string, number> = new Map(), now = Date.now(), quietDays = 60) {
  const by = new Map<string, { o: OfficeOrder[] }>();
  for (const o of orders) {
    if (o.channel !== "haendler" || !countsAsRevenue(o)) continue;
    const id = o.dealerId ?? `firma:${o.company}`;
    by.set(id, { o: [...(by.get(id)?.o ?? []), o] });
  }
  const rows: DealerRow[] = [...by.entries()].map(([id, { o }]) => {
    const prod = new Map<string, number>();
    const sorts = new Map<string, number>();
    for (const x of o)
      for (const l of x.lines) {
        prod.set(l.product, (prod.get(l.product) ?? 0) + l.quantity);
        for (const u of unitsBySort(l, products) ?? []) sorts.set(u.sort, (sorts.get(u.sort) ?? 0) + u.units);
      }
    const gross = o.reduce((n, x) => n + revenueGross(x), 0);
    return {
      id,
      company: o[0].company || o[0].customerName || "unbekannt",
      orders: o.length,
      gross,
      net: o.reduce((n, x) => n + revenueNet(x), 0),
      aov: o.length ? Math.round(gross / o.length) : null,
      lastOrder: Math.max(...o.map((x) => x.createdAt)),
      topProducts: top(prod),
      topSorts: top(sorts),
      recurring: o.length >= 2,
    };
  });
  rows.sort((a, b) => b.gross - a.gross);
  // Freigegebene Händler ohne Bestellung in den letzten `quietDays` Tagen
  const last = lastOrder;
  const quiet = dealers
    .filter((d) => d.status === "freigegeben")
    .map((d) => ({ ...d, lastOrder: last.get(d.id) ?? null }))
    .filter((d) => d.lastOrder === null || now - d.lastOrder > quietDays * 86_400_000)
    .sort((a, b) => (a.lastOrder ?? 0) - (b.lastOrder ?? 0));
  return { rows, recurring: rows.filter((r) => r.recurring).length, quiet, quietDays };
}

/* ───────────── Privatkunden ───────────── */

/** Kunde eindeutig bestimmen: Kundenkonto, sonst E-Mail (klein). Ohne beides nicht zuordenbar. */
export const privateCustomerKey = (o: OfficeOrder) => (o.customerId ? `konto:${o.customerId}` : o.email ? `email:${o.email.trim().toLowerCase()}` : "");

export function privateStats(orders: OfficeOrder[], earlier: OfficeOrder[] = []) {
  const rev = orders.filter((o) => o.channel === "privat" && countsAsRevenue(o));
  const by = new Map<string, OfficeOrder[]>();
  let unknown = 0;
  for (const o of rev) {
    const k = privateCustomerKey(o);
    if (!k) {
      unknown++;
      continue;
    }
    by.set(k, [...(by.get(k) ?? []), o]);
  }
  const before = new Set(earlier.filter((o) => o.channel === "privat" && countsAsRevenue(o)).map(privateCustomerKey).filter(Boolean));
  const customers = by.size;
  const gross = rev.reduce((n, o) => n + revenueGross(o), 0);
  return {
    customers,
    orders: rev.length,
    /** Kunden mit 2+ Bestellungen im Zeitraum */
    repeatInPeriod: [...by.values()].filter((l) => l.length >= 2).length,
    /** im Vorzeitraum schon gekauft */
    returning: [...by.keys()].filter((k) => before.has(k)).length,
    /** im Vorzeitraum nicht gekauft (bezogen nur auf die geladenen Daten) */
    newInPeriod: [...by.keys()].filter((k) => !before.has(k)).length,
    frequency: customers ? rev.length / customers : null,
    aov: rev.length ? Math.round(gross / rev.length) : null,
    gross,
    unknown,
  };
}

/* ───────────── Rabatte und Influencer-Codes ───────────── */

export type CodeRow = { code: string; creator: string; uses: number; orders: string[]; gross: number; discount: number; commission: number | null };
export type CommissionLike = { orderId: string; code: string; amount: number; status: string };

/**
 * Rabatte nach Herkunft. Influencer-Code aus den Stripe-Metadaten (`ref`); Provision nur aus dem Provisionsbuch
 * (tt:commissions, je Bestellung höchstens einmal) – hier wird nichts neu berechnet. Ohne Code ist bei Privatbestellungen
 * nicht unterscheidbar, ob Mix-Rabatt oder Stripe-Aktionscode (der Gutscheinname wird nicht mitgeladen).
 */
export function discountStats(orders: OfficeOrder[], creators: Map<string, string> = new Map(), commissions: CommissionLike[] = []) {
  const rev = orders.filter(countsAsRevenue);
  const byOrder = new Map<string, CommissionLike>();
  for (const c of commissions) if (c.status !== "storniert" && !byOrder.has(c.orderId)) byOrder.set(c.orderId, c);
  const codes = new Map<string, CodeRow>();
  let mixOrPromo = { orders: 0, discount: 0 };
  let dealer = { orders: 0, discount: 0 };
  for (const o of rev) {
    const d = toGross(o, o.discount);
    if (o.channel === "haendler") {
      if (d > 0) dealer = { orders: dealer.orders + 1, discount: dealer.discount + d };
      continue;
    }
    if (o.refCode) {
      const r = codes.get(o.refCode) ?? { code: o.refCode, creator: (o.refId && creators.get(o.refId)) || "", uses: 0, orders: [], gross: 0, discount: 0, commission: 0 };
      r.uses++;
      r.orders.push(o.number);
      r.gross += revenueGross(o);
      r.discount += d;
      const sid = o.key.slice(2);
      const c = byOrder.get(sid);
      if (c && r.commission !== null) r.commission += c.amount;
      codes.set(o.refCode, r);
    } else if (d > 0) mixOrPromo = { orders: mixOrPromo.orders + 1, discount: mixOrPromo.discount + d };
  }
  return { codes: [...codes.values()].sort((a, b) => b.gross - a.gross), mixOrPromo, dealer, total: rev.reduce((n, o) => n + toGross(o, o.discount), 0) };
}

/** Filter „Rabattcode“: genauer Code, „ohne“ = ohne Code, „mit“ = irgendein Code */
export function matchesCode(o: OfficeOrder, code: string) {
  if (!code) return true;
  if (code === "ohne") return !o.refCode;
  if (code === "mit") return Boolean(o.refCode);
  return o.refCode === code.toUpperCase();
}

export const inPeriod = (orders: OfficeOrder[], r: Range) => orders.filter((o) => inRange(o, r));
