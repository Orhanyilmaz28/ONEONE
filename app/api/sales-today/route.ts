import { getStripe } from "@/lib/stripe";

/**
 * Echte Bestellungen von heute pro Produkt – direkt aus Stripe (bezahlte Checkout-Sessions).
 * Ohne Stripe-Schlüssel oder ohne Bestellungen: leere Liste → es wird nichts angezeigt.
 */
let cache: { at: number; data: Record<string, number> } | null = null;

/** Beginn des heutigen Tages in deutscher Zeit (der Server läuft in UTC – sonst zählt „heute“ erst ab 1 bzw. 2 Uhr) */
function berlinMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const sinceMidnight = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

export async function GET() {
  const stripe = getStripe();
  if (!stripe) return Response.json({ products: {} });
  if (cache && Date.now() - cache.at < 5 * 60_000 && cache.at >= berlinMidnight().getTime()) return Response.json({ products: cache.data });

  const start = berlinMidnight();
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
