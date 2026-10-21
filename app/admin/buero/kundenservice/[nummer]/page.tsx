import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice, PageHeader, btn, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { CHANNEL_LABEL, type OfficeOrder, officeUrl } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import { loadOfficeOrder } from "@/lib/office/source";
import {
  COMPLAINT_LABEL,
  COMPLAINT_TYPES,
  DECISIONS,
  DECISION_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  REFUND_STATUS,
  REFUND_STATUS_LABEL,
  RETURN_STATUS,
  RETURN_STATUS_LABEL,
  TEMPLATES,
  TICKET_KIND_LABEL,
  TICKET_STATUS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
  type Ticket,
  isClosed,
  isTicketNumber,
  renderTemplate,
  sameCustomer,
} from "@/lib/office/tickets";
import { getTicket, listTickets } from "@/lib/office/tickets-service";
import { type OfficeUser, listUsers } from "@/lib/office/users";
import { ticketAction } from "../actions";

export const metadata: Metadata = { title: "Kundenfall · Büro" };
export const dynamic = "force-dynamic";

function Hidden({ t, aktion }: { t: Ticket; aktion: string }) {
  return (
    <>
      <input name="nummer" type="hidden" value={t.number} />
      <input name="rev" type="hidden" value={t.rev} />
      <input name="aktion" type="hidden" value={aktion} />
    </>
  );
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ nummer: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireOffice("office.service.view");
  const number = (await params).nummer;
  if (!isTicketNumber(number)) notFound();
  const sp = await searchParams;
  const msg = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 300) : "");
  const edit = can(me.role, "office.service");

  let t: Ticket | null = null;
  let all: Ticket[] = [];
  try {
    [t, all] = await Promise.all([getTicket(number), listTickets()]);
  } catch {
    return (
      <Notice title="Datenspeicher nicht erreichbar" tone="red">
        Der Fall konnte nicht geladen werden. Bitte später erneut versuchen.
      </Notice>
    );
  }
  if (!t) notFound();
  const ticket = t;
  let order: OfficeOrder | null = null;
  let orderError = "";
  if (ticket.order) {
    const r = await loadOfficeOrder(ticket.order.key, await productLookup());
    order = r.order;
    if (!r.order) orderError = r.error ?? "Bestellung nicht gefunden.";
  }
  let staff: OfficeUser[] = [];
  if (edit) {
    try {
      staff = (await listUsers()).filter((u) => u.active && can(u.role, "office.service"));
    } catch {
      staff = [];
    }
  }
  const history = all.filter((x) => sameCustomer(ticket, x) || (ticket.order && x.number !== ticket.number && x.order?.key === ticket.order.key));
  const closed = isClosed(ticket.status);
  const signer = me.role === "admin" ? "" : me.name;

  return (
    <>
      <PageHeader
        actions={
          <Link className={btnSecondary} href="/admin/buero/kundenservice">
            Alle Kundenfälle
          </Link>
        }
        description={`${TICKET_KIND_LABEL[ticket.kind]} · angelegt ${formatDateTime(ticket.createdAt)} von ${ticket.createdBy} · zuletzt ${formatDateTime(ticket.updatedAt)} (${ticket.updatedBy})`}
        title={`${ticket.number} · ${ticket.subject}`}
      />
      {msg("ok") ? (
        <div className="mb-6">
          <Notice title="Erledigt" tone="green">
            {msg("ok")}
          </Notice>
        </div>
      ) : null}
      {msg("fehler") ? (
        <div className="mb-6">
          <Notice title="Nicht gespeichert" tone="red">
            {msg("fehler")}
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <Card title="Fall">
            <dl className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Status</dt>
              <dd>
                <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
              </dd>
              <dt className="text-muted">Priorität</dt>
              <dd>{PRIORITY_LABEL[ticket.priority]}</dd>
              <dt className="text-muted">Zuständig</dt>
              <dd>{ticket.assignee?.label ?? "niemand"}</dd>
              <dt className="text-muted">Kunde</dt>
              <dd>
                {ticket.customer.name || "—"}
                {ticket.customer.email ? <span className="block text-muted">{ticket.customer.email}</span> : null}
                <span className="block text-[12px] text-muted">
                  {ticket.customer.kind === "konto" ? "mit Kundenkonto verknüpft" : ticket.customer.kind === "haendler" ? (ticket.customer.id ? "mit Händlerkonto verknüpft" : "Händler") : "ohne Kundenkonto"}
                  {ticket.channel ? ` · ${CHANNEL_LABEL[ticket.channel]}` : ""}
                </span>
              </dd>
              <dt className="text-muted">Bestellung</dt>
              <dd>
                {ticket.order ? (
                  <>
                    <Link className="font-medium tabular-nums underline underline-offset-4" href={officeUrl(ticket.order)}>
                      {ticket.order.number}
                    </Link>
                    {order ? <span className="text-muted"> · {formatPrice(order.gross)} · bisher erstattet {formatPrice(order.refunded)}</span> : null}
                    {orderError ? <span className="block text-[12px] text-red-700">{orderError}</span> : null}
                  </>
                ) : (
                  ticket.orderText || "—"
                )}
              </dd>
              {ticket.complaint ? (
                <>
                  <dt className="text-muted">Reklamation</dt>
                  <dd>{COMPLAINT_LABEL[ticket.complaint.type]}</dd>
                </>
              ) : null}
            </dl>
            {ticket.description ? <p className="mt-4 whitespace-pre-wrap border-line border-t pt-4 text-[14px]">{ticket.description}</p> : null}
          </Card>

          {ticket.retour ? (
            <Card title="Retoure">
              <ul className="mb-3 list-disc pl-5 text-[14px]">
                {ticket.retour.lines.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                  <li key={i}>
                    {l.quantity} × {l.title}
                  </li>
                ))}
              </ul>
              <p className="text-[14px]">
                <span className="text-muted">Grund:</span> {ticket.retour.reason}
              </p>
              <p className="text-[14px]">
                <span className="text-muted">Rücksendung:</span> {RETURN_STATUS_LABEL[ticket.retour.status]} · <span className="text-muted">Entscheidung:</span> {DECISION_LABEL[ticket.retour.decision]}
              </p>
              {ticket.retour.info ? <p className="mt-1 whitespace-pre-wrap text-[14px] text-muted">{ticket.retour.info}</p> : null}
              {edit && !closed ? (
                <form action={ticketAction} className="mt-4 grid gap-3 border-line border-t pt-4 sm:grid-cols-2">
                  <Hidden aktion="retoure" t={ticket} />
                  <label>
                    <span className={label}>Bearbeitungsstatus</span>
                    <select className={input} defaultValue={ticket.retour.status} name="returnStatus">
                      {RETURN_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {RETURN_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={label}>Büroentscheidung</span>
                    <select className={input} defaultValue={ticket.retour.decision} name="decision">
                      {DECISIONS.map((s) => (
                        <option key={s} value={s}>
                          {DECISION_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    <span className={label}>Rücksendungsinformationen</span>
                    <textarea className={input} defaultValue={ticket.retour.info} maxLength={1000} name="returnInfo" />
                  </label>
                  <div>
                    <button className={btn} type="submit">
                      Retoure speichern
                    </button>
                  </div>
                  <p className="text-[12px] text-muted sm:col-span-2">Keine Lagerbuchung, keine Bestandskorrektur.</p>
                </form>
              ) : null}
            </Card>
          ) : null}

          {ticket.refund ? (
            <Card title="Rückerstattungsanfrage">
              <p className="text-[14px]">
                Angefragt: <b className="font-medium">{formatPrice(ticket.refund.requested)}</b> · bei Anlage bereits erstattet {formatPrice(ticket.refund.refundedAtCreation)}
                {order ? ` · heute laut Stripe/Bestellung erstattet ${formatPrice(order.refunded)}` : ""}
              </p>
              <p className="text-[14px]">
                <span className="text-muted">Grund:</span> {ticket.refund.reason}
              </p>
              <p className="text-[14px]">
                <span className="text-muted">Status:</span> {REFUND_STATUS_LABEL[ticket.refund.status]}
              </p>
              {edit && !closed ? (
                <form action={ticketAction} className="mt-4 flex flex-wrap items-end gap-3 border-line border-t pt-4">
                  <Hidden aktion="erstattung" t={ticket} />
                  <label>
                    <span className={label}>Erstattungsstatus</span>
                    <select className={input} defaultValue={ticket.refund.status} name="refundStatus">
                      {REFUND_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {REFUND_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={btn} type="submit">
                    Speichern
                  </button>
                </form>
              ) : null}
              <p className="mt-2 text-[12px] text-muted">Hier wird keine Stripe-Rückerstattung ausgelöst. Die Erstattung selbst erfolgt manuell im Stripe-Dashboard bzw. per Überweisung.</p>
            </Card>
          ) : null}

          <Card title={`Interne Notizen (${ticket.notes.length})`}>
            {ticket.notes.length ? (
              <ul className="mb-4 divide-y divide-line text-[14px]">
                {[...ticket.notes].reverse().map((n, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Notizen ändern sich nicht
                  <li className="py-2" key={i}>
                    <span className="text-[12px] text-muted">
                      {formatDateTime(n.at)} · {n.by}
                    </span>
                    <p className="whitespace-pre-wrap">{n.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-[14px] text-muted">Noch keine Notizen.</p>
            )}
            {edit ? (
              <form action={ticketAction} className="grid gap-2">
                <Hidden aktion="notiz" t={ticket} />
                <textarea className={`${input} min-h-20`} maxLength={2000} name="text" placeholder="Interne Notiz (nur fürs Büro sichtbar)" required />
                <div>
                  <button className={btnSecondary} type="submit">
                    Notiz speichern
                  </button>
                </div>
              </form>
            ) : null}
          </Card>

          <Card title="Antwortvorlagen (nur zum Kopieren)">
            <p className="mb-3 text-[12px] text-muted">Es wird nichts automatisch verschickt. Text kopieren, im E-Mail-Programm anpassen und selbst senden.</p>
            <div className="grid gap-3">
              {TEMPLATES.map((tp) => {
                const r = renderTemplate(tp.key, ticket, signer);
                return (
                  <details className="rounded-2xl border border-line p-3" key={tp.key}>
                    <summary className="cursor-pointer font-medium text-[14px]">{tp.label}</summary>
                    <p className="mt-2 text-[13px]">
                      <span className="text-muted">Betreff:</span> {r.subject}
                    </p>
                    <textarea className={`${input} mt-2 min-h-40 font-mono text-[13px]`} readOnly value={r.text} />
                  </details>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {edit ? (
            <Card title="Bearbeiten">
              {closed ? (
                <form action={ticketAction} className="grid gap-2">
                  <Hidden aktion="wiedereroeffnen" t={ticket} />
                  <label>
                    <span className={label}>Grund für die Wiedereröffnung</span>
                    <input className={input} maxLength={300} name="reason" required />
                  </label>
                  <div>
                    <button className={btn} type="submit">
                      Fall erneut öffnen
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-5">
                  <form action={ticketAction} className="grid gap-2">
                    <Hidden aktion="status" t={ticket} />
                    <span className={label}>Status</span>
                    <div className="flex gap-2">
                      <select className={input} defaultValue={ticket.status} name="status">
                        {TICKET_STATUS.filter((s) => s !== "geschlossen").map((s) => (
                          <option key={s} value={s}>
                            {TICKET_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button className={btnSecondary} type="submit">
                        Ändern
                      </button>
                    </div>
                  </form>
                  <form action={ticketAction} className="grid gap-2">
                    <Hidden aktion="prioritaet" t={ticket} />
                    <span className={label}>Priorität</span>
                    <div className="flex gap-2">
                      <select className={input} defaultValue={ticket.priority} name="priority">
                        {PRIORITIES.map((s) => (
                          <option key={s} value={s}>
                            {PRIORITY_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button className={btnSecondary} type="submit">
                        Ändern
                      </button>
                    </div>
                  </form>
                  <form action={ticketAction} className="grid gap-2">
                    <Hidden aktion="zuweisen" t={ticket} />
                    <span className={label}>Zuständig</span>
                    <div className="flex gap-2">
                      <select className={input} defaultValue={ticket.assignee?.id ?? ""} name="assignee">
                        <option value="">niemand</option>
                        <option value="admin">Administrator</option>
                        {staff.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button className={btnSecondary} type="submit">
                        Zuweisen
                      </button>
                    </div>
                  </form>
                  {ticket.complaint ? (
                    <form action={ticketAction} className="grid gap-2">
                      <Hidden aktion="reklamation" t={ticket} />
                      <span className={label}>Reklamationsart</span>
                      <div className="flex gap-2">
                        <select className={input} defaultValue={ticket.complaint.type} name="complaintType">
                          {COMPLAINT_TYPES.map((s) => (
                            <option key={s} value={s}>
                              {COMPLAINT_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <button className={btnSecondary} type="submit">
                          Ändern
                        </button>
                      </div>
                    </form>
                  ) : null}
                  <form action={ticketAction} className="grid gap-2 border-line border-t pt-4">
                    <Hidden aktion="schliessen" t={ticket} />
                    <label>
                      <span className={label}>Abschluss (optional)</span>
                      <input className={input} maxLength={300} name="resolution" placeholder="z. B. Ersatz verschickt" />
                    </label>
                    <div>
                      <button className={btn} type="submit">
                        Fall schließen
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </Card>
          ) : (
            <Notice title="Nur ansehen" tone="blue">
              Dein Zugang darf Kundenfälle ansehen, aber nicht bearbeiten.
            </Notice>
          )}

          <Card title={`Kundenhistorie (${history.length})`}>
            {history.length ? (
              <ul className="divide-y divide-line text-[14px]">
                {history.map((h) => (
                  <li className="py-2" key={h.number}>
                    <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={`/admin/buero/kundenservice/${h.number}`}>
                      {h.number}
                    </Link>{" "}
                    <Badge tone={TICKET_STATUS_TONE[h.status]}>{TICKET_STATUS_LABEL[h.status]}</Badge>
                    <span className="block text-[12px] text-muted">
                      {TICKET_KIND_LABEL[h.kind]} · {h.subject}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">Keine weiteren Fälle dieses Kunden oder dieser Bestellung.</p>
            )}
          </Card>

          <Card title="Verlauf">
            <ul className="space-y-2 text-[13px]">
              {[...ticket.events].reverse().map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Verlauf ändert sich nicht
                <li key={i}>
                  <span className="text-muted">{formatDateTime(e.at)}</span> · {e.by}: <b className="font-medium">{e.action}</b>
                  {e.detail ? ` – ${e.detail}` : ""}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
