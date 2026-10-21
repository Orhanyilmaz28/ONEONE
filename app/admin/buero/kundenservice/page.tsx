import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice, PageHeader, btn, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { CHANNEL_LABEL } from "@/lib/office/model";
import { can } from "@/lib/office/roles";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  SECTIONS,
  type SectionKey,
  TICKET_KIND_LABEL,
  TICKET_STATUS,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
  type Ticket,
  matchesTicket,
  sectionCounts,
  sortTickets,
} from "@/lib/office/tickets";
import { listTickets } from "@/lib/office/tickets-service";
import { type SearchParams, paramsOf } from "../shared";

export const metadata: Metadata = { title: "Kundenservice · Büro" };
export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function ServicePage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice("office.service.view");
  const p = await paramsOf(searchParams);
  const edit = can(me.role, "office.service");
  const section = (SECTIONS.find((s) => s.key === p.bereich)?.key ?? "alle") as SectionKey;
  const myId = me.userId ?? "admin";
  const filter = { section, q: (p.q ?? "").slice(0, 80), status: p.status ?? "", priority: p.prioritaet ?? "", mine: p.meine === "1" ? myId : "", channel: p.typ === "privat" || p.typ === "haendler" ? p.typ : "" };
  let all: Ticket[] = [];
  let loadError = false;
  try {
    all = await listTickets();
  } catch {
    loadError = true;
  }
  const counts = sectionCounts(all);
  const list = sortTickets(all.filter((t) => matchesTicket(t, filter)));
  const page = Math.max(1, Number(p.seite) || 1);
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const link = (extra: Record<string, string>) => `/admin/buero/kundenservice?${new URLSearchParams(Object.fromEntries(Object.entries({ bereich: section, q: filter.q, status: filter.status, prioritaet: filter.priority, meine: p.meine ?? "", typ: filter.channel, ...extra }).filter(([, v]) => v))).toString()}`;

  return (
    <>
      <PageHeader
        actions={
          edit ? (
            <Link className={btn} href="/admin/buero/kundenservice/neu">
              Neuer Fall
            </Link>
          ) : null
        }
        description="Kundenfälle, Reklamationen, Retouren, Stornierungs- und Rückerstattungsanfragen. Keine automatischen Kundennachrichten, keine Stripe-Erstattungen, keine Lagerbuchungen."
        title="Kundenservice"
      />
      {loadError ? (
        <Notice title="Datenspeicher nicht erreichbar" tone="red">
          Die Kundenfälle konnten nicht geladen werden. Es wird keine leere Liste angezeigt, damit nichts übersehen wird.
        </Notice>
      ) : (
        <>
          <ul className="no-scrollbar mb-6 flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-card p-1">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <Link
                  aria-current={s.key === section ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-3 py-1 text-[13px] ${s.key === section ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5"}`}
                  href={`/admin/buero/kundenservice?bereich=${s.key}`}
                >
                  {s.label} ({counts[s.key]})
                </Link>
              </li>
            ))}
          </ul>

          <Card className="mb-6">
            <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" method="get">
              <input name="bereich" type="hidden" value={section} />
              <label className="lg:col-span-2">
                <span className={label}>Suche (Fallnummer, Bestellung, Name, E-Mail, Anliegen)</span>
                <input className={input} defaultValue={filter.q} maxLength={80} name="q" />
              </label>
              <label>
                <span className={label}>Status</span>
                <select className={input} defaultValue={filter.status} name="status">
                  <option value="">Alle</option>
                  {TICKET_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Priorität</span>
                <select className={input} defaultValue={filter.priority} name="prioritaet">
                  <option value="">Alle</option>
                  {PRIORITIES.map((s) => (
                    <option key={s} value={s}>
                      {PRIORITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Kunde</span>
                <select className={input} defaultValue={filter.channel} name="typ">
                  <option value="">B2B und B2C</option>
                  <option value="privat">Privatkunden (B2C)</option>
                  <option value="haendler">Händler (B2B)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input defaultChecked={p.meine === "1"} name="meine" type="checkbox" value="1" /> Nur mir zugewiesen
              </label>
              <div className="flex gap-2 lg:col-span-4">
                <button className={btn} type="submit">
                  Anzeigen
                </button>
                <Link className={btnSecondary} href={`/admin/buero/kundenservice?bereich=${section}`}>
                  Zurücksetzen
                </Link>
              </div>
            </form>
          </Card>

          {shown.length ? (
            <Card padded={false} title={`${list.length} ${list.length === 1 ? "Fall" : "Fälle"}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-[14px]">
                  <thead>
                    <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
                      <th className="px-6 py-2.5 font-medium">Fall</th>
                      <th className="py-2.5 pr-4 font-medium">Anliegen</th>
                      <th className="py-2.5 pr-4 font-medium">Kunde</th>
                      <th className="py-2.5 pr-4 font-medium">Bestellung</th>
                      <th className="py-2.5 pr-4 font-medium">Priorität</th>
                      <th className="py-2.5 pr-4 font-medium">Zuständig</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 pr-6 font-medium">Letzte Bearbeitung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((t) => (
                      <tr className="align-top" key={t.number}>
                        <td className="px-6 py-2.5 whitespace-nowrap">
                          <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={`/admin/buero/kundenservice/${t.number}`}>
                            {t.number}
                          </Link>
                          <span className="block text-[12px] text-muted">{TICKET_KIND_LABEL[t.kind]}</span>
                        </td>
                        <td className="max-w-[260px] py-2.5 pr-4">{t.subject}</td>
                        <td className="py-2.5 pr-4">
                          {t.customer.name || "—"}
                          <span className="block text-[12px] text-muted">{t.channel ? CHANNEL_LABEL[t.channel] : "ohne Bestellung"}</span>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{t.order?.number ?? (t.orderText || "—")}</td>
                        <td className="py-2.5 pr-4">{t.priority === "dringend" || t.priority === "hoch" ? <Badge tone={t.priority === "dringend" ? "red" : "orange"}>{PRIORITY_LABEL[t.priority]}</Badge> : PRIORITY_LABEL[t.priority]}</td>
                        <td className="py-2.5 pr-4">{t.assignee?.label ?? <span className="text-muted">niemand</span>}</td>
                        <td className="py-2.5 pr-4">
                          <Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                        </td>
                        <td className="py-2.5 pr-6 whitespace-nowrap">
                          {formatDateTime(t.updatedAt)}
                          <span className="block text-[12px] text-muted">angelegt {formatDateTime(t.createdAt)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.length > PAGE ? (
                <p className="flex gap-4 px-6 py-3 text-[13px]">
                  {page > 1 ? (
                    <Link className="underline underline-offset-4" href={link({ seite: String(page - 1) })}>
                      Zurück
                    </Link>
                  ) : null}
                  <span className="text-muted">
                    Seite {page} von {Math.ceil(list.length / PAGE)}
                  </span>
                  {page * PAGE < list.length ? (
                    <Link className="underline underline-offset-4" href={link({ seite: String(page + 1) })}>
                      Weiter
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </Card>
          ) : (
            <Card>
              <p className="text-[14px] text-muted">{all.length ? "Keine Fälle für diese Auswahl." : "Noch keine Kundenfälle angelegt."}</p>
            </Card>
          )}
        </>
      )}
    </>
  );
}
