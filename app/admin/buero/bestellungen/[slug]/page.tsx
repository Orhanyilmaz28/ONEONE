import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, Table, btn, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { CHANNEL_LABEL, type OfficeAddress, originalUrl, slugToKey } from "@/lib/office/model";
import { MAX_REMARK, type StoredNote, readNotesFor } from "@/lib/office/delivery-notes";
import { deliveryNoteIssues, missingCompanyFields } from "@/lib/office/documents";
import { companyInfo } from "@/lib/office/documents-service";
import { can } from "@/lib/office/roles";
import { loadOfficeOrder } from "@/lib/office/source";
import { PaymentBadge, ProcessingBadge, ShippingBadge } from "../../shared";
import { OfficeStatusBadge, WorkflowCard, WorkflowDialog, isDialog } from "../../workflow-ui";
import { changedSinceRelease } from "@/lib/office/workflow";

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

export default async function OfficeOrderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireOffice();
  const slug = (await params).slug;
  const sp = await searchParams;
  const str = (k: string, max = 600) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, max) : "");
  const fehler = str("fehler", 300);
  const aktion = str("aktion", 30);
  const key = slugToKey(slug);
  if (!key) notFound();
  const products = await productLookup();
  const now = Date.now();
  const { order: o, error } = await loadOfficeOrder(key, products);
  if (error)
    return (
      <Notice title="Bestellung konnte nicht geladen werden" tone="red">
        {error}
      </Notice>
    );
  if (!o) notFound();
  let note: StoredNote | undefined;
  let notesOk = true;
  try {
    note = (await readNotesFor([o.key])).get(o.key);
  } catch {
    notesOk = false;
  }
  const company = await companyInfo();
  const companyMissing = missingCompanyFields(company);
  const issues = deliveryNoteIssues(o);
  const changed = changedSinceRelease(o, o.office, products);
  if (changed.length) issues.push("Bestellung nach der Versandfreigabe geändert – Freigabe prüfen.");
  const write = can(me.role, "office.documents");
  const back = `/admin/buero/bestellungen/${slug}`;
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
        <OfficeStatusBadge o={o} />
        <PaymentBadge o={o} />
        <ProcessingBadge o={o} />
        <ShippingBadge o={o} />
        {o.paymentMethod ? <Badge>{o.paymentMethod}</Badge> : null}
        {o.invoiceNumber ? <Badge tone="blue">Rechnung {o.invoiceNumber}</Badge> : null}
      </div>
      {fehler ? (
        <div className="mb-6">
          <Notice title="Lieferschein nicht erstellt" tone="red">
            {fehler}
          </Notice>
        </div>
      ) : null}
      {o.warnings.length ? (
        <div className="mb-6">
          <Notice title="Hinweise">{o.warnings.join(" · ")}</Notice>
        </div>
      ) : null}
      {isDialog(aktion) ? <WorkflowDialog action={aktion} back={back} me={me} now={now} o={o} products={products} /> : null}
      <WorkflowCard back={back} fehler={str("bearbeitung")} konflikt={str("konflikt") === "1"} me={me} o={o} ok={str("erledigt", 30)} products={products} />

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

      <Card className="mt-6" title="Lieferschein">
        {o.processing === "storniert" ? (
          <p className="text-[14px] text-muted">Für stornierte Bestellungen wird kein Lieferschein erstellt.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 text-[14px]">
              {!notesOk ? (
                <Notice title="Lieferscheinnummern nicht lesbar" tone="red">
                  Der Datenspeicher ist gerade nicht erreichbar.
                </Notice>
              ) : note ? (
                <>
                  <p>
                    <span className="text-muted">Nummer: </span>
                    <b className="font-medium tabular-nums">{note.number}</b>
                    {note.version > 1 ? <span className="text-muted"> · Version {note.version}</span> : null}
                  </p>
                  <p className="text-muted">
                    Erstellt {formatDateTime(note.createdAt)} von {note.createdBy}
                  </p>
                  {note.remark ? <p>Bemerkung: {note.remark}</p> : null}
                  {note.versions?.length && can(me.role, "office.documents") ? (
                    <div>
                      <p className="mb-1 text-[13px] text-muted">Gespeicherte Versionen (Archivkopie unverändert erneut erzeugen)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...note.versions].reverse().map((v) => (
                          <form action="/api/admin/buero/dokument" key={v.version} method="post" target="_blank">
                            <input name="art" type="hidden" value="lieferschein" />
                            <input name="modus" type="hidden" value="archiv" />
                            <input name="version" type="hidden" value={v.version} />
                            <input name="auswahl" type="hidden" value={o.key} />
                            <input name="zurueck" type="hidden" value={back} />
                            <button className="rounded-full border border-line px-3 py-1 text-[12px] hover:border-ink/40" title={`Stand ${formatDateTime(v.at)} · ${v.by}`} type="submit">
                              Version {v.version}
                            </button>
                          </form>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1 text-[13px] text-muted">Verlauf</p>
                    <ul className="space-y-0.5 text-[13px]">
                      {[...note.events].reverse().map((e, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                        <li key={i}>
                          {formatDateTime(e.at)} · {e.action}
                          {e.version > 1 ? ` (Version ${e.version})` : ""} · {e.by}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-muted">Noch kein Lieferschein. Die Nummer wird beim ersten Herunterladen oder Drucken vergeben – die Vorschau vergibt keine.</p>
              )}
              {issues.length ? (
                <Notice title="Bitte prüfen">
                  <ul className="list-disc pl-5">
                    {issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </Notice>
              ) : null}
              {companyMissing.length ? (
                <Notice title="Firmendaten unvollständig">
                  Auf dem Lieferschein fehlt: {companyMissing.join(", ")}. {me.role === "admin" ? "Bitte unter Einstellungen → Firmendaten ergänzen." : "Bitte den Administrator informieren."}
                </Notice>
              ) : null}
            </div>
            {write && notesOk ? (
              <form action="/api/admin/buero/dokument" className="space-y-3" method="post">
                <input name="art" type="hidden" value="lieferschein" />
                <input name="auswahl" type="hidden" value={o.key} />
                <input name="zurueck" type="hidden" value={back} />
                <div>
                  <label className={label} htmlFor="ls-bemerkung">
                    Bemerkung auf dem Lieferschein (optional)
                  </label>
                  <textarea className={`${input} min-h-20`} defaultValue={note?.remark ?? ""} id="ls-bemerkung" maxLength={MAX_REMARK} name="bemerkung" placeholder="z. B. Palette oben leicht" />
                  <p className="mt-1 text-[12px] text-muted">Eine geänderte Bemerkung ergibt eine neue Version mit derselben Nummer. Keine Preise.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={btnSecondary} formTarget="_blank" name="modus" type="submit" value="vorschau">
                    Ansehen (Vorschau)
                  </button>
                  <button className={btnSecondary} name="modus" type="submit" value="download">
                    PDF herunterladen
                  </button>
                  <button className={btn} formTarget="_blank" name="modus" type="submit" value="druck">
                    Drucken
                  </button>
                </div>
                <p className="text-[12px] text-muted">Der Lieferschein ändert weder Versandstatus noch Rechnung.</p>
              </form>
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}
