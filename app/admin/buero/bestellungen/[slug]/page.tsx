import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, Table, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { CHANNEL_LABEL, type OfficeAddress, originalUrl, slugToKey } from "@/lib/office/model";
import { loadOfficeOrder } from "@/lib/office/source";
import { PaymentBadge, ProcessingBadge, ShippingBadge } from "../../shared";

export const metadata: Metadata = { title: "Bestellung · Büro" };
export const dynamic = "force-dynamic";

function Address({ a }: { a: OfficeAddress | null }) {
  if (!a) return <p className="text-muted">nicht angegeben</p>;
  return (
    <p className="leading-relaxed">
      {a.company ? (
        <>
          {a.company}
          <br />
        </>
      ) : null}
      {a.name || "—"}
      <br />
      {a.line1 || "—"}
      {a.line2 ? (
        <>
          <br />
          {a.line2}
        </>
      ) : null}
      <br />
      {[a.zip, a.city].filter(Boolean).join(" ") || "—"}
      {a.country ? ` · ${a.country}` : ""}
    </p>
  );
}

const money = (v: number | null) => (v === null ? "nach Absprache" : formatPrice(v));

export default async function OfficeOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await requireOffice();
  const key = slugToKey((await params).slug);
  if (!key) notFound();
  const { order: o, error } = await loadOfficeOrder(key, await productLookup());
  if (error)
    return (
      <Notice title="Bestellung konnte nicht geladen werden" tone="red">
        {error}
      </Notice>
    );
  if (!o) notFound();
  const basis = o.priceBasis === "brutto" ? "inkl. USt" : "netto";
  const rows: [string, string][] = [
    [`Warenwert (${basis})`, formatPrice(o.goods)],
    [`Rabatt (${basis})`, o.discount ? `− ${formatPrice(o.discount)}` : formatPrice(0)],
    [`Pfand (${basis})`, `${formatPrice(o.deposit)}${o.depositUnits !== null ? ` · ${o.depositUnits} Stück` : ""}`],
    [`Versand (${basis})`, money(o.shipping)],
    ["Netto", formatPrice(o.net)],
    [`USt${o.vatSource === "berechnet" ? " (19 % enthalten, berechnet)" : ""}`, formatPrice(o.vat)],
    ["Gesamt brutto", formatPrice(o.gross)],
    ...(o.refunded ? ([["Erstattet", `− ${formatPrice(o.refunded)}`]] as [string, string][]) : []),
  ];

  return (
    <>
      <p className="mb-3 text-sm">
        <Link className="text-muted hover:text-ink" href="/admin/buero/bestellungen">
          ← Alle Bestellungen
        </Link>
      </p>
      <PageHeader
        actions={
          me.role === "admin" ? (
            <Link className={btnSecondary} href={originalUrl(o)}>
              Originalbestellung öffnen
            </Link>
          ) : null
        }
        description={`${CHANNEL_LABEL[o.channel]} · ${formatDateTime(o.createdAt)}${o.exportedAt ? ` · zuletzt exportiert ${formatDateTime(o.exportedAt)}` : ""}`}
        title={`Bestellung ${o.number}`}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <PaymentBadge o={o} />
        <ProcessingBadge o={o} />
        <ShippingBadge o={o} />
        {o.paymentMethod ? <Badge>{o.paymentMethod}</Badge> : null}
        {o.invoiceNumber ? <Badge tone="blue">Rechnung {o.invoiceNumber}</Badge> : null}
      </div>
      {o.warnings.length ? (
        <div className="mb-6">
          <Notice title="Hinweise">{o.warnings.join(" · ")}</Notice>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="Kunde">
          <p className="leading-relaxed">
            {o.company ? (
              <>
                <b className="font-medium">{o.company}</b>
                <br />
              </>
            ) : null}
            {o.customerName || "—"}
            {o.contact && o.contact !== o.customerName ? <span className="block text-muted">Ansprechpartner: {o.contact}</span> : null}
          </p>
          <p className="mt-2 text-[14px]">{o.email || "keine E-Mail"}</p>
          <p className="text-[14px]">{o.phone || "kein Telefon"}</p>
          {o.vatId ? <p className="text-[13px] text-muted">USt-IdNr. {o.vatId}</p> : null}
        </Card>
        <Card title="Rechnungsadresse">
          <Address a={o.billing} />
        </Card>
        <Card title="Lieferadresse">
          <Address a={o.delivery} />
          {o.tracking ? <p className="mt-2 text-[13px] text-muted">Sendung: {[o.carrier, o.tracking].filter(Boolean).join(" ")}</p> : null}
        </Card>
      </div>

      <Card className="mb-6" padded={false} title="Artikel">
        <div className="px-6 pb-1">
          <Table head={["SKU", "Produkt", "Sorte", "Menge", "Einheit", <span className="block text-right" key="e">Einzelpreis</span>, <span className="block text-right" key="s">Summe</span>]}>
            {o.lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge der Positionen
              <tr key={i}>
                <td className="py-3 pr-4 text-muted tabular-nums">{l.sku || "—"}</td>
                <td className="py-3 pr-4">{l.product}</td>
                <td className="py-3 pr-4 text-muted">{l.sort}</td>
                <td className="py-3 pr-4 tabular-nums">{l.quantity}</td>
                <td className="py-3 pr-4 text-muted">{l.unit || "unbekannt"}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{l.unitPrice === null ? "—" : formatPrice(l.unitPrice)}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{formatPrice(l.total)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Beträge">
          <dl className="divide-y divide-line text-[14px]">
            {rows.map(([k, v]) => (
              <div className="flex justify-between gap-4 py-2" key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Hinweise">
          <p className="text-[13px] text-muted">Kundenhinweise</p>
          <p className="mb-3 whitespace-pre-line">{o.customerNote || "—"}</p>
          <p className="text-[13px] text-muted">Interne Bemerkungen</p>
          <p className="whitespace-pre-line">{o.internalNote || "—"}</p>
        </Card>
      </div>
    </>
  );
}
