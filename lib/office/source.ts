import type Stripe from "stripe";
import type { DealerOrder } from "../dealer-orders";
import type { Dealer } from "../dealer-store";
import { type OrderMeta, listOrders, orderNumber } from "../orders";
import { KEYS, getJSONStrict } from "../store";
import { getStripe } from "../stripe";
import type { Product } from "../types";
import { type OfficeOrder, type StripeLineLike, type StripeSessionLike, fromDealer, fromStripe } from "./model";

/**
 * Bestellungen für die Büroverwaltung laden – nur lesend.
 * Privat: direkt aus Stripe (bezahlte und noch nicht bezahlte abgeschlossene Checkouts) + Versandstatus aus Redis.
 * Händler: aus Redis. Fällt eine Quelle aus, wird das gemeldet (`complete: false`) – nie still eine leere Liste.
 * Nur auf dem Server verwenden.
 */
export type LoadResult = { orders: OfficeOrder[]; complete: boolean; errors: string[]; source: "stripe" | "demo" | "none" };

/** Schutz vor zu großen Abfragen (Vercel-Laufzeit); größere Zeiträume bitte aufteilen */
export const MAX_ORDERS = 20_000;
const STRIPE_CACHE_MS = 60_000;

type ExportMarks = Record<string, { first: string; last: string; count: number }>;

const cache = new Map<string, { at: number; sessions: { session: StripeSessionLike; lines: StripeLineLike[] }[] }>();

async function stripeSessions(stripe: Stripe, from: number, to: number) {
  const key = `${from}-${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < STRIPE_CACHE_MS) return hit.sessions;
  const out: { session: StripeSessionLike; lines: StripeLineLike[] }[] = [];
  for await (const session of stripe.checkout.sessions.list({
    created: { gte: Math.floor(from / 1000), lt: Math.ceil(to / 1000) },
    status: "complete",
    limit: 100,
    expand: ["data.line_items", "data.payment_intent.latest_charge"],
  })) {
    if (session.created * 1000 < from || session.created * 1000 >= to) continue;
    let lines: StripeLineLike[] = session.line_items?.data ?? [];
    if (session.line_items?.has_more) {
      lines = [];
      for await (const li of stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })) lines.push(li);
    }
    out.push({ session: session as unknown as StripeSessionLike, lines });
    if (out.length > MAX_ORDERS) throw new TooManyError();
  }
  if (cache.size > 20) cache.clear();
  cache.set(key, { at: Date.now(), sessions: out });
  return out;
}

class TooManyError extends Error {}

/** Beispieldaten (nur ADMIN_DEMO=1 ohne Stripe) in die Stripe-Form bringen */
async function demoSessions(from: number, to: number) {
  const { orders } = await listOrders({ days: 400 });
  return orders
    .filter((o) => o.demo && o.createdAt >= from && o.createdAt < to)
    .map((o) => ({
      session: {
        id: o.id,
        created: Math.floor(o.createdAt / 1000),
        amount_total: o.amountTotal,
        amount_subtotal: o.amountSubtotal,
        payment_status: o.paymentStatus,
        metadata: { items: o.items.map((i) => `${i.handle}:${i.quantity}`).join(",") },
        customer_details: { name: o.customer.name, email: o.customer.email, address: o.shipping?.address },
        collected_information: o.shipping ? { shipping_details: { name: o.shipping.name, address: o.shipping.address } } : null,
        shipping_cost: { amount_total: o.amountShipping },
        total_details: { amount_discount: 0, amount_tax: 0 },
      } satisfies StripeSessionLike,
      lines: o.items.map((i) => ({ description: i.name, quantity: i.quantity, amount_total: i.amountTotal, amount_subtotal: i.amountTotal, amount_discount: 0, price: { unit_amount: Math.round(i.amountTotal / Math.max(1, i.quantity)) } })),
    }));
}

/** Alle Bestellungen mit Zeitpunkt in [from, to) */
export async function loadOfficeOrders(from: number, to: number, products: Map<string, Product>): Promise<LoadResult> {
  const errors: string[] = [];
  const orders: OfficeOrder[] = [];
  let source: LoadResult["source"] = "none";

  // Redis-Daten strikt lesen: bei Ausfall Fehler statt leerer Liste
  let meta: Record<string, OrderMeta> = {};
  let marks: ExportMarks = {};
  let dealerOrders: DealerOrder[] = [];
  let dealers: Dealer[] = [];
  let redisOk = true;
  try {
    [meta, marks, dealerOrders, dealers] = await Promise.all([
      getJSONStrict<Record<string, OrderMeta>>(KEYS.orders, {}),
      getJSONStrict<ExportMarks>(KEYS.officeExported, {}),
      getJSONStrict<DealerOrder[]>(KEYS.dealerOrders, []).then((l) => (Array.isArray(l) ? l : [])),
      getJSONStrict<Dealer[]>(KEYS.dealers, []).then((l) => (Array.isArray(l) ? l : [])),
    ]);
  } catch {
    redisOk = false;
    errors.push("Der Datenspeicher (Redis) ist gerade nicht erreichbar – Händlerbestellungen und Bearbeitungsstatus fehlen.");
  }

  const stripe = getStripe();
  try {
    let sessions: { session: StripeSessionLike; lines: StripeLineLike[] }[] = [];
    if (stripe) {
      source = "stripe";
      sessions = await stripeSessions(stripe, from, to);
    } else if (process.env.ADMIN_DEMO === "1") {
      source = "demo";
      sessions = await demoSessions(from, to);
    }
    for (const { session, lines } of sessions) {
      if (!["paid", "no_payment_required", "unpaid"].includes(session.payment_status)) continue;
      orders.push(fromStripe(session, lines, meta[session.id], products, orderNumber(session.id)));
    }
  } catch (e) {
    errors.push(e instanceof TooManyError ? `Mehr als ${MAX_ORDERS.toLocaleString("de-DE")} Privatbestellungen im Zeitraum – bitte einen kürzeren Zeitraum wählen.` : "Stripe konnte nicht abgefragt werden – Privatbestellungen fehlen.");
    if (!(e instanceof TooManyError)) console.error("[office] Stripe-Abfrage fehlgeschlagen", (e as Error).name);
  }

  if (redisOk) {
    const byId = new Map(dealers.map((d) => [d.id, d]));
    for (const o of dealerOrders) {
      const t = Date.parse(o.createdAt);
      if (!(t >= from && t < to)) continue;
      orders.push(fromDealer(o, byId.get(o.dealerId), products));
    }
  }
  for (const o of orders) {
    const m = marks[o.key];
    if (m) o.exportedAt = m.last;
  }
  orders.sort((a, b) => b.createdAt - a.createdAt);
  return { orders, complete: errors.length === 0, errors, source };
}

/** Eine Bestellung über ihren Schlüssel (für die Detailansicht) */
export async function loadOfficeOrder(key: string, products: Map<string, Product>): Promise<{ order: OfficeOrder | null; error?: string }> {
  try {
    const marks = await getJSONStrict<ExportMarks>(KEYS.officeExported, {});
    let order: OfficeOrder | null = null;
    if (key.startsWith("s:")) {
      const id = key.slice(2);
      const stripe = getStripe();
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items", "payment_intent.latest_charge"] });
        if (session.status === "complete") {
          let lines: StripeLineLike[] = session.line_items?.data ?? [];
          if (session.line_items?.has_more) {
            lines = [];
            for await (const li of stripe.checkout.sessions.listLineItems(id, { limit: 100 })) lines.push(li);
          }
          const meta = await getJSONStrict<Record<string, OrderMeta>>(KEYS.orders, {});
          order = fromStripe(session as unknown as StripeSessionLike, lines, meta[id], products, orderNumber(id));
        }
      } else if (process.env.ADMIN_DEMO === "1") {
        const demo = (await demoSessions(0, Date.now() + 86_400_000)).find((d) => d.session.id === id);
        if (demo) order = fromStripe(demo.session, demo.lines, (await getJSONStrict<Record<string, OrderMeta>>(KEYS.orders, {}))[id], products, orderNumber(id));
      }
    } else if (key.startsWith("h:")) {
      const id = key.slice(2);
      const list = await getJSONStrict<DealerOrder[]>(KEYS.dealerOrders, []);
      const o = (Array.isArray(list) ? list : []).find((x) => x.id === id);
      if (o) {
        const dealers = await getJSONStrict<Dealer[]>(KEYS.dealers, []);
        order = fromDealer(o, (Array.isArray(dealers) ? dealers : []).find((d) => d.id === o.dealerId), products);
      }
    }
    if (order && marks[order.key]) order.exportedAt = marks[order.key].last;
    return { order };
  } catch {
    return { order: null, error: "Die Bestellung konnte gerade nicht geladen werden (Stripe oder Datenspeicher nicht erreichbar)." };
  }
}
