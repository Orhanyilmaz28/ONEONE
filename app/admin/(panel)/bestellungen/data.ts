// Server-Helfer für die Bestellseiten (nicht im Browser verwenden)
import { catalog, getBaseProducts } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import type { Order, OrderItem } from "@/lib/orders";

/**
 * In der Bestellliste kommen Artikel aus den Stripe-Metadaten nur als Kürzel („damen-hipster“).
 * Hier werden daraus lesbare Produktnamen.
 */
export function readableItems(items: OrderItem[], products: ProductLookup): OrderItem[] {
  return items.map((it) => (it.handle && it.name === it.handle ? { ...it, name: products.get(it.handle)?.title ?? it.name } : it));
}

export type ProductLookup = Map<string, Product>;

/** Alle Produkte nach Kürzel – auch gelöschte Katalogprodukte, damit alte Bestellungen lesbar bleiben */
export async function productLookup(): Promise<ProductLookup> {
  return new Map([...catalog.products, ...(await getBaseProducts())].map((p) => [p.handle, p]));
}

/** Erstes Produktbild (für kleine Vorschaubilder) */
export function productImage(products: ProductLookup, handle?: string) {
  if (!handle) return undefined;
  return products.get(handle)?.images[0];
}

/** true, wenn ein Stripe-Testschlüssel hinterlegt ist */
function stripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

/** Links ins Stripe-Dashboard (Testmodus mit /test/ davor) – null bei Beispieldaten */
export function stripeLinks(order: Pick<Order, "id" | "paymentIntent" | "demo">) {
  if (order.demo) return null;
  const base = `https://dashboard.stripe.com${stripeTestMode() ? "/test" : ""}`;
  return {
    session: `${base}/checkout/sessions/${encodeURIComponent(order.id)}`,
    payment: order.paymentIntent ? `${base}/payments/${encodeURIComponent(order.paymentIntent)}` : `${base}/payments`,
    testMode: stripeTestMode(),
  };
}

/** Stripe-Zahlungsübersicht (für Hinweise in der Liste) */
export function stripePaymentsUrl() {
  return `https://dashboard.stripe.com${stripeTestMode() ? "/test" : ""}/payments`;
}

/** Wie lange wartet eine offene Bestellung schon? (ganze Tage) */
export function daysSince(ts: number) {
  return Math.floor((Date.now() - ts) / 86_400_000);
}
