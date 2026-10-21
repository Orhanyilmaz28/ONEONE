import type { Metadata } from "next";
import { Badge, Card, Notice, PageHeader, Stat, btnSecondary, formatDay, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { pctText } from "@/lib/office/analytics-export";
import { type AnalyticsResult, loadAnalytics, parseAnalyticsRequest } from "@/lib/office/analytics-service";
import { can } from "@/lib/office/roles";
import { FilterFields, FormButtons, HiddenParams, RangeFields, type SearchParams, paramsOf, productOptions } from "../shared";
import { BarList, SplitBar, TimeBars } from "./charts";

export const metadata: Metadata = { title: "Verkaufsanalysen · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/analysen";
const int = (n: number) => n.toLocaleString("de-DE");

function ChangeCell({ pct, abs, money }: { pct: number | null; abs: number; money: boolean }) {
  const tone = pct === null ? "neutral" : abs > 0 ? "green" : abs < 0 ? "red" : "neutral";
  return (
    <span className="whitespace-nowrap">
      {abs > 0 ? "+" : ""}
      {money ? formatPrice(abs) : int(abs)} <Badge tone={tone}>{pctText(pct)}</Badge>
    </span>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[13px] text-muted">Als Tabelle anzeigen</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead>
            <tr className="border-line border-b text-[12px] text-muted">
              {head.map((h) => (
                <th className="py-1.5 pr-4 font-medium" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
              <tr key={i}>
                {r.map((c, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: feste Spalten
                  <td className="py-1.5 pr-4 tabular-nums" key={j}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice("office.analytics");
  const p = await paramsOf(searchParams);
  const now = Date.now();
  const products = await productLookup();
  const parsed = parseAnalyticsRequest(p, now);
  let a: AnalyticsResult | null = null;
  let loadError = "";
  if (parsed.ok) {
    try {
      a = await loadAnalytics(parsed.req, now, { products });
    } catch {
      loadError = "Die Daten konnten nicht geladen werden (Stripe oder Datenspeicher nicht erreichbar).";
    }
  }
  const exportable = can(me.role, "office.analytics.export");

  return (
    <>
      <PageHeader description="Umsatz, Produkte, Sorten, Händler, Privatkunden und Rabattcodes – berechnet aus den gespeicherten Bestellungen, mit denselben Regeln wie die Büro-Übersicht. Keine Lagerbestände, keine Gewinnzahlen." title="Verkaufsanalysen" />
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Nicht exportiert" tone="red">
            {p.fehler}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form className="grid gap-5" method="get">
          <RangeFields p={p} />
          <FilterFields p={p} products={productOptions(products)} />
          <label className="block max-w-sm">
            <span className={label}>Rabattcode</span>
            <select className={input} defaultValue={p.code ?? ""} name="code">
              <option value="">Alle Bestellungen</option>
              <option value="mit">Nur mit Rabattcode</option>
              <option value="ohne">Nur ohne Rabattcode</option>
              {(a?.codes ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <FormButtons reset={BASE} submit="Anzeigen" />
        </form>
      </Card>

      {!parsed.ok ? (
        <Notice title="Zeitraum ungültig" tone="red">
          {parsed.error}
        </Notice>
      ) : loadError || !a ? (
        <Notice title="Analyse nicht verfügbar" tone="red">
          {loadError}
        </Notice>
      ) : (
        <>
          {!a.complete ? (
            <div className="mb-6">
              <Notice title="Die Zahlen sind unvollständig" tone="red">
                {a.errors.join(" ")} Export ist gesperrt, bis alle Daten geladen werden können.
              </Notice>
            </div>
          ) : null}
          {a.source === "demo" ? (
            <div className="mb-6">
              <Badge tone="amber">Beispieldaten</Badge>
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-medium text-[15px]">
              {a.req.range.label} <span className="text-muted">· verglichen mit {a.req.previous.label}</span>
            </h2>
            {exportable ? (
              <div className="flex flex-wrap gap-2">
                {(["xlsx", "pdf"] as const).map((f) => (
                  <form action="/api/admin/buero/analyse" key={f} method="post">
                    <HiddenParams p={p} />
                    {p.code ? <input name="code" type="hidden" value={p.code} /> : null}
                    <input name="format" type="hidden" value={f} />
                    <button className={btnSecondary} disabled={!a?.complete} type="submit">
                      {f === "xlsx" ? "Excel herunterladen" : "PDF herunterladen"}
                    </button>
                  </form>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat hint={`netto ${formatPrice(a.current.net)}`} label="Umsatz brutto" value={formatPrice(a.current.gross)} />
            <Stat label="Umsatzsteuer" value={formatPrice(a.current.vat)} />
            <Stat hint={`Ø ${a.current.aov === null ? "—" : formatPrice(a.current.aov)}`} label="Bestellungen" value={int(a.current.orders)} />
            <Stat label="Pfand" value={formatPrice(a.current.deposit)} />
            <Stat label="Versandkosten" value={formatPrice(a.current.shipping)} />
            <Stat label="Rabatte" value={formatPrice(a.current.discount)} />
            <Stat hint={`${int(a.current.cancelled)} storniert`} label="Erstattungen" value={formatPrice(a.current.refunds)} />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card title="Zeitvergleich">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[14px]">
                  <thead>
                    <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
                      <th className="py-2 pr-4 font-medium">Kennzahl</th>
                      <th className="py-2 pr-4 font-medium">Zeitraum</th>
                      <th className="py-2 pr-4 font-medium">Vergleich</th>
                      <th className="py-2 font-medium">Veränderung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.comparison.rows.map((r) => (
                      <tr key={r.key}>
                        <td className="py-2 pr-4">{r.label}</td>
                        <td className="py-2 pr-4 tabular-nums">{r.money ? formatPrice(r.change.now) : int(r.change.now)}</td>
                        <td className="py-2 pr-4 tabular-nums text-muted">{r.money ? formatPrice(r.change.before) : int(r.change.before)}</td>
                        <td className="py-2 tabular-nums">
                          <ChangeCell abs={r.change.abs} money={r.money} pct={r.change.pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[12px] text-muted">„keine Basis“: im Vergleichszeitraum 0 – eine Prozentangabe wäre irreführend. Vergleich: Tag → Vortag, Woche → Vorwoche, Monat → Vormonat, Jahr → Vorjahr, eigener Zeitraum → gleich langer Zeitraum davor.</p>
            </Card>
            <Card title="Privat und Händler">
              <SplitBar a={a.current.b2c.gross} b={a.current.b2b.gross} />
              <p className="mt-3 text-[12px] text-muted">
                Privat = bezahlte Stripe-Bestellungen ({int(a.current.b2c.orders)}). Händler = Rechnungsaufträge ab Bestellung ({int(a.current.b2b.orders)}). {a.current.pending ? `${int(a.current.pending)} weitere Bestellungen sind noch nicht umsatzwirksam (z. B. unbezahlt).` : ""}
              </p>
            </Card>
          </div>

          <Card className="mb-6" title="Umsatz- und Bestellentwicklung">
            <div className="grid gap-8 xl:grid-cols-2">
              <TimeBars buckets={a.timeline} mode="umsatz" title="Umsatz brutto" />
              <TimeBars buckets={a.timeline} mode="bestellungen" title="Bestellungen" />
            </div>
            <DataTable head={["Zeitraum", "Privat", "Händler", "Gesamt", "Bestellungen", "Rabatte"]} rows={a.timeline.map((b) => [b.label, formatPrice(b.b2c), formatPrice(b.b2b), formatPrice(b.b2c + b.b2b), int(b.orders), formatPrice(b.discount)])} />
          </Card>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card title="Produktgruppen (Umsatz brutto)">
              <BarList rows={a.groups.map((g) => ({ label: g.title, value: g.revenue, hint: `${g.share.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` }))} />
              <DataTable head={["Gruppe", "Einheiten", "Bestellungen", "Umsatz", "Anteil"]} rows={a.groups.map((g) => [g.title, int(g.packs), int(g.orders), formatPrice(g.revenue), `${g.share.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`])} />
            </Card>
            <Card title="Meistbestellte Sorten (Dosen/Flaschen)">
              <BarList money={false} rows={a.sorts.rows.slice(0, 12).map((s) => ({ label: s.sort, value: s.units, hint: `${int(s.orders)} Best.` }))} />
              {a.sorts.unknownLines ? <p className="mt-2 text-[12px] text-muted">{int(a.sorts.unknownLines)} Position(en) ohne gesicherte Sortenzuordnung (Mixpaket ohne Zusammensetzung zum Kaufzeitpunkt) – nicht mitgezählt.</p> : null}
              <DataTable head={["Sorte", "Menge", "Bestellungen", "Umsatz (ohne Mixpakete)"]} rows={a.sorts.rows.map((s) => [s.sort, int(s.units), int(s.orders), formatPrice(s.revenue)])} />
            </Card>
          </div>

          <Card className="mb-6" title="Produkte">
            <BarList rows={a.products.slice(0, 12).map((r) => ({ label: r.title, value: r.revenue, hint: `${int(r.packs)} Einh.` }))} />
            <DataTable
              head={["Produkt", "Gruppe", "Bestellmenge", "Bestellungen", "Umsatz brutto", "Ø je Bestellung", "Anteil"]}
              rows={a.products.map((r) => [r.title, r.group, int(r.packs), int(r.orders), formatPrice(r.revenue), r.avgPerOrder === null ? "—" : formatPrice(r.avgPerOrder), `${r.share.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`])}
            />
          </Card>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card title={`Top-Händler (${int(a.dealers.rows.length)} · ${int(a.dealers.recurring)} wiederkehrend)`}>
              <BarList rows={a.dealers.rows.slice(0, 10).map((d) => ({ label: d.company, value: d.gross, hint: `${int(d.orders)} Best.` }))} />
              <DataTable
                head={["Händler", "Bestellungen", "Umsatz brutto", "Ø Bestellwert", "Letzte Bestellung", "Häufigste Produkte", "Häufigste Sorten"]}
                rows={a.dealers.rows.map((d) => [d.company, int(d.orders), formatPrice(d.gross), d.aov === null ? "—" : formatPrice(d.aov), formatDay(d.lastOrder), d.topProducts.join(", "), d.topSorts.join(", ")])}
              />
              {a.dealers.quiet.length ? (
                <div className="mt-4 border-line border-t pt-3 text-[13px]">
                  <p className="mb-1 font-medium">Freigegebene Händler ohne Bestellung seit {a.dealers.quietDays} Tagen ({int(a.dealers.quiet.length)})</p>
                  <ul className="space-y-0.5 text-muted">
                    {a.dealers.quiet.slice(0, 15).map((d) => (
                      <li key={d.id}>
                        {d.company} · {d.lastOrder ? `zuletzt ${formatDay(d.lastOrder)}` : "noch nie bestellt"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
            <Card title="Privatkunden">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
                <dt className="text-muted">Kunden (Konto oder E-Mail)</dt>
                <dd className="tabular-nums">{int(a.privat.customers)}</dd>
                <dt className="text-muted">Neu (im Vergleichszeitraum nicht gekauft)</dt>
                <dd className="tabular-nums">{int(a.privat.newInPeriod)}</dd>
                <dt className="text-muted">Wiederkehrend (auch im Vergleichszeitraum)</dt>
                <dd className="tabular-nums">{int(a.privat.returning)}</dd>
                <dt className="text-muted">Mit 2+ Bestellungen im Zeitraum</dt>
                <dd className="tabular-nums">{int(a.privat.repeatInPeriod)}</dd>
                <dt className="text-muted">Bestellungen je Kunde</dt>
                <dd className="tabular-nums">{a.privat.frequency === null ? "—" : a.privat.frequency.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</dd>
                <dt className="text-muted">Ø Bestellwert</dt>
                <dd className="tabular-nums">{a.privat.aov === null ? "—" : formatPrice(a.privat.aov)}</dd>
                <dt className="text-muted">Umsatz brutto</dt>
                <dd className="tabular-nums">{formatPrice(a.privat.gross)}</dd>
              </dl>
              <p className="mt-3 text-[12px] text-muted">
                Zuordnung über Kundenkonto, sonst E-Mail-Adresse. „Neu“ bezieht sich nur auf den Vergleichszeitraum, nicht auf die gesamte Kaufhistorie.
                {a.privat.unknown ? ` ${int(a.privat.unknown)} Bestellung(en) ohne zuordenbaren Kunden.` : ""}
              </p>
            </Card>
          </div>

          <Card className="mb-6" title="Rabatte und Influencer-Codes">
            <div className="grid gap-8 xl:grid-cols-2">
              <TimeBars buckets={a.timeline} mode="rabatt" title="Rabattentwicklung (brutto)" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[14px]">
                  <thead>
                    <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
                      <th className="py-2 pr-4 font-medium">Code</th>
                      <th className="py-2 pr-4 font-medium">Creator</th>
                      <th className="py-2 pr-4 font-medium">Verwendungen</th>
                      <th className="py-2 pr-4 font-medium">Umsatz</th>
                      <th className="py-2 pr-4 font-medium">Rabatt</th>
                      <th className="py-2 font-medium">Provision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.discounts.codes.map((c) => (
                      <tr key={c.code} title={`Bestellungen: ${c.orders.slice(0, 30).join(", ")}`}>
                        <td className="py-2 pr-4 font-medium">{c.code}</td>
                        <td className="py-2 pr-4">{c.creator || "—"}</td>
                        <td className="py-2 pr-4 tabular-nums">{int(c.uses)}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatPrice(c.gross)}</td>
                        <td className="py-2 pr-4 tabular-nums">{formatPrice(c.discount)}</td>
                        <td className="py-2 tabular-nums">{c.commission === null ? "—" : formatPrice(c.commission)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 pr-4">Ohne Code</td>
                      <td className="py-2 pr-4 text-muted">Mix-Rabatt oder Aktionscode</td>
                      <td className="py-2 pr-4 tabular-nums">{int(a.discounts.mixOrPromo.orders)}</td>
                      <td className="py-2 pr-4" />
                      <td className="py-2 pr-4 tabular-nums">{formatPrice(a.discounts.mixOrPromo.discount)}</td>
                      <td className="py-2" />
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">Händlerrabatt</td>
                      <td className="py-2 pr-4 text-muted">auf Rechnung</td>
                      <td className="py-2 pr-4 tabular-nums">{int(a.discounts.dealer.orders)}</td>
                      <td className="py-2 pr-4" />
                      <td className="py-2 pr-4 tabular-nums">{formatPrice(a.discounts.dealer.discount)}</td>
                      <td className="py-2" />
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-[12px] text-muted">Provision nur aus dem Provisionsbuch (je Bestellung einmal, stornierte nicht) – hier wird nichts neu berechnet. Ohne Code lässt sich bei Privatbestellungen nicht unterscheiden, ob Mix-Rabatt oder Stripe-Aktionscode.</p>
              </div>
            </div>
          </Card>

          <Card title="Gewinn">
            <p className="text-[14px] text-muted">Keine Gewinnberechnung: Im System sind keine Einkaufspreise und Kosten hinterlegt. Ausgewiesen werden nur Umsatz und Bestellwerte.</p>
          </Card>
        </>
      )}
    </>
  );
}
