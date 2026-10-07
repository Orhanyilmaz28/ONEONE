import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { sendOrderMails } from "@/lib/order-mails";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe meldet hier bezahlte Bestellungen (auch Zahlarten, die erst später bestätigt werden, z. B. Klarna/SEPA).
 * In Stripe → Entwickler → Webhooks: Endpunkt https://www.exstase-energy.de/api/stripe/webhook mit den Ereignissen
 * checkout.session.completed und checkout.session.async_payment_succeeded; das Signatur-Geheimnis (whsec_…) als STRIPE_WEBHOOK_SECRET eintragen.
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
      try {
        await sendOrderMails(session.id);
      } catch (error) {
        console.error("[webhook] E-Mails fehlgeschlagen", error);
        // 500 → Stripe versucht es später noch einmal (bereits verschickte E-Mails gehen nicht doppelt raus)
        return Response.json({ error: "Später erneut versuchen" }, { status: 500 });
      }
      revalidatePath("/admin", "layout");
    }
  }
  return Response.json({ received: true });
}
