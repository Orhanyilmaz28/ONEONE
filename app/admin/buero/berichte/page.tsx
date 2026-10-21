import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { formatPrice } from "@/lib/format";
import { requireOffice } from "@/lib/admin-auth";
import { FREQUENCY_LABEL, REPORT_DOC, REPORT_TYPE_LABEL, type ReportSchedule } from "@/lib/office/automation";
import { type ReportEntry, getConfig, listReports } from "@/lib/office/automation-service";
import { can } from "@/lib/office/roles";
import { berlinDayKey } from "@/lib/office/time";
import { type SearchParams, paramsOf } from "../shared";
import { runReportAction } from "./actions";

export const metadata: Metadata = { title: "Berichtshistorie · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STATUS: Record<ReportEntry["status"], { tone: "green" | "red" | "amber"; label: string }> = {
  ok: { tone: "green", label: "erstellt" },
  fehler: { tone: "red", label: "fehlgeschlagen" },
  unvollstaendig: { tone: "amber", label: "unvollständig" },
};
const MAIL: Record<ReportEntry["mail"], string> = { aus: "keine E-Mail", keine_empfaenger: "keine Empfänger", versendet: "E-Mail versendet", fehler: "E-Mail fehlgeschlagen" };

/** „PDF ansehen“: Dokument über den geschützten Endpunkt neu erzeugen (aktueller Datenstand, ganze Kalendertage) */
function PdfButton({ e }: { e: ReportEntry }) {
  if (e.kind !== "bericht" || e.type === "zusammenfassung") return null;
  const from = berlinDayKey(e.range.from);
  const to = berlinDayKey(Math.max(e.range.from, e.range.to - 1));
  return (
    <form action="/api/admin/buero/dokument" method="post" target="_blank">
      <input name="art" type="hidden" value={REPORT_DOC[e.type]} />
      <input name="modus" type="hidden" value="druck" />
      <input name="zurueck" type="hidden" value="/admin/buero/berichte" />
      <input name="zeitraum" type="hidden" value="zeitraum" />
      <input name="von" type="hidden" value={from} />
      <input name="bis" type="hidden" value={to} />
      {e.channel !== "alle" ? <input name="typ" type="hidden" value={e.channel} /> : null}
      <button className={btnSecondary} type="submit">
        PDF ansehen
      </button>
    </form>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const p = await paramsOf(searchParams);
  const run = can(me.role, "office.reports");
  const docs = can(me.role, "office.documents");
  let entries: ReportEntry[] = [];
  let schedules: ReportSchedule[] = [];
  let loadError = false;
  try {
    [entries, schedules] = await Promise.all([listReports(), getConfig().then((c) => c.schedules)]);
  } catch {
    loadError = true;
  }
  return (
    <>
      <PageHeader
        actions={
          can(me.role, "office.automation") ? (
            <Link className={btnSecondary} href="/admin/buero/einstellungen/berichte">
              Automatische Berichte einstellen
            </Link>
          ) : null
        }
        description="Alle automatisch oder manuell erstellten Berichte der letzten 12 Monate. Gespeichert werden nur Kennzahlen und Zeitraum – das PDF entsteht beim Öffnen neu aus den aktuellen Daten."
        title="Berichtshistorie"
      />
      {p.ok ? (
        <div className="mb-6">
          <Notice title="Erledigt" tone="green">
            {p.ok}
          </Notice>
        </div>
      ) : null}
      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Nicht erstellt" tone="red">
            {p.fehler}
          </Notice>
        </div>
      ) : null}
      {loadError ? (
        <Notice title="Datenspeicher nicht erreichbar" tone="red">
          Die Berichtshistorie konnte nicht geladen werden. Es wird keine leere Liste angezeigt, damit nichts übersehen wird.
        </Notice>
      ) : (
        <>
          {run && schedules.length ? (
            <Card className="mb-6" title="Jetzt erstellen">
              <div className="flex flex-wrap gap-2">
                {schedules.map((s) => (
                  <form action={runReportAction} key={s.id}>
                    <input name="bericht" type="hidden" value={s.id} />
                    <button className={btnSecondary} type="submit">
                      {s.name} ({FREQUENCY_LABEL[s.frequency]})
                    </button>
                  </form>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">Manuell erstellte Berichte werden nicht per E-Mail verschickt.</p>
            </Card>
          ) : null}
          {entries.length ? (
            <Card padded={false} title={`${entries.length} Einträge`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[14px]">
                  <thead>
                    <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
                      <th className="px-6 py-2.5 font-medium">Bericht</th>
                      <th className="py-2.5 pr-4 font-medium">Zeitraum</th>
                      <th className="py-2.5 pr-4 font-medium">Erstellt</th>
                      <th className="py-2.5 pr-4 font-medium">Auslöser</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 pr-4 font-medium">Ergebnis</th>
                      <th className="py-2.5 pr-6 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {entries.map((e) => (
                      <tr className="align-top" key={e.id}>
                        <td className="px-6 py-2.5">
                          <span className="block font-medium">{e.name}</span>
                          <span className="text-[12px] text-muted">{e.type === "zusammenfassung" ? "Benachrichtigungen & Erinnerungen" : REPORT_TYPE_LABEL[e.type]}</span>
                        </td>
                        <td className="py-2.5 pr-4">{e.range.label}</td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">{formatDateTime(e.at)}</td>
                        <td className="py-2.5 pr-4">{e.trigger === "zeitplan" ? "Zeitplan" : `Manuell · ${e.by}`}</td>
                        <td className="py-2.5 pr-4">
                          <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                          {e.error ? <span className="mt-1 block max-w-[260px] text-[12px] text-red-700">{e.error}</span> : null}
                        </td>
                        <td className="py-2.5 pr-4 text-[13px]">
                          {e.summary ? (
                            <>
                              {e.summary.orders} Bestellungen · {formatPrice(e.summary.gross)}
                              <span className="block text-[12px] text-muted">
                                {e.summary.shipped} versendet · {e.summary.released} freigegeben · Pfand {formatPrice(e.summary.deposit)}
                              </span>
                            </>
                          ) : e.items !== undefined ? (
                            `${e.items} neue Hinweise`
                          ) : (
                            "—"
                          )}
                          <span className="block text-[12px] text-muted">{MAIL[e.mail]}</span>
                        </td>
                        <td className="py-2.5 pr-6">
                          <div className="flex flex-wrap gap-2">
                            {docs ? <PdfButton e={e} /> : null}
                            {run && e.kind === "bericht" ? (
                              <form action={runReportAction}>
                                <input name="eintrag" type="hidden" value={e.id} />
                                <button className={btnSecondary} type="submit">
                                  Erneut erstellen
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState title="Noch keine Berichte">Sobald ein automatischer Bericht läuft oder jemand einen Bericht erstellt, erscheint er hier.</EmptyState>
          )}
        </>
      )}
    </>
  );
}
