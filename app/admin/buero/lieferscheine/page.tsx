import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btn, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { MAX_NOTES_PER_PDF, type NoteBook, readNotes } from "@/lib/office/delivery-notes";
import { deliveryNoteIssues } from "@/lib/office/documents";
import { applyFilters, describeFilters, parseFilters } from "@/lib/office/filters";
import { CHANNEL_LABEL, type OfficeOrder, officeUrl } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import { shipTo } from "@/lib/office/shipping";
import { loadOfficeOrders } from "@/lib/office/source";
import { resolveRange } from "@/lib/office/time";
import { FilterFields, FormButtons, HiddenParams, PaymentBadge, RangeFields, type SearchParams, ShippingBadge, paramsOf, passParams, productOptions } from "../shared";
import { SelectionTools } from "./selection";

export const metadata: Metadata = { title: "Lieferscheine · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/lieferscheine";
const PER_PAGE = 50;
const LS_FILTER = [
  { key: "", label: "Mit und ohne Lieferschein" },
  { key: "ohne", label: "Noch ohne Lieferschein" },
  { key: "mit", label: "Lieferschein vorhanden" },
] as const;

const summary = (o: OfficeOrder) => o.lines.map((l) => `${l.quantity}× ${l.sort}`).join(", ");

export default async function DeliveryNotesPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const raw = await paramsOf(searchParams);
  const p: Record<string, string> = { ...raw, zeitraum: raw.zeitraum || "woche" };
  const write = can(me.role, "office.documents");
  const now = Date.now();
  const r = resolveRange({ preset: p.zeitraum, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  const products = await productLookup();
  const filters = parseFilters(p);
  const loaded = r.ok ? await loadOfficeOrders(r.range.from, r.range.to, products) : null;
  let book: NoteBook | null = null;
  try {
    book = await readNotes();
  } catch {
    book = null;
  }
  const notes = book?.notes ?? {};
  const lsFilter = LS_FILTER.find((x) => x.key === p.ls)?.key ?? "";
  const all = (loaded ? applyFilters(loaded.orders, filters, products) : []).filter((o) => (lsFilter === "ohne" ? !notes[o.key] : lsFilter === "mit" ? Boolean(notes[o.key]) : true));
  const selectable = all.filter((o) => o.processing !== "storniert");
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(p.seite) || 1));
  const visible = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const pageHref = (n: number) => `${BASE}?${passParams(p, { seite: String(n), ls: lsFilter })}`;
  const blocked = !loaded?.complete || !book;

  return (
    <>
      <PageHeader
        description="Bestellung suchen, auswählen, Lieferschein ansehen, als PDF herunterladen oder drucken – einzeln oder als Sammeldruck. Keine Preise, kein automatischer Versandstatus."
        title="Lieferscheine"
      />
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Lieferschein nicht erstellt" tone="red">
            {p.fehler.slice(0, 300)}
          </Notice>
        </div>
      ) : null}
      {!write ? (
        <div className="mb-6">
          <Notice title="Nur Lesezugriff" tone="blue">
            Du siehst vorhandene Lieferscheine. Neue Lieferscheine und Downloads sind Büromitarbeiter:innen und Administrator:innen vorbehalten.
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form action={BASE} className="space-y-4" method="get">
          <RangeFields defaultPreset="woche" p={p} />
          <FilterFields p={p} products={productOptions(products)} />
          <div className="max-w-sm">
            <label className={label} htmlFor="f-ls">
              Lieferschein
            </label>
            <select className={`${input} pr-8`} defaultValue={lsFilter} id="f-ls" name="ls">
              {LS_FILTER.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
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
              <Notice title="Daten unvollständig – Lieferscheine gesperrt" tone="red">
                {loaded.errors.join(" ")}
              </Notice>
            </div>
          ) : null}
          {!book ? (
            <div className="mb-5">
              <Notice title="Lieferscheinnummern nicht lesbar – Lieferscheine gesperrt" tone="red">
                Der Datenspeicher ist gerade nicht erreichbar. Bitte später erneut versuchen.
              </Notice>
            </div>
          ) : null}
          <p className="mb-4 text-[14px] text-muted" role="status">
            <b className="font-medium text-ink">{all.length}</b> {all.length === 1 ? "Bestellung" : "Bestellungen"} · {r.range.label} · {describeFilters(filters, products).join(" · ")}
            {lsFilter ? ` · ${LS_FILTER.find((x) => x.key === lsFilter)?.label}` : ""}
          </p>

          {all.length === 0 ? (
            <EmptyState action={{ href: BASE, label: "Filter zurücksetzen" }} title="Keine passenden Bestellungen">
              Probiere einen anderen Zeitraum oder weniger Filter.
            </EmptyState>
          ) : (
            <>
              {write && !blocked ? (
                <Card className="mb-4">
                  <div className="space-y-4">
                    <div>
                      <p className="font-medium text-[15px]">Sammeldruck: ausgewählte Bestellungen</p>
                      <p className="text-[13px] text-muted">Kästchen in der Tabelle markieren. Ein PDF mit einem Lieferschein je Bestellung. Stornierte Bestellungen sind ausgeschlossen.</p>
                    </div>
                    <SelectionTools form="ls-form" onPage={visible.filter((o) => o.processing !== "storniert").length} />
                    <form action="/api/admin/buero/dokument" className="flex flex-wrap gap-2" id="ls-form" method="post">
                      <input name="art" type="hidden" value="lieferschein" />
                      <input name="zurueck" type="hidden" value={BASE} />
                      <HiddenParams p={p} />
                      <button className={btnSecondary} formTarget="_blank" name="modus" type="submit" value="vorschau">
                        Vorschau (ohne Nummer)
                      </button>
                      <button className={btnSecondary} name="modus" type="submit" value="download">
                        Ausgewählte als PDF herunterladen
                      </button>
                      <button className={btn} formTarget="_blank" name="modus" type="submit" value="druck">
                        Ausgewählte drucken
                      </button>
                    </form>
                  </div>
                  <div className="mt-5 border-line border-t pt-4">
                    <p className="font-medium text-[15px]">Alle {selectable.length} Filterergebnisse (alle Seiten)</p>
                    {selectable.length > MAX_NOTES_PER_PDF ? (
                      <p className="text-[13px] text-muted">Zu viele für einen Sammeldruck – höchstens {MAX_NOTES_PER_PDF}. Bitte Zeitraum oder Filter eingrenzen.</p>
                    ) : (
                      <form action="/api/admin/buero/dokument" className="mt-2 flex flex-wrap gap-2" method="post">
                        <input name="art" type="hidden" value="lieferschein" />
                        <input name="zurueck" type="hidden" value={BASE} />
                        <HiddenParams p={p} />
                        {selectable.map((o) => (
                          <input key={o.key} name="auswahl" type="hidden" value={o.key} />
                        ))}
                        <button className={btnSecondary} formTarget="_blank" name="modus" type="submit" value="vorschau">
                          Vorschau aller {selectable.length}
                        </button>
                        <button className={btnSecondary} name="modus" type="submit" value="download">
                          Alle {selectable.length} als PDF
                        </button>
                        <button className={btn} formTarget="_blank" name="modus" type="submit" value="druck">
                          Alle {selectable.length} drucken
                        </button>
                      </form>
                    )}
                    <p className="mt-2 text-[12px] text-muted">
                      Beim Herunterladen oder Drucken bekommt jede Bestellung ihre feste Lieferscheinnummer (bei erneutem Druck dieselbe). Der Versandstatus ändert sich dadurch nicht.
                    </p>
                  </div>
                </Card>
              ) : null}

              <Card padded={false}>
                <div className="px-6 pb-1">
                  <Table head={[write ? <span className="sr-only" key="a">Auswahl</span> : "", "Bestellung", "Datum", "Art", "Empfänger / Ort", "Artikel", "Zahlung", "Versand", "Lieferschein"]}>
                    {visible.map((o) => {
                      const note = notes[o.key];
                      const a = shipTo(o);
                      const issues = deliveryNoteIssues(o).filter((x) => !x.startsWith("Keine eigene"));
                      return (
                        <tr className="align-top" key={o.key}>
                          <td className="py-3 pr-3">
                            {write ? (
                              <input
                                aria-label={`Bestellung ${o.number} auswählen`}
                                className="mt-1 size-4"
                                disabled={o.processing === "storniert" || blocked}
                                form="ls-form"
                                name="auswahl"
                                type="checkbox"
                                value={o.key}
                              />
                            ) : null}
                          </td>
                          <td className="py-3 pr-4">
                            <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl(o)}>
                              {o.number}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-muted tabular-nums">{formatDateTime(o.createdAt)}</td>
                          <td className="py-3 pr-4">{CHANNEL_LABEL[o.channel]}</td>
                          <td className="py-3 pr-4">
                            <span className="block">{a?.company || a?.name || o.customerName || "—"}</span>
                            <span className="text-[13px] text-muted">{[a?.zip, a?.city].filter(Boolean).join(" ") || "Adresse fehlt"}</span>
                          </td>
                          <td className="max-w-[14rem] py-3 pr-4 text-[13px] text-muted">{summary(o) || "—"}</td>
                          <td className="py-3 pr-4">
                            <PaymentBadge o={o} />
                          </td>
                          <td className="py-3 pr-4">
                            <ShippingBadge o={o} />
                          </td>
                          <td className="py-3 pr-4 text-[13px]">
                            {o.processing === "storniert" ? (
                              <Badge tone="red">Storniert – kein Lieferschein</Badge>
                            ) : note ? (
                              <>
                                <span className="block font-medium tabular-nums">{note.number}</span>
                                <span className="text-muted">
                                  {note.version > 1 ? `Version ${note.version} · ` : ""}
                                  {note.events.filter((e) => e.action === "heruntergeladen" || e.action === "gedruckt").length}× ausgegeben
                                </span>
                              </>
                            ) : (
                              <span className="text-muted">noch keiner</span>
                            )}
                            {issues.length && o.processing !== "storniert" ? <span className="mt-1 block text-[12px] text-amber-800">{issues.join(" · ")}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              </Card>
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
              <p className="mt-4 text-[12px] text-muted">Einzelne Lieferscheine mit Bemerkung und Verlauf: Bestellnummer anklicken.</p>
            </>
          )}
        </>
      )}
    </>
  );
}
