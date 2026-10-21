import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import type { Commission } from "../commissions";
import type { Dealer } from "../dealer-store";
import type { Influencer } from "../influencers";
import type { DealerOrder } from "../dealer-orders";
import { KEYS, getJSONStrict } from "../store";
import type { Product } from "../types";
import {
  type Comparison,
  type DealerInfo,
  type Totals,
  compare,
  dealerStats,
  discountStats,
  inPeriod,
  matchesCode,
  previousRange,
  privateStats,
  productStats,
  sortStats,
  timeline,
  totals,
} from "./analytics";
import { type Filters, applyFilters, describeFilters, parseFilters } from "./filters";
import type { OfficeOrder } from "./model";
import { loadOfficeOrders } from "./source";
import { type Range, resolveRange } from "./time";

/** Verkaufsanalysen laden (nur Server). Liest Bestellungen, Händler, Influencer und das Provisionsbuch – schreibt nichts. */
export type AnalyticsRequest = { range: Range; preset: string; previous: Range; filters: Filters; code: string };

export function parseAnalyticsRequest(p: Record<string, string>, now: number): { ok: true; req: AnalyticsRequest } | { ok: false; error: string } {
  const r = resolveRange({ preset: p.zeitraum || "monat", day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  if (!r.ok) return r;
  const code = /^(ohne|mit|[A-Za-z0-9_-]{2,40})$/.test(p.code ?? "") ? (p.code as string) : "";
  return { ok: true, req: { range: r.range, preset: r.preset, previous: previousRange(r.range, r.preset), filters: parseFilters(p), code } };
}

export type AnalyticsResult = {
  req: AnalyticsRequest;
  complete: boolean;
  errors: string[];
  source: string;
  filterText: string[];
  current: Totals;
  previous: Totals;
  comparison: Comparison;
  timeline: ReturnType<typeof timeline>;
  products: ReturnType<typeof productStats>;
  groups: ReturnType<typeof productStats>;
  sorts: ReturnType<typeof sortStats>;
  dealers: ReturnType<typeof dealerStats>;
  privat: ReturnType<typeof privateStats>;
  discounts: ReturnType<typeof discountStats>;
  codes: string[];
  orderCount: number;
};

/** Liste strikt lesen: ein Speicherausfall wirft (statt still eine leere Liste zu liefern wie getJSON) */
async function strictList<T>(key: string): Promise<T[]> {
  const v = await getJSONStrict<T[]>(key, []);
  return Array.isArray(v) ? v : [];
}

export async function loadAnalytics(req: AnalyticsRequest, now = Date.now(), deps: { products?: Map<string, Product>; load?: typeof loadOfficeOrders } = {}): Promise<AnalyticsResult> {
  const products = deps.products ?? (await productLookup());
  const load = deps.load ?? loadOfficeOrders;
  const from = Math.min(req.range.from, req.previous.from);
  const loaded = await load(from, req.range.to, products);
  const errors = [...loaded.errors];
  const [dealers, influencers, commissions, dealerOrders] = await Promise.all([
    strictList<Dealer>(KEYS.dealers).catch(() => {
      errors.push("Händlerliste nicht lesbar (Händler ohne aktuelle Bestellung fehlen).");
      return [];
    }),
    strictList<Influencer>(KEYS.influencers).catch(() => {
      errors.push("Creator-Liste nicht lesbar (Creator-Namen bei Codes fehlen).");
      return [];
    }),
    strictList<Commission>(KEYS.commissions).catch(() => {
      errors.push("Provisionsbuch nicht lesbar (Provisionen fehlen).");
      return [];
    }),
    getJSONStrict<DealerOrder[]>(KEYS.dealerOrders, []).catch(() => {
      errors.push("Händler-Bestellliste nicht lesbar (letzte Bestellung je Händler fehlt).");
      return [] as DealerOrder[];
    }),
  ]);
  const lastOrder = new Map<string, number>();
  for (const o of Array.isArray(dealerOrders) ? dealerOrders : []) {
    const t = Date.parse(o.createdAt);
    if (o.status !== "storniert" && o.dealerId && Number.isFinite(t)) lastOrder.set(o.dealerId, Math.max(lastOrder.get(o.dealerId) ?? 0, t));
  }
  return analyze(loaded.orders, req, products, {
    now,
    dealers: dealers.map((d) => ({ id: d.id, company: d.company, status: d.status })),
    creators: new Map(influencers.map((i) => [i.id, i.alias || i.name])),
    commissions,
    lastOrder,
    complete: loaded.complete && errors.length === loaded.errors.length,
    errors,
    source: loaded.source,
  });
}

/** Rein: alle Auswertungen aus geladenen Bestellungen (für Tests ohne Speicher) */
export function analyze(
  all: OfficeOrder[],
  req: AnalyticsRequest,
  products: Map<string, Product>,
  ctx: { now: number; dealers?: DealerInfo[]; lastOrder?: Map<string, number>; creators?: Map<string, string>; commissions?: { orderId: string; code: string; amount: number; status: string }[]; complete?: boolean; errors?: string[]; source?: string },
): AnalyticsResult {
  const filtered = applyFilters(all, req.filters, products).filter((o) => matchesCode(o, req.code));
  const cur = inPeriod(filtered, req.range);
  const prev = inPeriod(filtered, req.previous);
  const t = totals(cur);
  const p = totals(prev);
  const codes = [...new Set(all.map((o) => o.refCode).filter((c): c is string => Boolean(c)))].sort();
  return {
    req,
    complete: ctx.complete ?? true,
    errors: ctx.errors ?? [],
    source: ctx.source ?? "",
    filterText: [...describeFilters(req.filters, products), ...(req.code ? [req.code === "ohne" ? "ohne Rabattcode" : req.code === "mit" ? "mit Rabattcode" : `Code ${req.code}`] : [])],
    current: t,
    previous: p,
    comparison: compare(t, p, req.range, req.previous),
    timeline: timeline(cur, req.range),
    products: productStats(cur, products, "product"),
    groups: productStats(cur, products, "group"),
    sorts: sortStats(cur, products),
    dealers: dealerStats(cur, products, ctx.dealers ?? [], ctx.lastOrder, ctx.now),
    privat: privateStats(cur, prev),
    discounts: discountStats(cur, ctx.creators, ctx.commissions),
    codes,
    orderCount: cur.length,
  };
}
