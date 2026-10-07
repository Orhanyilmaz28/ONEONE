import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Card, Notice, PageHeader, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABEL, type Order, getOrder, orderNumber } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { CopyButton } from "../client-buttons";
import { productImage, productLookup, readableItems, stripeLinks } from "../data";
import { mailReady } from "@/lib/mail";
import { getMailSettings } from "@/lib/mail-settings";
import { OrderForm } from "../order-form";
import { STATUS_TONE, addressLines, carrierLabel, itemCount, mailtoHref, paymentLabel, shippingMail, trackingUrl } from "../shipping";

type Params = Promise<{ id: string }>;

const VALID_ID = /^cs_[A-Za-z0-9_]{4,200}$/;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: VALID_ID.test(id) ? `Bestellung ${orderNumber(id)}` : "Bestellung" };
}

export default async function OrderDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  if (!VALID_ID.test(id)) notFound();

  const [found, settings, products, mailSettings] = await Promise.all([getOrder(id), getSettings(), productLookup(), getMailSettings()]);
  if (!found) notFound();
  const order: Order = { ...found, items: readableItems(found.items, products) };

  const { meta } = order;
  const brand = settings.company.brand || "EXSTASE Energy";
  const track = trackingUrl(meta.tracking, meta.carrier);
  const mail = shippingMail({ order, tracking: meta.tracking, carrier: meta.carrier, brand, companyName: settings.company.name });
  const stripe = stripeLinks(order);
  const payment = paymentLabel(order.paymentStatus);
  const pieces = itemCount(order.items);
  const discount = order.amountSubtotal + order.amountShipping - order.amountTotal;
  const address = order.shipping ? [order.shipping.name, ...addressLines(order.shipping.address, { alwaysCountry: true })] : [];
  const base = `/admin/bestellungen/${encodeURIComponent(order.id)}`;

  return (
    <>
      <Link className="mb-4 inline-flex items-center gap-1.5 rounded-full text-muted text-sm transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10" href="/admin/bestellungen">
        <span aria-hidden>←</span> Alle Bestellungen
      </Link>

      <PageHeader
        actions={
          <>
            <Link className={btnSecondary} href={`${base}/lieferschein`}>
              <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v7H6z" />
              </svg>
              Lieferschein
            </Link>
            {order.customer.email ? (
              <a className={btnSecondary} href={mailtoHref(order.customer.email, mail.subject, mail.body)} title="Öffnet dein E-Mail-Programm mit einer fertigen Versand-Nachricht">
                <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path d="M3 6h18v12H3z" />
                  <path d="m3 7 9 7 9-7" />
                </svg>
                E-Mail an Kund:in
              </a>
            ) : null}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>Bestellt am {formatDateTime(order.createdAt)}</span>
            <Badge tone={STATUS_TONE[meta.status]}>{ORDER_STATUS_LABEL[meta.status]}</Badge>
            {order.demo ? <Badge tone="amber">Beispieldaten</Badge> : null}
          </span>
        }
        title={`Bestellung ${order.number}`}
      />

      {order.demo ? (
        <div className="mb-6">
          <Notice title="Das ist eine Beispiel-Bestellung" tone="blue">
            Probier ruhig alles aus – Status ändern, Sendungsnummer eintragen, Lieferschein drucken. Echte Kund:innen bekommen davon nichts mit.
          </Notice>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {meta.status === "offen" ? <ShipSteps hasEmail={Boolean(order.customer.email)} lieferschein={`${base}/lieferschein`} /> : null}

          <Card actions={<span className="text-[13px] text-muted">{pieces} Stück</span>} title="Artikel">
            <ul className="-mt-2 divide-y divide-line">
              {order.items.map((it, i) => {
                const img = productImage(products, it.handle);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
                  <li className="flex items-center gap-4 py-3.5" key={i}>
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-cream">
                      {img ? <Image alt="" className="object-cover" fill sizes="56px" src={img.src} /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[15px]">{it.name}</p>
                      {it.description ? <p className="truncate text-muted text-sm">{it.description}</p> : null}
                      {it.quantity > 1 && it.amountTotal > 0 ? <p className="text-[13px] text-muted tabular-nums">je {formatPrice(Math.round(it.amountTotal / it.quantity))}</p> : null}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="text-muted text-sm">{it.quantity}×</p>
                      {it.amountTotal > 0 ? <p className="font-medium">{formatPrice(it.amountTotal)}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-2 space-y-2 border-line border-t pt-4 text-[15px]">
              <Row label="Zwischensumme">{formatPrice(order.amountSubtotal)}</Row>
              <Row label={order.shippingMethod ? `Versand · ${order.shippingMethod}` : "Versand"}>{order.amountShipping ? formatPrice(order.amountShipping) : "kostenlos"}</Row>
              {discount > 0 ? <Row label="Rabatt (Gutschein)">−{formatPrice(discount)}</Row> : null}
              <div className="flex items-baseline justify-between gap-4 border-line border-t pt-3">
                <dt className="font-medium">Gesamt</dt>
                <dd className="font-medium text-[19px] tabular-nums tracking-[-0.01em]">{formatPrice(order.amountTotal)}</dd>
              </div>
            </dl>
            <p className="mt-1 text-right text-[12px] text-muted">inkl. MwSt.</p>
          </Card>

          <section aria-labelledby="versand-title" className="@container scroll-mt-6 rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04)]" id="versand">
            <div className="border-line border-b px-6 py-4">
              <h2 className="font-medium text-[15px]" id="versand-title">
                Versand & Status
              </h2>
            </div>
            <div className="p-6">
              <OrderForm
                brand={brand}
                companyName={settings.company.name}
                customer={{ name: order.customer.name, email: order.customer.email }}
                id={order.id}
                initial={{ status: meta.status, tracking: meta.tracking, carrier: meta.carrier, note: meta.note }}
                mailReady={mailReady()}
                mailSentAt={meta.shippingMailSentAt}
                notifyDefault={mailSettings.shippingNotice}
                number={order.number}
              />
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Kund:in">
            <p className="font-medium text-[15px]">{order.customer.name}</p>
            {order.customer.email ? (
              <a className="mt-1 block break-all text-[15px] text-ink/80 underline decoration-line underline-offset-4 hover:decoration-ink" href={mailtoHref(order.customer.email)}>
                {order.customer.email}
              </a>
            ) : (
              <p className="mt-1 text-muted text-sm">Keine E-Mail-Adresse hinterlegt</p>
            )}
            {order.customer.phone ? (
              <a className="mt-1 block text-[15px] text-ink/80 underline decoration-line underline-offset-4 hover:decoration-ink" href={`tel:${order.customer.phone.replace(/[^\d+]/g, "")}`}>
                {order.customer.phone}
              </a>
            ) : null}
          </Card>

          <Card actions={address.length ? <CopyButton label="Kopieren" text={address.join("\n")} /> : null} title="Lieferadresse">
            {address.length ? (
              <address className="text-[15px] not-italic leading-relaxed">
                {address.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                  <span className={`block ${i === 0 ? "font-medium" : ""}`} key={i}>
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <p className="text-muted text-sm">Keine Lieferadresse vorhanden.</p>
            )}
          </Card>

          <Card title="Zahlung">
            <dl className="space-y-2.5 text-[15px]">
              <Row label="Status">
                <Badge tone={payment.tone}>{payment.label}</Badge>
              </Row>
              <Row label="Betrag">{formatPrice(order.amountTotal)}</Row>
              <Row label="Bezahlt über">Stripe</Row>
            </dl>
            {stripe ? (
              <div className="mt-4 flex flex-col gap-2 border-line border-t pt-4 text-sm">
                <a className="inline-flex items-center justify-between gap-2 font-medium text-ink hover:underline" href={stripe.payment} rel="noreferrer" target="_blank">
                  Zahlung in Stripe öffnen <span aria-hidden>↗</span>
                </a>
                <a className="inline-flex items-center justify-between gap-2 text-ink/70 hover:text-ink hover:underline" href={stripe.session} rel="noreferrer" target="_blank">
                  Checkout-Sitzung ansehen <span aria-hidden>↗</span>
                </a>
                <p className="text-[12.5px] text-muted leading-relaxed">
                  {stripe.testMode ? "Testmodus: Es fließt kein echtes Geld. " : ""}In Stripe kannst du auch Geld zurückerstatten.
                </p>
              </div>
            ) : (
              <p className="mt-4 border-line border-t pt-4 text-[13px] text-muted leading-relaxed">Bei Beispieldaten gibt es keinen Link zu Stripe. Echte Bestellungen kannst du von hier aus direkt in Stripe öffnen.</p>
            )}
          </Card>

          <Card title="Verlauf">
            <ol className="relative space-y-4 text-sm">
              <TimelineItem done label="Bestellt & bezahlt" value={formatDateTime(order.createdAt)} />
              <TimelineItem
                done={Boolean(meta.shippedAt) || meta.status === "versendet" || meta.status === "erledigt"}
                label={meta.status === "storniert" ? "Storniert" : "Versendet"}
                value={
                  meta.shippedAt ? (
                    <>
                      {formatDateTime(meta.shippedAt)}
                      {track ? (
                        <>
                          {" · "}
                          <a className="text-ink underline underline-offset-4 hover:no-underline" href={track} rel="noreferrer" target="_blank">
                            {carrierLabel(meta.carrier)} ↗
                          </a>
                        </>
                      ) : null}
                    </>
                  ) : meta.status === "storniert" ? (
                    "Bestellung wurde storniert"
                  ) : meta.status === "versendet" || meta.status === "erledigt" ? (
                    track ? (
                      <a className="text-ink underline underline-offset-4 hover:no-underline" href={track} rel="noreferrer" target="_blank">
                        Sendung verfolgen ↗
                      </a>
                    ) : (
                      "ohne Datum"
                    )
                  ) : (
                    "noch nicht"
                  )
                }
              />
              {meta.updatedAt ? <TimelineItem done label="Zuletzt bearbeitet" value={formatDateTime(meta.updatedAt)} /> : null}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function TimelineItem({ label, value, done }: { label: string; value: ReactNode; done: boolean }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${done ? "bg-accent" : "border border-ink/30 bg-card"}`} />
      <div>
        <p className={done ? "font-medium" : "text-muted"}>{label}</p>
        <p className="text-muted tabular-nums">{value}</p>
      </div>
    </li>
  );
}

/** Kleine Schritt-für-Schritt-Hilfe für offene Bestellungen */
function ShipSteps({ lieferschein, hasEmail }: { lieferschein: string; hasEmail: boolean }) {
  const steps: { title: string; text: ReactNode }[] = [
    {
      title: "Lieferschein drucken",
      text: (
        <>
          <Link className="font-medium text-ink underline underline-offset-4 hover:no-underline" href={lieferschein}>
            Lieferschein öffnen
          </Link>
          , ausdrucken und mit ins Paket legen.
        </>
      ),
    },
    {
      title: "Paket bei DHL aufgeben",
      text: (
        <>
          Paketschein online kaufen (z. B. auf{" "}
          <a className="font-medium text-ink underline underline-offset-4 hover:no-underline" href="https://www.dhl.de/de/privatkunden/pakete-versenden/online-frankieren.html" rel="noreferrer" target="_blank">
            dhl.de ↗
          </a>
          ) – die Lieferadresse kannst du mit „Kopieren“ übernehmen.
        </>
      ),
    },
    {
      title: "Hier als „Versendet“ speichern",
      text: hasEmail ? "Sendungsnummer eintragen, speichern – danach mit einem Klick die Versand-E-Mail öffnen." : "Sendungsnummer eintragen und speichern.",
    },
  ];
  return (
    <section aria-label="So versendest du diese Bestellung" className="rounded-3xl border border-amber-200/70 bg-amber-50/60 p-6">
      <h2 className="font-medium text-[15px] text-amber-950">So versendest du diese Bestellung</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li className="flex gap-3" key={s.title}>
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-card font-medium text-[13px] text-amber-900 ring-1 ring-amber-200">
              {i + 1}
            </span>
            <div className="text-sm leading-relaxed">
              <p className="font-medium text-ink">{s.title}</p>
              <p className="text-ink/70">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
