import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice, PageHeader, btn, btnDanger, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import {
  type AutomationConfig,
  DEFAULT_CONFIG,
  FREQUENCIES,
  FREQUENCY_LABEL,
  NOTIFY_KINDS,
  NOTIFY_LABEL,
  REMINDER_KINDS,
  REMINDER_LABEL,
  REPORT_TYPES,
  REPORT_TYPE_LABEL,
  type ReportSchedule,
  nextOccurrence,
} from "@/lib/office/automation";
import { type AutomationState, getConfig, getState, reportEmailsEnabled } from "@/lib/office/automation-service";
import { type SearchParams, paramsOf } from "../../shared";
import { deleteScheduleAction, saveNotifyAction, saveScheduleAction } from "./actions";

export const metadata: Metadata = { title: "Automatische Berichte · Büro" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const CHANNEL_OPTS = [
  { key: "alle", label: "Alle Bestellungen" },
  { key: "privat", label: "Nur Privatkunden" },
  { key: "haendler", label: "Nur Händler" },
];

function ScheduleForm({ s }: { s?: ReportSchedule }) {
  return (
    <form action={saveScheduleAction} className="grid gap-4">
      {s ? <input name="id" type="hidden" value={s.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className={label}>Name</span>
          <input className={input} defaultValue={s?.name ?? ""} maxLength={60} name="name" placeholder="z. B. Tagesbericht Büro" required />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Berichtsart</span>
          <select className={input} defaultValue={s?.type ?? "tagesbericht"} name="type">
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Häufigkeit</span>
          <select className={input} defaultValue={s?.frequency ?? "taeglich"} name="frequency">
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Uhrzeit (deutsche Zeit)</span>
          <input className={input} defaultValue={s?.time ?? "05:00"} name="time" pattern="[0-2][0-9]:[0-5][0-9]" required type="time" />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Wochentag (nur wöchentlich)</span>
          <select className={input} defaultValue={String(s?.weekday ?? 1)} name="weekday">
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i + 1}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Tag im Monat (nur monatlich, 1–28)</span>
          <input className={input} defaultValue={s?.monthDay ?? 1} max={28} min={1} name="monthDay" type="number" />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Zeitraum</span>
          <select className={input} defaultValue={s?.scope ?? "abgeschlossen"} name="scope">
            <option value="abgeschlossen">Abgeschlossen (Vortag / Vorwoche / Vormonat)</option>
            <option value="laufend">Laufend (bis zur Uhrzeit)</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Filter</span>
          <select className={input} defaultValue={s?.channel ?? "alle"} name="channel">
            {CHANNEL_OPTS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 sm:col-span-2">
          <span className={label}>Empfänger (E-Mail, mit Komma getrennt, höchstens 5)</span>
          <input className={input} defaultValue={s?.recipients.join(", ") ?? ""} name="recipients" placeholder="buero@exstase.com" />
          <span className="text-[12px] text-muted">Wird nur genutzt, wenn der E-Mail-Versand freigegeben ist. Berichte enthalten keine Kundennamen oder Adressen.</span>
        </label>
      </div>
      <label className="flex items-center gap-2 text-[14px]">
        <input defaultChecked={s?.active ?? false} name="active" type="checkbox" value="1" />
        Aktiv (standardmäßig aus)
      </label>
      <div>
        <button className={btn} type="submit">
          {s ? "Speichern" : "Bericht anlegen"}
        </button>
      </div>
    </form>
  );
}

export default async function AutomationSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOffice("office.automation");
  const p = await paramsOf(searchParams);
  const now = Date.now();
  let cfg: AutomationConfig = DEFAULT_CONFIG;
  let state: AutomationState | null = null;
  let loadError = false;
  try {
    [cfg, state] = await Promise.all([getConfig(), getState()]);
  } catch {
    loadError = true;
  }
  const mails = reportEmailsEnabled();
  return (
    <>
      <PageHeader
        actions={
          <Link className={btnSecondary} href="/admin/buero/berichte">
            Berichtshistorie
          </Link>
        }
        description="Interne Berichte, Benachrichtigungen und Erinnerungen fürs Büro. Alle Zeiten in deutscher Zeit (Europe/Berlin). Es wird nie automatisch an die Logistik oder an Kund:innen geschickt."
        title="Automatische Berichte"
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
          <Notice title="Nicht gespeichert" tone="red">
            {p.fehler}
          </Notice>
        </div>
      ) : null}
      {loadError ? (
        <Notice title="Datenspeicher nicht erreichbar" tone="red">
          Die Einstellungen konnten nicht geladen werden. Bitte später erneut versuchen.
        </Notice>
      ) : (
        <>
          <Card className="mb-6" title="Status">
            <ul className="space-y-1.5 text-[14px]">
              <li>
                Letzter automatischer Lauf: {state ? `${formatDateTime(state.lastRunAt)} · ${state.ran} erstellt, ${state.failed} fehlgeschlagen` : "noch keiner"}
                {state?.lastError ? <span className="text-red-700"> · {state.lastError}</span> : null}
              </li>
              <li>
                E-Mail-Versand: {mails ? <Badge tone="green">freigegeben</Badge> : <Badge tone="neutral">aus</Badge>}{" "}
                <span className="text-muted">{mails ? "" : "Berichte werden nur hier im Büro abgelegt. Für E-Mails muss Orhan die Vercel-Variable OFFICE_REPORT_EMAILS=1 setzen."}</span>
              </li>
              <li className="text-muted">
                Auslöser ist der tägliche Vercel-Cron (/api/cron/office, 04:00 UTC = 05:00 bzw. 06:00 Uhr deutscher Zeit). Berichte, deren Uhrzeit davor liegt,
                entstehen beim nächsten Lauf. Für stündliche Läufe ist ein Vercel-Pro-Tarif nötig.
              </li>
            </ul>
          </Card>

          <Card className="mb-6" title={`Berichte (${cfg.schedules.length})`}>
            {cfg.schedules.length ? (
              <div className="space-y-4">
                {cfg.schedules.map((s) => {
                  const next = nextOccurrence(s, now);
                  return (
                    <details className="rounded-2xl border border-line p-4" key={s.id}>
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[14px]">
                        <b className="font-medium">{s.name}</b>
                        {s.active ? <Badge tone="green">aktiv</Badge> : <Badge tone="neutral">inaktiv</Badge>}
                        <span className="text-muted">
                          {FREQUENCY_LABEL[s.frequency]} · {s.time} Uhr{s.frequency === "woechentlich" ? ` · ${WEEKDAYS[s.weekday - 1]}` : ""}
                          {s.frequency === "monatlich" ? ` · am ${s.monthDay}.` : ""} · {REPORT_TYPE_LABEL[s.type]}
                          {s.active && Number.isFinite(next) ? ` · nächster Termin ${formatDateTime(next)}` : ""}
                        </span>
                      </summary>
                      <div className="mt-4">
                        <ScheduleForm s={s} />
                        <form action={deleteScheduleAction} className="mt-4 flex flex-wrap items-center gap-3 border-line border-t pt-4">
                          <input name="id" type="hidden" value={s.id} />
                          <label className="flex items-center gap-2 text-[13px]">
                            <input name="confirm" required type="checkbox" value="ja" /> Löschen bestätigen
                          </label>
                          <button className={btnDanger} type="submit">
                            Bericht löschen
                          </button>
                        </form>
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <p className="text-[14px] text-muted">Noch keine automatischen Berichte angelegt.</p>
            )}
          </Card>

          <Card className="mb-6" title="Neuer Bericht">
            <ScheduleForm />
          </Card>

          <Card className="mb-6" title="Benachrichtigungen und Erinnerungen">
            <form action={saveNotifyAction} className="grid gap-6">
              <div>
                <p className="mb-2 font-medium text-[14px]">Benachrichtigungen in der Büro-Übersicht</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {NOTIFY_KINDS.map((k) => (
                    <label className="flex items-center gap-2 text-[14px]" key={k}>
                      <input defaultChecked={cfg.notify[k]} name={`n_${k}`} type="checkbox" value="1" /> {NOTIFY_LABEL[k]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-medium text-[14px]">Erinnerungen</p>
                <div className="grid gap-3">
                  {REMINDER_KINDS.map((k) => (
                    <div className="flex flex-wrap items-center gap-3 text-[14px]" key={k}>
                      <label className="flex min-w-[320px] items-center gap-2">
                        <input defaultChecked={cfg.reminders[k].enabled} name={`r_${k}`} type="checkbox" value="1" /> {REMINDER_LABEL[k]}
                      </label>
                      {k === "lieferdaten" || k === "export" ? (
                        <input name={`h_${k}`} type="hidden" value={cfg.reminders[k].hours} />
                      ) : (
                        <label className="flex items-center gap-2">
                          nach
                          <input className={`${input} w-24`} defaultValue={cfg.reminders[k].hours} max={1440} min={0} name={`h_${k}`} type="number" />
                          Stunden
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-[14px]">
                  <input defaultChecked={cfg.digest} name="digest" type="checkbox" value="1" /> Tägliche Zusammenfassung erstellen (jeder Hinweis nur einmal)
                </label>
                <label className="grid max-w-xl gap-1.5">
                  <span className={label}>Empfänger der Zusammenfassung (nur mit freigegebenem E-Mail-Versand)</span>
                  <input className={input} defaultValue={cfg.digestRecipients.join(", ")} name="digestRecipients" placeholder="buero@exstase.com" />
                </label>
                <p className="text-[12px] text-muted">Benachrichtigungen nennen nur Bestellnummer, Kanal und Grund – nie Kundennamen oder Adressen.</p>
              </div>
              <div>
                <button className={btn} type="submit">
                  Speichern
                </button>
              </div>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
