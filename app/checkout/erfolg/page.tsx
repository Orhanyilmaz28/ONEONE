import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { sendOrderMails } from "@/lib/order-mails";
import { ClearCart } from "@/components/clear-cart";
import { ArrowIcon, CheckIcon } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = { title: "Danke für deine Bestellung", robots: { index: false } };

type Props = { searchParams: Promise<{ session_id?: string }> };

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  const stripe = getStripe();
  const session =
    stripe && session_id
      ? await stripe.checkout.sessions.retrieve(session_id, { expand: ["line_items"] }).catch(() => null)
      : null;
  const paid = session?.payment_status === "paid" || session?.payment_status === "no_payment_required";
  // Bestellbestätigung verschicken, nachdem die Seite ausgeliefert ist (doppelt ausgeschlossen – der Stripe-Webhook macht dasselbe)
  if (paid && session) {
    after(() => sendOrderMails(session.id).catch((e) => console.error("[erfolg] E-Mails fehlgeschlagen", e)));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      {paid ? <ClearCart /> : null}
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-sage/30 text-ink">
        <CheckIcon className="size-8" />
      </div>
      <h1 className="t-h1 mt-8">
        {paid ? "Danke für deine Bestellung!" : "Bestellung wird verarbeitet"}
      </h1>
      <p className="mt-4 text-lg text-muted">
        {session?.customer_details?.email
          ? `Deine Bestellbestätigung geht an ${session.customer_details.email}.`
          : "Deine Bestellbestätigung kommt per E-Mail."}
      </p>

      {session?.line_items?.data.length ? (
        <div className="mt-12 rounded-3xl border border-line bg-white p-6 text-left">
          <ul className="divide-y divide-line">
            {session.line_items.data.map((item) => (
              <li className="flex justify-between gap-4 py-3" key={item.id}>
                <span>
                  {item.quantity} × {item.description}
                </span>
                <span>{formatPrice(item.amount_total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-line border-t pt-4 font-medium">
            <span>Gesamt</span>
            <span>{formatPrice(session.amount_total ?? 0)}</span>
          </div>
        </div>
      ) : null}

      <Link
        className="mt-12 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-medium text-paper transition hover:bg-accent"
        href="/products"
      >
        Weiter einkaufen <ArrowIcon />
      </Link>
    </div>
  );
}
