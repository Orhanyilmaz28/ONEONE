import type { Metadata } from "next";
import { Card, EmptyState, Notice, PageHeader, Stat, Table } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { collectReport } from "@/lib/office/documents";
import { applyFilters, describeFilters, lineFilter, parseFilters } from "@/lib/office/filters";
import { can } from "@/lib/office/roles";
import { loadOfficeOrders } from "@/lib/office/source";
import { resolveRange } from "@/lib/office/time";
import { DocButtons, FilterFields, FormButtons, RangeFields, type SearchParams, paramsOf, productOptions } from "../shared";

export const metadata: Metadata = { title: "Artikel-Sammellisten · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/sammellisten";
const n = (v: number) => v.toLocaleString("de-DE");

export default async function CollectListsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const raw = await paramsOf(searchParams);
  const p: Record<string, string> = { ...raw, zeitraum: raw.zeitraum || "heute" };
  const now = Date.now();
  const r = resolveRange({ preset: p.zeitraum, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  const products = await productLookup();
  const filters = parseFilters(p);
  const loaded = r.ok ? await loadOfficeOrders(r.range.from, r.range.to, products) : null;
  const orders = loaded ? applyFilters(loaded.orders, filters, products) : [];
  const rep = collectReport(orders, products, lineFilter(filters, products));
  const total = rep.totals.cans + rep.totals.bottles;
  const write = can(me.role, "office.documents") && can(me.role, "office.export");

  return (
    <>
      <PageHeader description="Welche Produkte im Zeitraum insgesamt bestellt wurden – zur Auftragsvorbereitung. Nur bestellte Mengen, keine Lagerbestände." title="Artikel-Sammellisten" />
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Sammelliste nicht erstellt" tone="red">
            {p.fehler.slice(0, 300)}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form action={BASE} className="space-y-4" method="get">
          <RangeFields defaultPreset="heute" p={p} />
          <FilterFields p={p} products={productOptions(products)} />
          <FormButtons reset={BASE} submit="Anzeigen" />
        </form>
      </Card>

      {!r.ok ? (
        <Notice title="Zeitraum ungültig" tone="red">
          {r.error}
        </Notice>
      ) : (
        <>
          {loaded?.errors.length ? (
            <div className="mb-5">
              <Notice title="Daten unvollständig – Mengen fehlen, Download gesperrt" tone="red">
                {loaded.errors.join(" ")}
              </Notice>
            </div>
          ) : null}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <p className="text-[14px] text-muted" role="status">
              <b className="font-medium text-ink">{rep.totals.orders}</b> Bestellungen{rep.totals.cancelled ? ` (${rep.totals.cancelled} stornierte nicht mitgezählt)` : ""} · {r.range.label} · {describeFilters(filters, products).join(" · ")}
            </p>
            {write ? <DocButtons back={BASE} count={orders.length} disabled={!loaded?.complete || orders.length === 0} doc="sammelliste" excel="sammel" p={p} /> : null}
          </div>

          {rep.bySort.length === 0 && rep.unknown.length === 0 ? (
            <EmptyState action={{ href: BASE, label: "Filter zurücksetzen" }} title="Keine bestellten Artikel">
              Im gewählten Zeitraum passt keine Bestellung zu den Filtern.
            </EmptyState>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Dosen gesamt" value={n(rep.totals.cans)} />
                <Stat label="Flaschen gesamt" value={n(rep.totals.bottles)} />
                <Stat hint={rep.totals.partialTrays ? `+ ${rep.totals.partialTrays} angebrochene` : undefined} label="Volle Trays" value={n(rep.totals.trays)} />
                <Stat label="Sorten" value={rep.bySort.length} />
              </div>
              <Card className="mb-6" padded={false} title="Mengen je Sorte">
                <div className="px-6 pb-1">
                  <Table head={["Sorte", "Art.-Nr.", "Stück", "Je Tray", "Trays", "Rest", "Paletten", "Anteil", "Privat", "Händler", "Bestellungen"]}>
                    {rep.bySort.map((x) => (
                      <tr key={x.handle}>
                        <td className="py-2.5 pr-4 font-medium">{x.sort}</td>
                        <td className="py-2.5 pr-4 text-muted tabular-nums">{x.sku || "—"}</td>
                        <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums">
                          {n(x.units)} {x.unitName}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{x.perTray}</td>
                        <td className="py-2.5 pr-4 font-medium tabular-nums">{n(x.trays)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{x.rest}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{x.pallets === null ? "—" : (Math.round(x.pallets * 100) / 100).toLocaleString("de-DE")}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{total ? `${(Math.round((x.units / total) * 1000) / 10).toLocaleString("de-DE")} %` : "—"}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{n(x.privat)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{n(x.haendler)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{x.orders}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </Card>
              <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
                <Card padded={false} title="Mengen je Produkt">
                  <div className="px-6 pb-1">
                    <Table head={["Produkt", "Art.-Nr.", "Einheit", "Menge", "Privat", "Händler"]}>
                      {rep.byProduct.map((x) => (
                        <tr key={`${x.product}|${x.unit}`}>
                          <td className="py-2.5 pr-4 font-medium">{x.product}</td>
                          <td className="py-2.5 pr-4 text-muted tabular-nums">{x.sku || "—"}</td>
                          <td className="py-2.5 pr-4">{x.unit}</td>
                          <td className="py-2.5 pr-4 font-medium tabular-nums">{n(x.quantity)}</td>
                          <td className="py-2.5 pr-4 tabular-nums">{n(x.privat)}</td>
                          <td className="py-2.5 pr-4 tabular-nums">{n(x.haendler)}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </Card>
                <Card padded={false} title="Je Verpackungseinheit">
                  <div className="px-6 pb-1">
                    <Table head={["Einheit", "Menge"]}>
                      {rep.byUnit.map((x) => (
                        <tr key={x.unit}>
                          <td className="py-2.5 pr-4">{x.unit}</td>
                          <td className="py-2.5 pr-4 font-medium tabular-nums">{n(x.quantity)}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </Card>
              </div>
              {rep.unknown.length ? (
                <div className="mt-6">
                  <Notice title="Positionen mit unbekannter Menge (nicht in den Summen)">
                    {rep.unknown.map((u) => `${u.number}: ${u.quantity}× ${u.product} (${u.unit || "Einheit unbekannt"})`).join(" · ")}
                  </Notice>
                </div>
              ) : null}
              <p className="mt-4 text-[12px] text-muted">
                Mixpakete werden laut hinterlegten Produktdaten in Sorten aufgeteilt. Mengen je Tray aus den Artikeldaten (z. B. Energy 24 Dosen, Wasser 12 Flaschen); Paletten nur, wenn ein Artikelpass die Palettengröße nennt.
                Bei Produkt-, Sorten- oder Gruppenfilter zählen nur die passenden Sorten. Gleiche Berechnung wie im Excel-Export.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
