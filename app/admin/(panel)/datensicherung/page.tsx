import type { Metadata } from "next";
import { Badge, Card, Notice, PageHeader, Stat, Table, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { twoFactorEnabled } from "@/lib/admin-security/two-factor";
import { retentionPolicy } from "@/lib/backup/retention";
import { backupOverview, defaultDeps, maxAgeHours } from "@/lib/backup/service";
import { type AlertDraft, alertEmailsEnabled, listAlerts, listIncidents } from "@/lib/monitoring/alerts";
import { INCIDENT_LABEL, type Incident, recentIncidents } from "@/lib/monitoring/signal";
import { formatBytes } from "@/lib/storage-usage";
import { RestoreTestForm, StartBackupForm, VerifyForm } from "./forms";

export const metadata: Metadata = { title: "Datensicherung" };
export const dynamic = "force-dynamic";
// Sicherung und Testwiederherstellung laufen in dieser Seite (Server Actions) – genug Zeit einplanen
export const maxDuration = 300;

const ACTION_LABEL = { backup: "Sicherung", verify: "Prüfung", restore_test: "Testwiederherstellung", retention: "Aufräumen", health: "Überwachung" } as const;
const TRIGGER_LABEL = { cron: "automatisch", manual: "von Hand", cli: "Kommandozeile" } as const;

export default async function BackupPage() {
  await requireAdmin();
  const deps = defaultDeps();
  const [o, needCode] = await Promise.all([backupOverview(deps), twoFactorEnabled().catch(() => true)]);
  const [incidents, alerts] = deps.alerts
    ? await Promise.all([listIncidents(deps.alerts).catch((): Incident[] => []), listAlerts(deps.alerts).catch((): AlertDraft[] => [])])
    : [recentIncidents(), [] as AlertDraft[]];
  const policy = retentionPolicy();
  const complete = o.backups.filter((b) => b.status === "complete");
  /** Sicherung ohne Geschäftsdaten (z. B. falsche oder leere Datenbank verbunden) */
  const isEmpty = (b: (typeof complete)[number]) => (b.meta?.businessKeys ?? b.meta?.entries ?? 0) === 0;
  const newestEmpty = complete[0] ? isEmpty(complete[0]) : false;
  const ready = o.configured.key && o.configured.storage && o.configured.source;
  const lastFailedAfterSuccess = o.state.lastFailureAt && (!o.state.lastSuccessAt || o.state.lastFailureAt > o.state.lastSuccessAt);
  const status = !ready ? (
    <Badge tone="amber">nicht eingerichtet</Badge>
  ) : lastFailedAfterSuccess ? (
    <Badge tone="red">letzte Sicherung fehlgeschlagen</Badge>
  ) : o.overdue ? (
    <Badge tone="amber">überfällig</Badge>
  ) : (
    <Badge tone="green">in Ordnung</Badge>
  );

  return (
    <>
      <PageHeader
        actions={<StartBackupForm disabled={!ready} />}
        description={`Verschlüsselte Sicherungen aller Shop-Daten außerhalb von Upstash. Tägliche Sicherungen bleiben ${policy.dailyDays} Tage, Wochensicherungen ${policy.weeklyWeeks} Wochen erhalten.`}
        title="Datensicherung"
      />

      {!ready ? (
        <div className="mb-6">
          <Notice title="Noch nicht eingerichtet">
            {!o.configured.key ? <>Es fehlt der Backup-Schlüssel (<b>BACKUP_ENCRYPTION_KEY</b>). </> : null}
            {!o.configured.storage ? <>Es fehlt der Speicher für Sicherungen (<b>BACKUP_S3_…</b>, empfohlen: Cloudflare R2). </> : null}
            {!o.configured.source ? <>Es ist kein Datenspeicher verbunden. </> : null}
            Die Anleitung steht in docs/DATENSICHERUNG.md.
          </Notice>
        </div>
      ) : null}
      {lastFailedAfterSuccess ? (
        <div className="mb-6">
          <Notice title="Die letzte Sicherung ist fehlgeschlagen" tone="red">
            {formatDateTime(o.state.lastFailureAt as string)}: {o.state.lastFailureMessage}
          </Notice>
        </div>
      ) : null}
      {newestEmpty ? (
        <div className="mb-6">
          <Notice title="Achtung: Die neueste Sicherung enthält keine Geschäftsdaten" tone="red">
            Darin sind keine Bestellungen, Produkte, Kunden-, Händler- oder Influencer-Konten und keine Einstellungen ({complete[0].meta?.entries ?? 0} Einträge insgesamt). Bitte prüfen, ob in
            Vercel die richtige Datenbank verbunden ist. Diese Sicherung taugt nicht zur Wiederherstellung des Shops.
          </Notice>
        </div>
      ) : null}
      {o.listError ? (
        <div className="mb-6">
          <Notice title="Sicherungen konnten nicht aufgelistet werden" tone="red">
            {o.listError}
          </Notice>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat hint={o.state.lastSuccessAt ? undefined : "noch keine"} label="Letzte erfolgreiche Sicherung" value={o.state.lastSuccessAt ? formatDateTime(o.state.lastSuccessAt) : "–"} />
        <Stat hint={o.overdue && ready ? `älter als ${maxAgeHours()} Stunden` : undefined} label="Status" value={status} />
        <Stat hint={o.configured.cron ? "täglich" : "automatische Sicherung noch nicht aktiviert"} label="Nächste geplante Sicherung" value={o.nextScheduled ? formatDateTime(o.nextScheduled) : "–"} />
        <Stat hint={o.storageLabel} label="Gespeicherte Sicherungen" value={`${complete.length} · ${formatBytes(o.totalBytes)}`} />
      </section>

      <Card className="mt-6" title="Verfügbare Sicherungen">
        {o.backups.length ? (
          <Table head={["Erstellt", "Art", "Einträge", "Größe", "Zustand"]}>
            {o.backups.map((b) => (
              <tr className="align-top" key={b.id}>
                <td className="py-3 pr-4">
                  <div className="whitespace-nowrap">{formatDateTime(b.createdAt)}</div>
                  {b.status === "complete" ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[13px] text-muted">Prüfen oder testweise wiederherstellen</summary>
                      <div className="mt-3 grid gap-4 rounded-2xl border border-line p-4">
                        <VerifyForm id={b.id} />
                        {o.configured.restoreTarget ? (
                          <RestoreTestForm id={b.id} needCode={needCode} />
                        ) : (
                          <p className="text-[13px] text-muted">Testwiederherstellung: Es ist noch keine Testdatenbank eingerichtet (BACKUP_RESTORE_TEST_URL/_TOKEN).</p>
                        )}
                        <p className="text-[13px] text-muted">Wiederherstellung in den Live-Shop: noch nicht freigeschaltet.</p>
                      </div>
                    </details>
                  ) : null}
                </td>
                <td className="py-3 pr-4">
                  {b.weekly ? "Woche" : "Tag"}
                  {b.meta ? <div className="text-[12px] text-muted">{TRIGGER_LABEL[b.meta.trigger]}</div> : null}
                </td>
                <td className="py-3 pr-4 tabular-nums">{b.meta ? b.meta.entries.toLocaleString("de-DE") : "–"}</td>
                <td className="py-3 pr-4 tabular-nums">{formatBytes(b.size)}</td>
                <td className="py-3 pr-4">
                  {b.status !== "complete" ? <Badge tone="red">{b.problem ?? "unvollständig"}</Badge> : isEmpty(b) ? <Badge tone="amber">keine Geschäftsdaten</Badge> : <Badge tone="green">vollständig</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-[14px] text-muted">Noch keine Sicherungen vorhanden.</p>
        )}
      </Card>

      {complete[0]?.meta?.summary.length ? (
        <Card className="mt-6" title="Inhalt der neuesten Sicherung">
          <ul className="divide-y divide-line text-[14px]">
            {complete[0].meta.summary.map((c) => (
              <li className="flex justify-between gap-3 py-2" key={c.category}>
                <span>
                  {c.category} <span className="text-muted">· {c.count.toLocaleString("de-DE")}</span>
                </span>
                <span className="tabular-nums">{formatBytes(c.bytes)}</span>
              </li>
            ))}
          </ul>
          {complete[0].meta.warnings?.length ? (
            <div className="mt-3">
              <Notice title="Hinweis zur neuesten Sicherung">{complete[0].meta.warnings.join(" ")}</Notice>
            </div>
          ) : null}
          {complete[0].meta.excluded.length ? (
            <p className="mt-3 text-[12px] text-muted">
              Bewusst nicht gesichert: {complete[0].meta.excluded.map((e) => `${e.category} (${e.count})`).join(", ")}.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-6" title="Protokoll">
        {o.log.length ? (
          <ul className="divide-y divide-line text-[14px]">
            {o.log.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Protokoll ohne eigene ID
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2" key={i}>
                <span>
                  {l.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">Fehler</Badge>} <b className="font-medium">{ACTION_LABEL[l.action]}</b> <span className="text-ink/80">{l.message}</span>
                </span>
                <span className="text-[12px] text-muted">{formatDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Noch keine Einträge.</p>
        )}
      </Card>

      <Card className="mt-6" title="Störungen der Datenbank">
        {incidents.length ? (
          <ul className="divide-y divide-line text-[14px]">
            {incidents.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Meldungen ohne eigene ID
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2" key={i}>
                <span>
                  <b className="font-medium">{INCIDENT_LABEL[e.type] ?? e.type}</b> {e.detail ? <span className="text-muted">{e.detail}</span> : null}
                </span>
                <span className="text-[12px] text-muted">{formatDateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">Keine Störungen erfasst.</p>
        )}
        <p className="mt-3 text-[12px] text-muted">
          Benachrichtigung per E-Mail: {alertEmailsEnabled() ? "eingeschaltet" : "noch nicht freigeschaltet – Warnungen werden nur hier angezeigt"}.
          {alerts.length ? ` Letzte Warnung: ${alerts[0].subject} (${formatDateTime(alerts[0].at)}).` : ""}
        </p>
      </Card>
    </>
  );
}
