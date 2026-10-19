import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { cancelCommission, recordCommission } from "@/lib/commissions";
import { sendOrderMails } from "@/lib/order-mails";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe meldet hier bezahlte Bestellungen (auch Zahlarten, die erst später bestätigt werden, z. B. Klarna/SEPA).
 * In Stripe → Entwickler → Webhooks: Endpunkt https://exstaseshop.vercel.app/api/stripe/webhook (bzw. die spätere Domain) mit den Ereignissen
 * checkout.session.completed und checkout.session.async_payment_succeeded (für Influencer-Provisionen zusätzlich charge.refunded);
 * das Signatur-Geheimnis (whsec_…) als STRIPE_WEBHOOK_SECRET eintragen.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return Response.json({ error: "Webhook nicht eingerichtet" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", secret);
  } catch {
    return Response.json({ error: "Ungültige Signatur" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      // Beide Schritte sind wiederholbar ohne Doppelungen (Provision wird je Bestellung höchstens einmal gebucht,
      // verschickte E-Mails gehen nicht doppelt raus). Schlägt einer fehl → 500, damit Stripe es später erneut versucht.
      let failed = false;
      try {
        await recordCommission(session);
      } catch (error) {
        failed = true;
        console.error("[webhook] Provision fehlgeschlagen", (error as Error).name);
      }
      try {
        await sendOrderMails(session.id);
      } catch (error) {
        failed = true;
        console.error("[webhook] E-Mails fehlgeschlagen", error);
      }
      if (failed) return Response.json({ error: "Später erneut versuchen" }, { status: 500 });
      revalidatePath("/admin", "layout");
    }
  }
  // Voll erstattete Zahlung → Provision stornieren
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (charge.refunded && pi) {
      try {
        await cancelCommission({ paymentIntent: pi });
      } catch (error) {
        console.error("[webhook] Provision stornieren fehlgeschlagen", (error as Error).name);
        return Response.json({ error: "Später erneut versuchen" }, { status: 500 });
      }
    }
  }
  return Response.json({ received: true });
}
