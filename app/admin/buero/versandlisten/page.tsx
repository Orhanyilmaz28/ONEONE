import type { Metadata } from "next";
import { Card, EmptyState, Notice, PageHeader, Table, formatDateTime } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { applyFilters, describeFilters, parseFilters } from "@/lib/office/filters";
import { can } from "@/lib/office/roles";
import { shippingRows } from "@/lib/office/shipping";
import { loadOfficeOrders } from "@/lib/office/source";
import { changedSinceRelease } from "@/lib/office/workflow";
import { resolveRange } from "@/lib/office/time";
import { DocButtons, FilterFields, FormButtons, RangeFields, type SearchParams, paramsOf, productOptions } from "../shared";

export const metadata: Metadata = { title: "Versandlisten · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/versandlisten";
/** So viele Zeilen zeigt die Seite; Excel und PDF enthalten immer alle */
const SHOW = 400;

export default async function ShippingListsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const raw = await paramsOf(searchParams);
  // Erster Aufruf: heute, nur versandbereite Bestellungen
  const first = !raw.zeitraum;
  const p: Record<string, string> = { ...raw, zeitraum: raw.zeitraum || "heute", ...(first ? { versandbereit: "1" } : {}) };
  const now = Date.now();
  const r = resolveRange({ preset: p.zeitraum, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  const products = await productLookup();
  const filters = parseFilters(p);
  const loaded = r.ok ? await loadOfficeOrders(r.range.from, r.range.to, products) : null;
  const orders = loaded ? applyFilters(loaded.orders, filters, products) : [];
  const rows = shippingRows(orders, products);
  const write = can(me.role, "office.documents") && can(me.role, "office.export");
  const stale = orders.filter((o) => changedSinceRelease(o, o.office, products).length).map((o) => o.number);
  const unsafe = orders.filter((o) => o.processing === "storniert" || (o.channel === "privat" && o.paymentStatus === "offen")).length;

  return (
    <>
      <PageHeader
        description="Empfänger, Lieferadresse und Artikel je Position – zur Versandvorbereitung. Keine Preise. Das Büro entscheidet selbst, wann und an wen die Liste geht."
        title="Versandlisten"
      />
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Versandliste nicht erstellt" tone="red">
            {p.fehler.slice(0, 300)}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form action={BASE} className="space-y-4" method="get">
          <RangeFields defaultPreset="heute" p={p} />
          <FilterFields p={p} products={productOptions(products)} shipReady />
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
              <Notice title="Daten unvollständig – Download gesperrt" tone="red">
                {loaded.errors.join(" ")}
              </Notice>
            </div>
          ) : null}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <p className="text-[14px] text-muted" role="status">
              <b className="font-medium text-ink">{orders.length}</b> {orders.length === 1 ? "Bestellung" : "Bestellungen"} · <b className="font-medium text-ink">{rows.length}</b> Positionen · {r.range.label} ·{" "}
              {describeFilters(filters, products).join(" · ")}
            </p>
            {write ? <DocButtons back={BASE} count={orders.length} disabled={!loaded?.complete || orders.length === 0} doc="versandliste" excel="versand" p={p} /> : null}
          </div>
          {stale.length ? (
            <div className="mb-4">
              <Notice title={`${stale.length} ${stale.length === 1 ? "Bestellung wurde" : "Bestellungen wurden"} nach der Versandfreigabe geändert`} tone="red">
                {stale.slice(0, 20).join(", ")}
                {stale.length > 20 ? " …" : ""} – bitte erneut prüfen und freigeben, bevor sie versendet werden.
              </Notice>
            </div>
          ) : null}
          {unsafe ? (
            <div className="mb-4">
              <Notice title={`${unsafe} ${unsafe === 1 ? "Bestellung ist" : "Bestellungen sind"} storniert oder (privat) noch unbezahlt`}>
                Sie stehen in der Liste, weil „Nur versandbereite Bestellungen“ ausgeschaltet ist. Bitte vor der Weitergabe prüfen.
              </Notice>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState action={{ href: BASE, label: "Filter zurücksetzen" }} title="Keine passenden Bestellungen">
              Probiere einen anderen Zeitraum oder weniger Filter.
            </EmptyState>
          ) : (
            <Card padded={false}>
              <div className="px-6 pb-1">
                <Table head={["Bestellung", "Datum", "Empfänger / Firma", "Straße", "Nr.", "PLZ", "Ort", "Land", "Art.-Nr.", "Produkt", "Menge", "Einheit", "Versandhinweise"]}>
                  {rows.slice(0, SHOW).map((x, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
                    <tr className={`align-top ${x.first ? "" : "border-t-0"}`} key={`${x.key}-${i}`}>
                      <td className="py-2.5 pr-4 font-medium tabular-nums">{x.first ? x.number : ""}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-muted tabular-nums">{x.first ? formatDateTime(x.createdAt) : ""}</td>
                      <td className="py-2.5 pr-4">{x.first ? [x.company, x.recipient].filter(Boolean).join(" · ") || "fehlt" : ""}</td>
                      <td className="py-2.5 pr-4">{x.first ? [x.street, x.extra].filter(Boolean).join(", ") || "fehlt" : ""}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{x.first ? x.houseNo || "—" : ""}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{x.first ? x.zip || "fehlt" : ""}</td>
                      <td className="py-2.5 pr-4">{x.first ? x.city || "fehlt" : ""}</td>
                      <td className="py-2.5 pr-4 text-muted">{x.first ? x.country || "—" : ""}</td>
                      <td className="py-2.5 pr-4 text-muted tabular-nums">{x.sku || "—"}</td>
                      <td className="py-2.5 pr-4">
                        {x.product}
                        {x.sort && x.sort !== x.product ? <span className="block text-[12px] text-muted">{x.sort}</span> : null}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium tabular-nums">{x.quantity}</td>
                      <td className="py-2.5 pr-4 text-[13px]">
                        {x.unit || "unbekannt"}
                        {x.contents ? <span className="block text-muted">{x.contents}</span> : null}
                      </td>
                      <td className="max-w-[14rem] py-2.5 pr-4 text-[13px] text-muted">{x.first ? x.note : ""}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>
          )}
          {rows.length > SHOW ? <p className="mt-3 text-[12px] text-muted">Angezeigt: die ersten {SHOW} Positionen. Excel und PDF enthalten alle {rows.length}.</p> : null}
          <p className="mt-4 text-[12px] text-muted">
            Eine Versandliste bedeutet nicht, dass versendet, übergeben oder geliefert wurde – der Versandstatus bleibt unverändert. Keine Übermittlung an Logistikunternehmen.
          </p>
        </>
      )}
    </>
  );
}
