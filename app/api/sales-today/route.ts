import { getStripe } from "@/lib/stripe";

/**
 * Echte Bestellungen von heute pro Produkt – direkt aus Stripe (bezahlte Checkout-Sessions).
 * Ohne Stripe-Schlüssel oder ohne Bestellungen: leere Liste → es wird nichts angezeigt.
 */
let cache: { at: number; data: Record<string, number> } | null = null;

export async function GET() {
  const stripe = getStripe();
  if (!stripe) return Response.json({ products: {} });
  if (cache && Date.now() - cache.at < 5 * 60_000) return Response.json({ products: cache.data });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const counts: Record<string, number> = {};
  try {
    for await (const session of stripe.checkout.sessions.list({ created: { gte: Math.floor(start.getTime() / 1000) }, status: "complete", limit: 100 })) {
      if (session.payment_status !== "paid") continue;
      for (const part of (session.metadata?.items ?? "").split(",")) {
        const [handle, qty] = part.split(":");
        if (handle) counts[handle] = (counts[handle] ?? 0) + (Number(qty) || 1);
      }
    }
  } catch (error) {
    console.error("Stripe-Statistik fehlgeschlagen", error);
    return Response.json({ products: {} });
  }
  cache = { at: Date.now(), data: counts };
  return Response.json({ products: counts });
}
