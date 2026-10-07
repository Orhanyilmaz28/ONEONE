import type Stripe from "stripe";
import { findVariant } from "@/lib/catalog";
import { DEPOSIT_PER_CAN, SITE_URL, cansOf } from "@/lib/format";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { getStripe } from "@/lib/stripe";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getAccountsConfig } from "@/lib/customers";

type Body = { lines?: { variantId?: unknown; quantity?: unknown }[] };

/** Betrag in Cent aus den Einstellungen absichern (kaputte Werte → Standardwert) */
function cents(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json(
      { error: "Demo-Modus: Bitte STRIPE_SECRET_KEY setzen, um Zahlungen zu aktivieren." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let subtotal = 0;
  let cans = 0;
  const metaParts: string[] = [];

  // Preise werden ausschließlich serverseitig aus dem Katalog gelesen – nie vom Client übernommen.
  for (const line of body.lines ?? []) {
    const quantity = Number(line.quantity);
    if (typeof line.variantId !== "string" || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return Response.json({ error: "Ungültiger Warenkorb" }, { status: 400 });
    }
    const match = await findVariant(line.variantId);
    if (!match) {
      return Response.json({ error: "Ein Produkt ist nicht mehr verfügbar." }, { status: 400 });
    }
    if (!match.variant.available) {
      return Response.json({ error: `„${match.product.title}“ ist ausverkauft.` }, { status: 409 });
    }
    const { product, variant } = match;
    subtotal += variant.price * quantity;
    cans += cansOf(variant) * quantity;
    metaParts.push(`${product.handle}:${quantity}`);
    const image = product.images[0]?.src;
    lineItems.push({
      quantity,
      price_data: {
        currency: "eur",
        unit_amount: variant.price,
        tax_behavior: "inclusive",
        product_data: {
          name: product.title,
          ...(product.variants.length > 1 ? { description: variant.title } : {}),
          ...(image?.startsWith("https://") ? { images: [image] } : {}),
          metadata: { handle: product.handle, variantId: variant.id },
        },
      },
    });
  }

  if (lineItems.length === 0) {
    return Response.json({ error: "Dein Warenkorb ist leer." }, { status: 400 });
  }

  // Einwegpfand: 0,25 € je Dose, separat ausgewiesen. Zählt nicht zum Warenwert (Grenze für kostenlosen Versand).
  if (cans > 0) {
    lineItems.push({
      quantity: cans,
      price_data: {
        currency: "eur",
        unit_amount: DEPOSIT_PER_CAN,
        product_data: { name: "Einwegpfand", description: "0,25 € je Dose", metadata: { handle: "pfand" } },
      },
    });
  }

  // Versandkosten aus den Einstellungen im Dashboard (gleiche Regeln wie shippingRules in components/trust.tsx):
  // Standardversand 0 € = immer kostenlos · „kostenlos ab“ 0 = keine Grenze · Express 0 = kein Express
  const { shipping } = await getSettings();
  const shippingCost = cents(shipping.cost, DEFAULT_SETTINGS.shipping.cost);
  const freeFrom = cents(shipping.freeFrom, DEFAULT_SETTINGS.shipping.freeFrom);
  const expressCost = cents(shipping.express, DEFAULT_SETTINGS.shipping.express);
  const freeShipping = shippingCost === 0 || (freeFrom > 0 && subtotal >= freeFrom);
  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: freeShipping ? "Kostenloser Standardversand" : "Standardversand (DHL)",
        fixed_amount: { amount: freeShipping ? 0 : shippingCost, currency: "eur" },
        tax_behavior: "inclusive",
        delivery_estimate: {
          minimum: { unit: "business_day", value: 1 },
          maximum: { unit: "business_day", value: 3 },
        },
      },
    },
  ];
  if (expressCost > 0) {
    shippingOptions.push({
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: "Express (DHL Express)",
        fixed_amount: { amount: expressCost, currency: "eur" },
        tax_behavior: "inclusive",
        delivery_estimate: {
          minimum: { unit: "business_day", value: 1 },
          maximum: { unit: "business_day", value: 1 },
        },
      },
    });
  }

  // Für die Live-Statistik („heute bestellt“): Produkt-Handles mit Menge, z. B. "classic:2,zero:1"
  const itemsMeta = metaParts.join(",").slice(0, 480);

  // Angemeldete Kund:innen (nur wenn Kundenkonten eingeschaltet sind): E-Mail vorausfüllen, damit die Bestellung im Konto erscheint
  const customer = (await getAccountsConfig()).enabled ? await getCurrentCustomer().catch(() => null) : null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: { items: itemsMeta, ...(customer ? { customerId: customer.id } : {}) },
      ...(customer ? { customer_email: customer.email } : {}),
      locale: "de",
      line_items: lineItems,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      shipping_address_collection: { // EU-Länder ohne Zollabwicklung (Schweiz bewusst nicht: Zoll + Schweizer MwSt.)
      allowed_countries: ["DE", "AT", "NL", "BE", "LU", "FR", "IT", "DK"] },
      phone_number_collection: { enabled: false },
      shipping_options: shippingOptions,
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: `Ich akzeptiere die [AGB](${SITE_URL}/agb) und habe die [Widerrufsbelehrung](${SITE_URL}/widerruf) zur Kenntnis genommen.`,
        },
      },
      success_url: `${SITE_URL}/checkout/erfolg?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/products`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe-Checkout fehlgeschlagen", error);
    return Response.json({ error: "Zahlung konnte nicht gestartet werden. Bitte später erneut versuchen." }, { status: 500 });
  }
}
