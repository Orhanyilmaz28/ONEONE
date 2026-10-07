import type Stripe from "stripe";
import { KEYS, getJSON, updateJSON } from "./store";
import { getStripe } from "./stripe";

/**
 * Bestellungen = bezahlte Stripe-Checkout-Sessions. Der Versandstatus (offen/versendet …)
 * wird zusätzlich im Datenspeicher gemerkt (Schlüssel tt:orders).
 */

export type OrderStatus = "offen" | "versendet" | "erledigt" | "storniert";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  offen: "Offen",
  versendet: "Versendet",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

export type OrderMeta = {
  status: OrderStatus;
  /** Sendungsnummer (z. B. DHL) */
  tracking?: string;
  carrier?: string;
  note?: string;
  shippedAt?: string;
  /** Wann die Versand-E-Mail aus dem Shop verschickt wurde */
  shippingMailSentAt?: string;
  updatedAt?: string;
};

export type Address = { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; country?: string | null };

export type OrderItem = { name: string; description?: string; quantity: number; amountTotal: number; handle?: string; variantId?: string };

export type Order = {
  /** Stripe-Checkout-Session-ID (cs_…) */
  id: string;
  /** Kurze, gut lesbare Bestellnummer, z. B. „EX-4F7K2Q“ */
  number: string;
  createdAt: number;
  customer: { name: string; email: string; phone?: string };
  shipping: { name: string; address: Address } | null;
  /** Nur bei getOrder() vollständig; in der Liste aus den Metadaten (Handle + Menge) */
  items: OrderItem[];
  amountTotal: number;
  amountSubtotal: number;
  amountShipping: number;
  shippingMethod?: string;
  paymentStatus: string;
  /** Stripe-Zahlung (pi_…), für den Link ins Stripe-Dashboard */
  paymentIntent?: string;
  meta: OrderMeta;
  /** true = Beispieldaten (ADMIN_DEMO=1, kein Stripe) */
  demo?: boolean;
};

export type OrdersResult = { orders: Order[]; source: "stripe" | "demo" | "none"; error?: string };

export function orderNumber(id: string) {
  return `EX-${id.slice(-6).toUpperCase()}`;
}

export async function getAllOrderMeta(): Promise<Record<string, OrderMeta>> {
  return getJSON<Record<string, OrderMeta>>(KEYS.orders, {});
}

export async function setOrderMeta(id: string, patch: Partial<OrderMeta>) {
  return updateJSON<Record<string, OrderMeta>>(KEYS.orders, {}, (all) => ({
    ...all,
    [id]: { ...(all[id] ?? { status: "offen" }), ...patch, updatedAt: new Date().toISOString() },
  }));
}

function itemsFromMetadata(session: Stripe.Checkout.Session): OrderItem[] {
  return (session.metadata?.items ?? "")
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [handle, qty] = part.split(":");
      return { name: handle, handle, quantity: Number(qty) || 1, amountTotal: 0 };
    });
}

function toOrder(session: Stripe.Checkout.Session, meta: Record<string, OrderMeta>, items?: OrderItem[]): Order {
  const ship = session.collected_information?.shipping_details ?? null;
  const shippingRate = session.shipping_cost?.shipping_rate;
  return {
    id: session.id,
    number: orderNumber(session.id),
    createdAt: session.created * 1000,
    customer: {
      name: session.customer_details?.name ?? ship?.name ?? "—",
      email: session.customer_details?.email ?? "",
      phone: session.customer_details?.phone ?? undefined,
    },
    shipping: ship ? { name: ship.name, address: ship.address } : session.customer_details?.address ? { name: session.customer_details?.name ?? "", address: session.customer_details.address } : null,
    items: items ?? itemsFromMetadata(session),
    amountTotal: session.amount_total ?? 0,
    amountSubtotal: session.amount_subtotal ?? 0,
    amountShipping: session.shipping_cost?.amount_total ?? 0,
    shippingMethod: typeof shippingRate === "object" && shippingRate ? (shippingRate.display_name ?? undefined) : undefined,
    paymentStatus: session.payment_status,
    paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? undefined),
    meta: meta[session.id] ?? { status: "offen" },
  };
}

/** Bezahlte Bestellungen, neueste zuerst. `days` begrenzt den Zeitraum (Standard 90 Tage). */
export async function listOrders({ days = 90, limit = 300 }: { days?: number; limit?: number } = {}): Promise<OrdersResult> {
  const stripe = getStripe();
  const meta = await getAllOrderMeta();
  if (!stripe) {
    if (process.env.ADMIN_DEMO === "1") return { orders: demoOrders(meta), source: "demo" };
    return { orders: [], source: "none" };
  }
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const orders: Order[] = [];
  try {
    for await (const session of stripe.checkout.sessions.list({ created: { gte: since }, status: "complete", limit: 100, expand: ["data.shipping_cost.shipping_rate"] })) {
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") continue;
      orders.push(toOrder(session, meta));
      if (orders.length >= limit) break;
    }
  } catch (error) {
    console.error("[orders] Stripe-Abfrage fehlgeschlagen", error);
    return { orders, source: "stripe", error: "Stripe konnte nicht abgefragt werden. Ist der Schlüssel richtig?" };
  }
  return { orders, source: "stripe" };
}

/** Bestellungen einer Kund:in (nach E-Mail-Adresse, letzte 2 Jahre) – für das Kundenkonto */
export async function listCustomerOrders(email: string, limit = 50): Promise<OrdersResult> {
  const stripe = getStripe();
  const meta = await getAllOrderMeta();
  const wanted = email.trim().toLowerCase();
  if (!stripe) {
    if (process.env.ADMIN_DEMO === "1") return { orders: demoOrders(meta).filter((o) => o.customer.email === wanted), source: "demo" };
    return { orders: [], source: "none" };
  }
  const since = Math.floor((Date.now() - 730 * 86_400_000) / 1000);
  const orders: Order[] = [];
  try {
    for await (const session of stripe.checkout.sessions.list({ created: { gte: since }, status: "complete", customer_details: { email: wanted }, limit: 100, expand: ["data.shipping_cost.shipping_rate"] })) {
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") continue;
      // Stripe vergleicht die Adresse genau – zur Sicherheit noch einmal ohne Groß-/Kleinschreibung prüfen
      if ((session.customer_details?.email ?? "").toLowerCase() !== wanted) continue;
      orders.push(toOrder(session, meta));
      if (orders.length >= limit) break;
    }
  } catch (error) {
    console.error("[orders] Kundenbestellungen konnten nicht geladen werden", error);
    return { orders, source: "stripe", error: "Deine Bestellungen konnten gerade nicht geladen werden. Bitte versuche es später noch einmal." };
  }
  return { orders, source: "stripe" };
}

/** Eine Bestellung mit allen Positionen */
export async function getOrder(id: string): Promise<Order | null> {
  const meta = await getAllOrderMeta();
  const stripe = getStripe();
  if (!stripe) {
    return process.env.ADMIN_DEMO === "1" ? (demoOrders(meta).find((o) => o.id === id) ?? null) : null;
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items.data.price.product", "shipping_cost.shipping_rate"] });
    const items: OrderItem[] = (session.line_items?.data ?? []).map((li) => {
      const product = typeof li.price?.product === "object" && li.price.product && !("deleted" in li.price.product) ? li.price.product : null;
      return {
        name: li.description ?? product?.name ?? "Artikel",
        description: product?.description ?? undefined,
        quantity: li.quantity ?? 1,
        amountTotal: li.amount_total,
        handle: product?.metadata?.handle,
        variantId: product?.metadata?.variantId,
      };
    });
    return toOrder(session, meta, items);
  } catch (error) {
    console.error("[orders] Bestellung nicht gefunden", id, error);
    return null;
  }
}

// ── Beispieldaten (nur mit ADMIN_DEMO=1 und ohne Stripe-Schlüssel, deutlich als Demo gekennzeichnet) ──
/** Beispiel-Varianten (Packungsgröße), damit Lieferschein & Details realistisch aussehen */
const DEMO_VARIANT: Record<string, string> = {
  classic: "12er Pack",
  tropical: "6er Pack",
  "kiwi-lemon": "24er Pack",
  zero: "12er Pack",
  mixpaket: "12 Dosen (4 Sorten à 3)",
};
function demoOrders(meta: Record<string, OrderMeta>): Order[] {
  const now = Date.now();
  const rows: [string, number, string, string, [string, string, number, number][]][] = [
    ["cs_demo_7HQ2KA", 0.1, "Anna Beispiel", "Bonn", [["Classic", "classic", 2, 3198]]],
    ["cs_demo_4F7K2Q", 0.6, "Max Muster", "Köln", [["Tropical", "tropical", 1, 849]]],
    ["cs_demo_9XM3TB", 1.4, "Petra Probe", "Essen", [["Kiwi & Lemon", "kiwi-lemon", 1, 2999], ["Zero", "zero", 1, 1599]]],
    ["cs_demo_2LP8VD", 2.2, "Jonas Test", "Düsseldorf", [["Probier-Mix 12er", "mixpaket", 1, 1699]]],
    ["cs_demo_6RN4WE", 3.5, "Lea Demo", "Straelen", [["Zero", "zero", 2, 3198]]],
    ["cs_demo_3KJ7YF", 5.1, "Karl Beispiel", "Krefeld", [["Classic", "classic", 1, 1599], ["Tropical", "tropical", 1, 849]]],
    ["cs_demo_8DT5HG", 8.3, "Sabine Muster", "Aachen", [["Kiwi & Lemon", "kiwi-lemon", 2, 5998]]],
    ["cs_demo_5WB9QH", 12.6, "Tom Probe", "Mönchengladbach", [["Probier-Mix 12er", "mixpaket", 2, 3398]]],
  ];
  return rows.map(([id, daysAgo, name, city, items], i) => {
    const subtotal = items.reduce((n, it) => n + it[3], 0);
    const shipping = subtotal >= 6900 ? 0 : 590;
    return {
      id,
      number: orderNumber(id),
      createdAt: now - daysAgo * 86_400_000,
      customer: { name, email: `${name.split(" ")[0].toLowerCase()}@beispiel.de` },
      shipping: { name, address: { line1: `Musterstraße ${i + 3}`, postal_code: `4${7600 + i * 37}`, city, country: "DE" } },
      items: items.map(([n, handle, quantity, amountTotal]) => ({ name: n, handle, quantity, amountTotal, description: DEMO_VARIANT[handle] })),
      amountTotal: subtotal + shipping,
      amountSubtotal: subtotal,
      amountShipping: shipping,
      shippingMethod: shipping ? "Standardversand (DHL)" : "Kostenloser Standardversand",
      paymentStatus: "paid",
      meta: meta[id] ?? { status: i > 2 ? "versendet" : "offen", ...(i > 2 ? { tracking: `00340434${161094000 + i}`, carrier: "DHL" } : {}) },
      demo: true,
    };
  });
}
