import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btn, btnSecondary, formatDateTime, input } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { applyFilters, describeFilters, parseFilters } from "@/lib/office/filters";
import { CHANNEL_LABEL, type OfficeOrder, officeUrl } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import { loadOfficeOrders } from "@/lib/office/source";
import { resolveRange } from "@/lib/office/time";
import { ATTENTION_LABEL, attention } from "@/lib/office/workflow";
import { BULK_ACTIONS, BULK_LABEL } from "@/lib/office/workflow-service";
import { MAX_BULK } from "@/lib/office/workflow-store";
import { FilterFields, FormButtons, PaymentBadge, RangeFields, type SearchParams, ShippingBadge, paramsOf, passParams, productOptions } from "../shared";
import { OfficeStatusBadge } from "../workflow-ui";

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
const itemCount = (o: OfficeOrder) => o.lines.reduce((n, l) => n + l.quantity, 0);

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
  const write = can(me.role, "office.workflow");
  const back = `${BASE}?${passParams(p, { seite: String(page) })}`;

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
          <p className="mb-4 text-[14px] text-muted" role="status">
            <b className="font-medium text-ink">{all.length}</b> {all.length === 1 ? "Bestellung" : "Bestellungen"} · {r.range.label} · {describeFilters(filters, products).join(" · ")}
          </p>

          {all.length === 0 ? (
            <EmptyState action={{ href: BASE, label: "Filter zurücksetzen" }} title="Keine passenden Bestellungen">
              Probiere einen anderen Zeitraum oder weniger Filter.
            </EmptyState>
          ) : (
            <>
              <form action="/admin/buero/sammelaktion" method="get">
                <input name="zurueck" type="hidden" value={back} />
                <ul className="space-y-3 md:hidden">
                  {visible.map((o) => (
                    <li className="relative" key={o.key}>
                      {write ? <input aria-label={`${o.number} auswählen`} className="absolute top-4 left-4 z-10 size-4" name="auswahl" type="checkbox" value={o.key} /> : null}
                      <Link className={`block rounded-2xl border border-line bg-card p-4 ${write ? "pl-10" : ""}`} href={officeUrl(o)}>
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
                          <OfficeStatusBadge o={o} />
                          {o.office?.flag ? <Badge tone="amber">Prüfung erforderlich</Badge> : null}
                        </div>
                        {o.office?.assignee ? <p className="mt-1 text-[12px] text-muted">Zuständig: {o.office.assignee}</p> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Card padded={false}>
                    <div className="px-6 pb-1">
                      <Table
                        head={[
                          ...(write ? [<span className="sr-only" key="a">Auswahl</span>] : []),
                          "Bestellung",
                          "Kunde",
                          "Typ",
                          "Datum",
                          "Zahlung",
                          "Bürostatus",
                          "Versand",
                          <span className="block text-right" key="n">Artikel</span>,
                          <span className="block text-right" key="s">Betrag</span>,
                          "Zuständig / zuletzt",
                          "Hinweise",
                        ]}
                      >
                        {visible.map((o) => {
                          const att = attention(o, o.office, products);
                          return (
                            <tr className="relative transition hover:bg-ink/[0.025]" key={o.key}>
                              {write ? (
                                <td className="relative z-10 py-3 pr-3 align-top">
                                  <input aria-label={`${o.number} auswählen`} className="size-4" name="auswahl" type="checkbox" value={o.key} />
                                </td>
                              ) : null}
                              <td className="py-3 pr-4 align-top">
                                <Link className="font-medium tabular-nums after:absolute after:inset-0 after:content-['']" href={officeUrl(o)}>
                                  {o.number}
                                </Link>
                                {o.exportedAt ? <span className="block text-[11px] text-muted">exportiert</span> : null}
                              </td>
                              <td className="py-3 pr-4 align-top">
                                {o.company ? <span className="block">{o.company}</span> : null}
                                <span className={o.company ? "text-[13px] text-muted" : ""}>{o.customerName || "—"}</span>
                                <span className="block text-[12px] text-muted">{place(o)}</span>
                              </td>
                              <td className="py-3 pr-4 align-top">{CHANNEL_LABEL[o.channel]}</td>
                              <td className="whitespace-nowrap py-3 pr-4 align-top text-muted tabular-nums">
                                {formatDateTime(o.createdAt).split(", ")[0]}
                                <span className="block text-[12px]">{formatDateTime(o.createdAt).split(", ")[1]}</span>
                              </td>
                              <td className="py-3 pr-4 align-top">
                                <PaymentBadge o={o} />
                              </td>
                              <td className="py-3 pr-4 align-top">
                                <OfficeStatusBadge o={o} />
                              </td>
                              <td className="py-3 pr-4 align-top">
                                <ShippingBadge o={o} />
                              </td>
                              <td className="py-3 pr-4 text-right align-top tabular-nums" title={summary(o)}>
                                {itemCount(o)}
                              </td>
                              <td className="whitespace-nowrap py-3 pr-4 text-right align-top tabular-nums">
                                {formatPrice(o.gross)}
                                <span className="block text-[11px] text-muted">{o.priceBasis === "netto" ? "Händler, inkl. USt" : "inkl. USt"}</span>
                              </td>
                              <td className="py-3 pr-4 align-top text-[12px]">
                                <span className="block text-[13px]">{o.office?.assignee ?? "—"}</span>
                                {o.office?.updatedBy ? <span className="block text-muted">{formatDateTime(o.office.updatedAt)}</span> : null}
                              </td>
                              <td className="py-3 pr-4 align-top">
                                {att.length ? (
                                  <span className="flex max-w-[11rem] flex-wrap gap-1" title={att.map((x) => x.text).join(" · ")}>
                                    {att.map((x) => (
                                      <Badge key={x.kind} tone={x.kind === "geaendert" || x.kind === "abgleich" ? "red" : "amber"}>
                                        {ATTENTION_LABEL[x.kind]}
                                      </Badge>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </Table>
                    </div>
                  </Card>
                </div>
                {write ? (
                  <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-card p-4">
                    <div>
                      <label className="mb-1.5 block font-medium text-[13px] text-ink/70" htmlFor="sammel-aktion">
                        Sammelaktion für die ausgewählten Bestellungen (höchstens {MAX_BULK})
                      </label>
                      <select className={`${input} pr-8`} id="sammel-aktion" name="aktion">
                        {BULK_ACTIONS.map((a) => (
                          <option key={a} value={a}>
                            {BULK_LABEL[a]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className={btn} type="submit">
                      Auswahl prüfen
                    </button>
                    <p className="w-full text-[12px] text-muted">Zuerst wird jede Bestellung geprüft – geändert wird erst nach deiner Bestätigung auf der nächsten Seite.</p>
                  </div>
                ) : null}
              </form>
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
