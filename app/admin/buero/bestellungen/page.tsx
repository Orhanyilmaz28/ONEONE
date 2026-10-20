import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { applyFilters, describeFilters, parseFilters } from "@/lib/office/filters";
import { CHANNEL_LABEL, type OfficeOrder, officeUrl } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import { loadOfficeOrders } from "@/lib/office/source";
import { resolveRange } from "@/lib/office/time";
import { FilterFields, FormButtons, PaymentBadge, ProcessingBadge, RangeFields, type SearchParams, ShippingBadge, paramsOf, passParams, productOptions } from "../shared";

export const metadata: Metadata = { title: "Alle Bestellungen · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/bestellungen";
const PER_PAGE = 50;

const place = (o: OfficeOrder) => {
  const a = o.delivery ?? o.billing;
  return [a?.zip, a?.city].filter(Boolean).join(" ");
};
const summary = (o: OfficeOrder) => o.lines.map((l) => `${l.quantity}× ${l.sort}`).join(", ");

export default async function OfficeOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const p = await paramsOf(searchParams);
  const now = Date.now();
  const r = resolveRange({ preset: p.zeitraum, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  const products = await productLookup();
  const filters = parseFilters(p);
  const loaded = r.ok ? await loadOfficeOrders(r.range.from, r.range.to, products) : null;
  const all = loaded ? applyFilters(loaded.orders, filters, products) : [];
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(p.seite) || 1));
  const visible = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const qs = passParams(p);
  const pageHref = (n: number) => `${BASE}?${passParams(p, { seite: String(n) })}`;

  return (
    <>
      <PageHeader
        actions={
          can(me.role, "office.export") && r.ok ? (
            <Link className={btnSecondary} href={`/admin/buero/export?${qs}`}>
              Diese Auswahl exportieren
            </Link>
          ) : null
        }
        description="Privat- und Händlerbestellungen gemeinsam – mit Suche und frei kombinierbaren Filtern."
        title="Alle Bestellungen"
      />

      <Card className="mb-6">
        <form action={BASE} className="space-y-4" method="get">
          <RangeFields p={p} />
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
              <Notice title="Die Liste ist gerade unvollständig" tone="red">
                {loaded.errors.join(" ")}
              </Notice>
            </div>
          ) : null}
          {filters.status === "freigegeben" ? (
            <div className="mb-5">
              <Notice title="„Für Versand freigegeben“ wird noch nicht erfasst" tone="blue">
                Die Freigabe für den Versand kommt mit Phase 3C. Bis dahin passt keine Bestellung zu diesem Filter.
              </Notice>
            </div>
          ) : null}
          <p className="mb-4 text-[14px] text-muted" role="status">
            <b className="font-medium text-ink">{all.length}</b> {all.length === 1 ? "Bestellung" : "Bestellungen"} · {r.range.label} · {describeFilters(filters, products).join(" · ")}
          </p>

          {all.length === 0 ? (
            <EmptyState action={{ href: BASE, label: "Filter zurücksetzen" }} title="Keine passenden Bestellungen">
              Probiere einen anderen Zeitraum oder weniger Filter.
            </EmptyState>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visible.map((o) => (
                  <li key={o.key}>
                    <Link className="block rounded-2xl border border-line bg-card p-4" href={officeUrl(o)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium tabular-nums">{o.number}</p>
                          <p className="text-[13px] text-muted">{formatDateTime(o.createdAt)}</p>
                        </div>
                        <p className="font-medium tabular-nums">{formatPrice(o.gross)}</p>
                      </div>
                      <p className="mt-2 text-[14px]">{o.company || o.customerName || "—"}</p>
                      <p className="text-[13px] text-muted">{summary(o)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>{CHANNEL_LABEL[o.channel]}</Badge>
                        <PaymentBadge o={o} />
                        <ProcessingBadge o={o} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Card padded={false}>
                  <div className="px-6 pb-1">
                    <Table head={["Bestellung", "Datum", "Art", "Kunde", "Ort", "Artikel", <span className="block text-right" key="s">Gesamt</span>, "Zahlung", "Bearbeitung", "Versand"]}>
                      {visible.map((o) => (
                        <tr className="relative transition hover:bg-ink/[0.025]" key={o.key}>
                          <td className="py-3 pr-4 align-top">
                            <Link className="font-medium tabular-nums after:absolute after:inset-0 after:content-['']" href={officeUrl(o)}>
                              {o.number}
                            </Link>
                            {o.exportedAt ? <span className="block text-[11px] text-muted">exportiert</span> : null}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 align-top text-muted tabular-nums">{formatDateTime(o.createdAt)}</td>
                          <td className="py-3 pr-4 align-top">{CHANNEL_LABEL[o.channel]}</td>
                          <td className="py-3 pr-4 align-top">
                            {o.company ? <span className="block">{o.company}</span> : null}
                            <span className={o.company ? "text-[13px] text-muted" : ""}>{o.customerName || "—"}</span>
                          </td>
                          <td className="py-3 pr-4 align-top text-muted">{place(o) || "—"}</td>
                          <td className="max-w-[16rem] py-3 pr-4 align-top text-[13px] text-muted">{summary(o) || "—"}</td>
                          <td className="whitespace-nowrap py-3 pr-4 text-right align-top tabular-nums">
                            {formatPrice(o.gross)}
                            <span className="block text-[11px] text-muted">{o.priceBasis === "netto" ? "Händler, inkl. USt" : "inkl. USt"}</span>
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <PaymentBadge o={o} />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <ProcessingBadge o={o} />
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <ShippingBadge o={o} />
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </Card>
              </div>
              {pages > 1 ? (
                <nav aria-label="Seiten" className="mt-5 flex items-center justify-between gap-3 text-sm">
                  {page > 1 ? (
                    <Link className={btnSecondary} href={pageHref(page - 1)}>
                      ← Zurück
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-muted">
                    Seite {page} von {pages}
                  </span>
                  {page < pages ? (
                    <Link className={btnSecondary} href={pageHref(page + 1)}>
                      Weiter →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
              <p className="mt-4 text-[12px] text-muted">Der Excel-Export enthält immer alle {all.length} passenden Bestellungen, nicht nur diese Seite.</p>
            </>
          )}
        </>
      )}
    </>
  );
}
