import type { CSSProperties } from "react";
import type { Statement } from "@/lib/commissions";
import { monthLabel } from "@/lib/commissions";
import { formatPrice } from "@/lib/format";
import { Logo, LogoMark } from "./logo";
import { LOGO_GREEN } from "./logo-official";

const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/**
 * Provisionsgutschrift (§ 14 Abs. 2 UStG – Abrechnung durch den Leistungsempfänger) im DIN-A4-Stil.
 * Nutzt die Druckregeln von .invoice-doc (globals.css): beim Drucken wird nur dieses Blatt ausgegeben.
 */
export function StatementDoc({ s }: { s: Statement }) {
  const r = s.recipient;
  const i = s.issuer;
  return (
    <article className="invoice-doc relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white p-[12mm] font-sans text-[12.5px] text-black leading-relaxed shadow-2xl" style={{ "--logo-ink": "#111" } as CSSProperties}>
      <span aria-hidden className="invoice-watermark pointer-events-none absolute top-1/2 left-1/2 z-0 w-[140mm] max-w-[90%] -translate-x-1/2 -translate-y-1/2" style={{ color: LOGO_GREEN, opacity: 0.07 }}>
        <LogoMark className="h-auto w-full" />
      </span>
      <div className="relative z-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Logo className="h-[18mm] w-auto" title={i.name} />
            <p className="mt-2 text-[11px] text-neutral-600">
              {i.street} · {i.city}
              {i.country ? ` · ${i.country}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-black text-[26px] uppercase tracking-wide">Gutschrift</p>
            <p className="text-[11px] text-neutral-600">Provisionsabrechnung</p>
            {s.paid ? <p className="mt-1 inline-block rounded border-2 border-emerald-700 px-2 py-0.5 font-black text-[12px] text-emerald-700 uppercase">Ausgezahlt{s.paidAt ? ` am ${day(s.paidAt)}` : ""}</p> : null}
          </div>
        </header>

        <section className="mt-8 flex flex-wrap justify-between gap-6">
          <div>
            <p className="text-[10px] text-neutral-500">
              {i.name} · {i.street} · {i.city}
            </p>
            <p className="mt-1">
              <b>{r.name}</b>
              {r.alias ? (
                <>
                  <br />„{r.alias}“
                </>
              ) : null}
              <br />
              {r.street}
              <br />
              {r.zip} {r.city}
            </p>
            {r.vatId ? <p className="mt-1 text-[11px]">USt-IdNr.: {r.vatId}</p> : r.taxNo ? <p className="mt-1 text-[11px]">Steuernummer: {r.taxNo}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12px]">
            <dt className="text-neutral-600">Gutschrift-Nr.</dt>
            <dd className="font-bold">{s.number}</dd>
            <dt className="text-neutral-600">Datum</dt>
            <dd>{day(s.createdAt)}</dd>
            <dt className="text-neutral-600">Leistungszeitraum</dt>
            <dd>{monthLabel(s.month)}</dd>
            <dt className="text-neutral-600">Partner-Code</dt>
            <dd>{r.code ?? "–"}</dd>
          </dl>
        </section>

        <p className="mt-6">Für die Vermittlung von Bestellungen über deinen Partner-Code schreiben wir dir folgende Provision gut:</p>

        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-black border-b-2 text-left">
              <th className="py-1.5 pr-2 font-bold">Pos.</th>
              <th className="py-1.5 pr-2 font-bold">Bestellung</th>
              <th className="py-1.5 pr-2 font-bold">Datum</th>
              <th className="py-1.5 pr-2 text-right font-bold">Warenwert netto</th>
              <th className="py-1.5 pr-2 text-right font-bold">Satz</th>
              <th className="py-1.5 text-right font-bold">Provision netto</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
              <tr className="border-neutral-300 border-b" key={k}>
                <td className="py-1.5 pr-2">{k + 1}</td>
                <td className="py-1.5 pr-2">
                  {l.orderNumber}
                  {l.storno ? " (Storno)" : ""}
                </td>
                <td className="py-1.5 pr-2">{day(l.date)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatPrice(l.goodsNet)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">{l.pct} %</td>
                <td className="whitespace-nowrap py-1.5 text-right">{formatPrice(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto grid w-full max-w-[85mm] grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[12.5px]">
          <dt>Provision netto</dt>
          <dd className="text-right">{formatPrice(s.net)}</dd>
          <dt>{s.vatRate ? `zzgl. ${s.vatRate} % USt.` : "USt."}</dt>
          <dd className="text-right">{formatPrice(s.vat)}</dd>
          <dt className="mt-1 border-black border-t-2 pt-1 font-black text-[14px]">Auszahlungsbetrag</dt>
          <dd className="mt-1 border-black border-t-2 pt-1 text-right font-black text-[14px]">{formatPrice(s.gross)}</dd>
        </dl>

        <section className="mt-8 grid gap-2 text-[12px]">
          {s.vatRate === 0 ? <p>Kein Ausweis von Umsatzsteuer, da der Leistende Kleinunternehmer im Sinne von § 19 UStG ist.</p> : null}
          <p>
            {s.paid ? "Der Betrag wurde überwiesen" : "Wir überweisen den Betrag in den nächsten Tagen"}
            {r.iban ? (
              <>
                {" "}
                auf das Konto <b>{r.iban}</b>
                {r.accountHolder ? ` (${r.accountHolder})` : ""}
              </>
            ) : " – bitte hinterlege dazu deine Bankverbindung im Influencer-Bereich"}
            .
          </p>
          <p className="text-neutral-600">Abrechnung im Gutschriftverfahren nach § 14 Abs. 2 Satz 2 UStG. Widersprichst du dieser Gutschrift nicht innerhalb von 4 Wochen, gilt sie als anerkannt. Provision auf den Warenwert ohne Umsatzsteuer, Pfand und Versand; stornierte oder erstattete Bestellungen werden verrechnet.</p>
        </section>

        <footer className="mt-10 grid gap-1 border-neutral-300 border-t pt-3 text-[10px] text-neutral-600 sm:grid-cols-3">
          <p>
            {i.name}
            <br />
            {i.street}, {i.city}
          </p>
          <p>
            {i.owner}
            {i.register ? (
              <>
                <br />
                {i.register}
              </>
            ) : null}
            <br />
            USt-IdNr.: {i.vatId}
          </p>
          <p>
            {i.email}
            <br />
            {i.phone}
          </p>
        </footer>
      </div>
    </article>
  );
}
