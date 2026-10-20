import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice, PageHeader, Stat, Table, btn, formatDateTime, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { dailyReport } from "@/lib/office/documents";
import { CHANNEL_LABEL, PAYMENT_LABEL, PROCESSING_LABEL, officeUrl } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import { loadOfficeOrders } from "@/lib/office/source";
import { berlinDayKey, resolveRange } from "@/lib/office/time";
import { DocButtons, type SearchParams, paramsOf } from "../shared";

export const metadata: Metadata = { title: "Tagesberichte · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/tagesberichte";
const clock = new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: "Europe/Berlin" });
const n = (v: number) => v.toLocaleString("de-DE");
const pct = (part: number, total: number) => (total > 0 ? `${(Math.round((part / total) * 1000) / 10).toLocaleString("de-DE")} %` : "—");

export default async function DailyReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const raw = await paramsOf(searchParams);
  const preset = ["heute", "gestern", "tag"].includes(raw.zeitraum) ? raw.zeitraum : "heute";
  const now = Date.now();
  const p: Record<string, string> = { zeitraum: preset, ...(preset === "tag" ? { tag: raw.tag || berlinDayKey(now) } : {}) };
  const r = resolveRange({ preset, day: p.tag }, now);
  const products = await productLookup();
  const loaded = r.ok ? await loadOfficeOrders(r.range.from, r.range.to, products) : null;
  const rep = r.ok && loaded ? dailyReport(loaded.orders, r.range, products, now) : null;
  const write = can(me.role, "office.documents") && can(me.role, "office.export");

  return (
    <>
      <PageHeader description="Tagesabschluss: Bestellungen, Umsatz, Pfand, Versand und bestellte Mengen eines Tages (deutsche Zeit)." title="Tagesberichte" />
      {raw.fehler ? (
        <div className="mb-6">
          <Notice title="Tagesbericht nicht erstellt" tone="red">
            {raw.fehler.slice(0, 300)}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form action={BASE} className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className={label} htmlFor="t-zeitraum">
              Tag
            </label>
            <select className={`${input} pr-8`} defaultValue={preset} id="t-zeitraum" name="zeitraum">
              <option value="heute">Heute</option>
              <option value="gestern">Gestern</option>
              <option value="tag">Bestimmtes Datum</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="t-tag">
              Datum (bei „Bestimmtes Datum“)
            </label>
            <input className={input} defaultValue={p.tag ?? ""} id="t-tag" name="tag" type="date" />
          </div>
          <button className={btn} type="submit">
            Anzeigen
          </button>
        </form>
      </Card>

      {!r.ok ? (
        <Notice title="Datum ungültig" tone="red">
          {r.error}
        </Notice>
      ) : rep ? (
        <>
          {loaded?.errors.length ? (
            <div className="mb-5">
              <Notice title="Daten unvollständig – Zahlen fehlen, Download gesperrt" tone="red">
                {loaded.errors.join(" ")}
              </Notice>
            </div>
          ) : null}
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="font-medium text-[20px] tracking-[-0.01em]">Tagesbericht {r.range.label}</h2>
              <p className="text-[13px] text-muted">Stand {formatDateTime(now)}</p>
            </div>
            {write ? <DocButtons back={BASE} count={rep.orders.length} disabled={!loaded?.complete} doc="tagesbericht" excel="tag" p={p} /> : null}
          </div>

          <h3 className="mb-3 font-medium text-[15px]">Bestellungen</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Neue Bestellungen" value={rep.counts.received} />
            <Stat label="Privatkunden" value={rep.counts.private} />
            <Stat label="Händler" value={rep.counts.dealer} />
            <Stat label="Bezahlt" value={rep.counts.paid} />
            <Stat label="Unbezahlt" value={rep.counts.unpaid} />
            <Stat hint="noch nicht bearbeitet" label="Offen" value={rep.counts.open} />
            <Stat label="Stornierungen" value={rep.counts.cancelled} />
            <Stat hint={`davon ${rep.counts.fullyRefunded} vollständig`} label="Rückerstattungen" value={rep.counts.refunded} />
          </div>

          <h3 className="mb-3 font-medium text-[15px]">Umsatz (brutto, ohne Stornos, abzüglich Erstattungen)</h3>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Umsatz brutto" value={formatPrice(rep.money.gross)} />
            <Stat label="Umsatz netto" value={formatPrice(rep.money.net)} />
            <Stat label="Umsatzsteuer" value={formatPrice(rep.money.vat)} />
            <Stat label="Erstattungen" value={formatPrice(rep.money.refunds)} />
            <Stat label="Pfand" value={formatPrice(rep.money.deposit)} />
            <Stat hint={rep.money.shippingOnRequest ? `+ ${rep.money.shippingOnRequest}× Spedition nach Absprache` : undefined} label="Versandkosten" value={formatPrice(rep.money.shipping)} />
            <Stat label="Rabatte" value={formatPrice(rep.money.discount)} />
            <Stat label="Noch unbezahlt" value={formatPrice(rep.money.unpaidGross)} />
          </div>
          <p className="mb-8 text-[12px] text-muted">
            Privatbestellungen zählen erst nach Zahlung (Stripe), Händlerbestellungen auf Rechnung ab Bestellung. Händlerwerte sind netto gespeichert und mit 19 % in brutto umgerechnet. Umsatzsteuer laut Stripe bzw. Rechnung, sonst aus dem
            Bruttobetrag berechnet (anteilig um Erstattungen gekürzt). Pfand ungekürzt: Bei Gutscheinen kann Stripe den Rabatt anteilig auch auf die Pfandposition verteilen – dieser Anteil steckt dann in „Rabatte“.
          </p>

          <div className="mb-6 grid gap-6 2xl:grid-cols-2">
            <Card padded={false} title="Meistbestellte Produkte">
              <div className="px-6 pb-1">
                {rep.collect.byProduct.length ? (
                  <Table head={["Produkt", "Einheit", "Menge", "Privat", "Händler"]}>
                    {rep.collect.byProduct.slice(0, 15).map((x) => (
                      <tr key={`${x.product}|${x.unit}`}>
                        <td className="py-2.5 pr-4 font-medium">{x.product}</td>
                        <td className="py-2.5 pr-4">{x.unit}</td>
                        <td className="py-2.5 pr-4 font-medium tabular-nums">{n(x.quantity)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{n(x.privat)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{n(x.haendler)}</td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <p className="pb-5 text-[14px] text-muted">Keine Artikel an diesem Tag.</p>
                )}
              </div>
            </Card>
            <Card padded={false} title="Sortenverteilung (Stück)">
              <div className="px-6 pb-1">
                {rep.collect.bySort.length ? (
                  <Table head={["Sorte", "Stück", "Trays", "Anteil"]}>
                    {[...rep.collect.bySort]
                      .sort((a, b) => b.units - a.units)
                      .map((x) => (
                        <tr key={x.handle}>
                          <td className="py-2.5 pr-4 font-medium">{x.sort}</td>
                          <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums">
                            {n(x.units)} {x.unitName}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums">
                            {n(x.trays)}
                            {x.rest ? ` + ${x.rest}` : ""}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums">{pct(x.units, rep.collect.totals.cans + rep.collect.totals.bottles)}</td>
                        </tr>
                      ))}
                  </Table>
                ) : (
                  <p className="pb-5 text-[14px] text-muted">Keine Artikel an diesem Tag.</p>
                )}
              </div>
            </Card>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Dosen gesamt" value={n(rep.collect.totals.cans)} />
            <Stat label="Flaschen gesamt" value={n(rep.collect.totals.bottles)} />
            <Stat hint={pct(rep.collect.totals.privat, rep.collect.totals.privat + rep.collect.totals.haendler)} label="Stück an Privatkunden" value={n(rep.collect.totals.privat)} />
            <Stat hint={pct(rep.collect.totals.haendler, rep.collect.totals.privat + rep.collect.totals.haendler)} label="Stück an Händler" value={n(rep.collect.totals.haendler)} />
          </div>

          <Card padded={false} title="Bestellungen des Tages">
            <div className="px-6 pb-1">
              {rep.orders.length ? (
                <Table head={["Bestellung", "Uhrzeit", "Art", "Kunde / Firma", "Gesamt", "Zahlung", "Bearbeitung", "Erstattet"]}>
                  {[...rep.orders]
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map((o) => (
                      <tr key={o.key}>
                        <td className="py-2.5 pr-4">
                          <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl(o)}>
                            {o.number}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 text-muted tabular-nums">{clock.format(o.createdAt)}</td>
                        <td className="py-2.5 pr-4">{CHANNEL_LABEL[o.channel]}</td>
                        <td className="py-2.5 pr-4">{o.company || o.customerName || "—"}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{formatPrice(o.gross)}</td>
                        <td className="py-2.5 pr-4">{PAYMENT_LABEL[o.paymentStatus]}</td>
                        <td className="py-2.5 pr-4">{o.processing === "storniert" ? <Badge tone="red">Storniert</Badge> : PROCESSING_LABEL[o.processing]}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{o.refunded ? formatPrice(o.refunded) : "—"}</td>
                      </tr>
                    ))}
                </Table>
              ) : (
                <p className="pb-5 text-[14px] text-muted">An diesem Tag sind keine Bestellungen eingegangen.</p>
              )}
            </div>
          </Card>
          <p className="mt-4 text-[12px] text-muted">
            Eine automatische tägliche Bereitstellung gibt es noch nicht (geplant für Phase 3D, dann standardmäßig ausgeschaltet). Keine Lagerbestände – Mengen sind bestellte Mengen.
          </p>
        </>
      ) : null}
    </>
  );
}
