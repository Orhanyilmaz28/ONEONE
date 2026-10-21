import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice, PageHeader, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { CHANNEL_LABEL, type OfficeOrder, keyToSlug, slugToKey } from "@/lib/office/model";
import { loadOfficeOrder } from "@/lib/office/source";
import { COMPLAINT_LABEL, COMPLAINT_TYPES, PRIORITIES, PRIORITY_LABEL, TICKET_KINDS, TICKET_KIND_LABEL } from "@/lib/office/tickets";
import { type SearchParams, paramsOf } from "../../shared";
import { createTicketAction } from "../actions";

export const metadata: Metadata = { title: "Neuer Kundenfall · Büro" };
export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOffice("office.service");
  const p = await paramsOf(searchParams);
  let order: OfficeOrder | null = null;
  let orderError = "";
  if (p.bestellung) {
    const key = slugToKey(p.bestellung);
    if (!key) orderError = "Unbekannte Bestellung.";
    else {
      const r = await loadOfficeOrder(key, await productLookup());
      order = r.order;
      if (!r.order) orderError = r.error ?? "Die Bestellung wurde nicht gefunden.";
    }
  }
  const kind = TICKET_KINDS.find((k) => k === p.art) ?? "anfrage";
  return (
    <>
      <PageHeader description="Fall erfassen. Es wird keine Nachricht an den Kunden verschickt und nichts an der Bestellung geändert." title="Neuer Kundenfall" />
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Nicht angelegt" tone="red">
            {p.fehler}
          </Notice>
        </div>
      ) : null}
      {orderError ? (
        <div className="mb-6">
          <Notice title="Bestellung nicht verfügbar" tone="red">
            {orderError}
          </Notice>
        </div>
      ) : null}
      <form action={createTicketAction} className="grid gap-6">
        {order ? <input name="bestellung" type="hidden" value={keyToSlug(order.key)} /> : null}
        <Card title="Fall">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>Art</span>
              <select className={input} defaultValue={kind} name="kind">
                {TICKET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TICKET_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>Priorität</span>
              <select className={input} defaultValue="normal" name="priority">
                {PRIORITIES.map((k) => (
                  <option key={k} value={k}>
                    {PRIORITY_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Anliegen (kurz)</span>
              <input className={input} maxLength={120} name="subject" required />
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Beschreibung</span>
              <textarea className={`${input} min-h-28`} maxLength={4000} name="description" />
              <span className="text-[12px] text-muted">Keine Anhänge: Fotos oder Dokumente bleiben im E-Mail-Postfach. Hier höchstens einen Hinweis notieren („Fotos per E-Mail am …“).</span>
            </label>
          </div>
        </Card>

        <Card title="Kunde und Bestellung">
          {order ? (
            <p className="text-[14px]">
              Verknüpft mit Bestellung <b className="font-medium tabular-nums">{order.number}</b> ({CHANNEL_LABEL[order.channel]}) · {order.company || order.customerName} · {formatPrice(order.gross)}
              {order.refunded ? ` · bereits erstattet ${formatPrice(order.refunded)}` : ""}
              <span className="block text-[12px] text-muted">Kundendaten kommen aus der Bestellung; ein vorhandenes Kundenkonto oder Händlerkonto wird automatisch verknüpft (kein neues Konto).</span>
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <span className={label}>Name des Kunden</span>
                <input className={input} maxLength={120} name="customerName" />
              </label>
              <label>
                <span className={label}>E-Mail (optional)</span>
                <input className={input} maxLength={160} name="customerEmail" type="email" />
              </label>
              <label>
                <span className={label}>Bestellnummer (falls bekannt)</span>
                <input className={input} maxLength={40} name="orderText" />
              </label>
              <p className="text-[12px] text-muted sm:col-span-3">
                Tipp: Fälle zu einer Bestellung am besten direkt aus der Bestellung heraus anlegen (Büroverwaltung → Bestellung → „Kundenfall anlegen“). Dann sind Kunde und Positionen verknüpft.
              </p>
            </div>
          )}
        </Card>

        <Card title="Nur bei Reklamation">
          <label className="block max-w-md">
            <span className={label}>Art der Reklamation</span>
            <select className={input} defaultValue="" name="complaintType">
              <option value="">– bitte wählen –</option>
              {COMPLAINT_TYPES.map((k) => (
                <option key={k} value={k}>
                  {COMPLAINT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card title="Nur bei Retoure">
          <div className="grid gap-4">
            {order ? (
              <div className="grid gap-2">
                <span className={label}>Zurückgesendete Mengen (je Position, in Bestelleinheiten)</span>
                {order.lines.map((l, i) => (
                  <label className="flex flex-wrap items-center gap-3 text-[14px]" key={`${l.product}-${i}`}>
                    <input className={`${input} w-24`} max={l.quantity} min={0} name={`rq_${i}`} placeholder="0" type="number" />
                    <span>
                      {l.product}
                      {l.sort && l.sort !== l.product ? ` – ${l.sort}` : ""} · bestellt {l.quantity}
                      {l.unit ? ` × ${l.unit}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <label>
                  <span className={label}>Produkt</span>
                  <input className={input} maxLength={120} name="rfTitle" />
                </label>
                <label>
                  <span className={label}>Menge</span>
                  <input className={input} min={1} name="rfQty" type="number" />
                </label>
              </div>
            )}
            <label>
              <span className={label}>Rücksendegrund</span>
              <input className={input} maxLength={500} name="returnReason" />
            </label>
            <label>
              <span className={label}>Rücksendungsinformationen (z. B. Versandart, Sendungsnummer, vereinbarter Termin)</span>
              <textarea className={input} maxLength={1000} name="returnInfo" />
            </label>
            <p className="text-[12px] text-muted">Keine Lagerbuchung und keine Bestandskorrektur – die Retoure wird nur dokumentiert.</p>
          </div>
        </Card>

        <Card title="Nur bei Rückerstattungsanfrage">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <label>
              <span className={label}>Angefragter Betrag (€)</span>
              <input className={input} inputMode="decimal" maxLength={12} name="refundAmount" placeholder="12,50" />
            </label>
            <label>
              <span className={label}>Erstattungsgrund</span>
              <input className={input} maxLength={500} name="refundReason" />
            </label>
          </div>
          <p className="mt-2 text-[12px] text-muted">Es wird keine Stripe-Rückerstattung ausgelöst. Eine Erstattung erfolgt weiterhin manuell im Stripe-Dashboard bzw. per Überweisung.</p>
        </Card>

        <div className="flex gap-2">
          <button className={btn} type="submit">
            Fall anlegen
          </button>
          <Link className={btnSecondary} href="/admin/buero/kundenservice">
            Abbrechen
          </Link>
        </div>
      </form>
    </>
  );
}
