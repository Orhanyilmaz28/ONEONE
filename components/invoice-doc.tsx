import { type DealerInvoice, dueDate, formatDate, invoiceTotals } from "@/lib/dealer-invoice";
import { formatPrice } from "@/lib/format";
import type { CSSProperties } from "react";
import { Logo, LogoMark } from "./logo";
import { LOGO_GREEN } from "./logo-official";

/**
 * Rechnung im DIN-A4-Stil – weiß auf schwarz unabhängig vom Seitendesign; beim Drucken („Als PDF speichern“)
 * wird nur dieses Blatt ausgegeben (siehe .invoice-doc in globals.css).
 */
export function InvoiceDoc({ inv, orderNumber, reference, customerNo }: { inv: DealerInvoice; orderNumber: string; reference?: string; customerNo: string }) {
  const t = invoiceTotals(inv);
  const s = inv.seller;
  const qty = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  return (
    <article
      className="invoice-doc relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-[12mm] font-sans text-[12.5px] text-black leading-relaxed shadow-2xl"
      // Schriftzug des Logos dunkel auf Weiß
      style={{ "--logo-ink": "#111" } as CSSProperties}
    >
      {/* X-Zeichen groß und blass im Hintergrund */}
      <span aria-hidden className="invoice-watermark pointer-events-none absolute top-1/2 left-1/2 z-0 w-[140mm] max-w-[90%] -translate-x-1/2 -translate-y-1/2" style={{ color: LOGO_GREEN, opacity: 0.07 }}>
        <LogoMark className="h-auto w-full" />
      </span>
      <div className="relative z-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Logo className="h-[18mm] w-auto" title={s.name} />
          <p className="mt-2 text-[11px] text-neutral-600">
            {s.street} · {s.city}
            {s.country ? ` · ${s.country}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-black text-[26px] uppercase tracking-wide">Rechnung</p>
          {inv.paid ? <p className="mt-1 inline-block rounded border-2 border-emerald-700 px-2 py-0.5 font-black text-emerald-700 text-[12px] uppercase">Bezahlt{inv.paidAt ? ` am ${new Date(inv.paidAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}</p> : null}
        </div>
      </header>

      <section className="mt-8 flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-[10px] text-neutral-500">
            {s.name} · {s.street} · {s.city}
          </p>
          <p className="mt-1">
            <b>{inv.billTo.company}</b>
            <br />
            {inv.billTo.contact ? (
              <>
                {inv.billTo.contact}
                <br />
              </>
            ) : null}
            {inv.billTo.street}
            <br />
            {inv.billTo.zip} {inv.billTo.city}
          </p>
          {inv.billTo.vatId ? <p className="mt-1 text-[11px]">USt-IdNr.: {inv.billTo.vatId}</p> : null}
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px]">
          <dt className="text-neutral-600">Rechnungsnr.</dt>
          <dd className="font-bold">{inv.number}</dd>
          <dt className="text-neutral-600">Rechnungsdatum</dt>
          <dd>{formatDate(inv.date)}</dd>
          <dt className="text-neutral-600">Leistungsdatum</dt>
          <dd>{formatDate(inv.serviceDate)}</dd>
          <dt className="text-neutral-600">Kundennr.</dt>
          <dd>{customerNo}</dd>
          <dt className="text-neutral-600">Bestellung</dt>
          <dd>{orderNumber}</dd>
          {reference ? (
            <>
              <dt className="text-neutral-600">Ihre Bestellnr.</dt>
              <dd>{reference}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {inv.replaced?.length ? <p className="mt-6 rounded bg-neutral-100 px-3 py-2 text-[11.5px]">Diese Rechnung ersetzt {inv.replaced.map((r) => r.number).join(", ")} (Korrektur). Die ersetzte Rechnung ist damit storniert.</p> : null}

      <table className="mt-8 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-black border-b-2 text-left">
            <th className="py-1.5 pr-2 font-bold">Pos.</th>
            <th className="py-1.5 pr-2 font-bold">Bezeichnung</th>
            <th className="py-1.5 pr-2 text-right font-bold">Menge</th>
            <th className="py-1.5 pr-2 text-right font-bold">Einzelpreis netto</th>
            <th className="py-1.5 text-right font-bold">Gesamt netto</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
            <tr className="border-neutral-300 border-b align-top" key={i}>
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{l.text}</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right">
                {qty(l.qty)} {l.unit}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatPrice(l.price)}</td>
              <td className="whitespace-nowrap py-1.5 text-right">{formatPrice(Math.round(l.qty * l.price))}</td>
            </tr>
          ))}
          {t.depositUnits ? (
            <tr className="border-neutral-300 border-b">
              <td className="py-1.5 pr-2">{inv.lines.length + 1}</td>
              <td className="py-1.5 pr-2">Pfand Einweg (DPG)</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right">{qty(t.depositUnits)} Stück</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatPrice(25)}</td>
              <td className="whitespace-nowrap py-1.5 text-right">{formatPrice(t.depositNet)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto grid w-full max-w-[85mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[12.5px]">
        <dt>Warenwert netto</dt>
        <dd className="text-right">{formatPrice(t.goodsNet)}</dd>
        {t.depositNet ? (
          <>
            <dt>Pfand netto</dt>
            <dd className="text-right">{formatPrice(t.depositNet)}</dd>
          </>
        ) : null}
        <dt>{inv.shippingText || "Versand"}</dt>
        <dd className="text-right">{inv.shippingNet ? formatPrice(inv.shippingNet) : "0,00 €"}</dd>
        {inv.discountNet ? (
          <>
            <dt>{inv.discountText || "Rabatt"}</dt>
            <dd className="text-right">−{formatPrice(inv.discountNet)}</dd>
          </>
        ) : null}
        <dt className="mt-1 border-neutral-400 border-t pt-1">Summe netto</dt>
        <dd className="mt-1 border-neutral-400 border-t pt-1 text-right">{formatPrice(t.net)}</dd>
        <dt>zzgl. {inv.vatRate} % USt.</dt>
        <dd className="text-right">{formatPrice(t.vat)}</dd>
        <dt className="mt-1 border-black border-t-2 pt-1 font-black text-[14px]">Gesamtbetrag</dt>
        <dd className="mt-1 border-black border-t-2 pt-1 text-right font-black text-[14px]">{formatPrice(t.gross)}</dd>
      </dl>

      <section className="mt-8 text-[12px]">
        {inv.paid ? (
          <p>Der Rechnungsbetrag ist beglichen – vielen Dank!</p>
        ) : (
          <p>
            Bitte überweisen Sie den Gesamtbetrag ohne Abzug bis zum <b>{formatDate(dueDate(inv))}</b>
            {s.iban ? (
              <>
                {" "}
                auf folgendes Konto: <b>IBAN {s.iban}</b>
                {s.bic ? ` · BIC ${s.bic}` : ""}
                {s.bank ? ` · ${s.bank}` : ""}
              </>
            ) : null}
            . Verwendungszweck: <b>{inv.number}</b>.
          </p>
        )}
        <p className="mt-2 text-neutral-600">Im Gesamtbetrag ist das Einwegpfand (0,25 € je Dose bzw. Flasche) enthalten; es unterliegt wie die Ware der Umsatzsteuer.</p>
        {inv.note ? <p className="mt-2 whitespace-pre-line">{inv.note}</p> : null}
      </section>

      <footer className="mt-10 grid gap-1 border-neutral-300 border-t pt-3 text-[10px] text-neutral-600 sm:grid-cols-3">
        <p>
          {s.name}
          <br />
          {s.street}, {s.city}
        </p>
        <p>
          {s.owner}
          {s.register ? (
            <>
              <br />
              {s.register}
            </>
          ) : null}
          <br />
          USt-IdNr.: {s.vatId}
        </p>
        <p>
          {s.email}
          <br />
          {s.phone}
          {s.iban ? (
            <>
              <br />
              IBAN {s.iban}
            </>
          ) : null}
        </p>
      </footer>
      </div>
    </article>
  );
}
