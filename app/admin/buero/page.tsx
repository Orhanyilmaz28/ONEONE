import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice, PageHeader, Stat, formatDateTime } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { computeKpis, overviewStart, standardRanges } from "@/lib/office/kpis";
import { can } from "@/lib/office/roles";
import { officeUrl } from "@/lib/office/model";
import { loadOfficeOrders } from "@/lib/office/source";
import { ATTENTION_LABEL, attention } from "@/lib/office/workflow";
import { type AutomationConfig, type Notice as OfficeNotice, NOTIFY_LABEL, REMINDER_LABEL, notifications, reminders } from "@/lib/office/automation";
import { getConfig } from "@/lib/office/automation-service";
import { type SearchParams, paramsOf } from "./shared";

export const metadata: Metadata = { title: "Büroverwaltung" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PERIODS = [
  { key: "heute", label: "Heute" },
  { key: "woche", label: "Diese Woche" },
  { key: "monat", label: "Dieser Monat" },
  { key: "jahr", label: "Dieses Jahr" },
] as const;

function Chevron() {
  return (
    <svg aria-hidden className="size-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default async function OfficeOverview({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const p = await paramsOf(searchParams);
  const now = Date.now();
  const ranges = standardRanges(now);
  const periodKey = PERIODS.find((x) => x.key === p.zeitraum)?.key ?? "monat";
  const period = { heute: ranges.day, woche: ranges.week, monat: ranges.month, jahr: ranges.year }[periodKey];

  const products = await productLookup();
  const loaded = await loadOfficeOrders(overviewStart(now), ranges.year.to, products);
  const k = computeKpis(loaded.orders, period, now);
  // Benachrichtigungen (letzte 7 Tage) und Erinnerungen – nur Bestellnummer und Grund, keine Kundendaten
  let auto: AutomationConfig | null = null;
  try {
    auto = await getConfig();
  } catch {
    auto = null;
  }
  const hints: OfficeNotice[] = auto ? [...reminders(loaded.orders, auto, now), ...notifications(loaded.orders, auto, now - 7 * 86_400_000, products)] : [];
  const hintLabel = (h: OfficeNotice) => (h.reminder ? REMINDER_LABEL[h.kind as keyof typeof REMINDER_LABEL] : NOTIFY_LABEL[h.kind as keyof typeof NOTIFY_LABEL]);
  const hintRow = (h: OfficeNotice) => (
    <li className="flex flex-wrap items-baseline gap-2 py-2" key={`${h.reminder ? "r" : "n"}:${h.id}`}>
      <Badge tone={h.reminder ? "amber" : "blue"}>{hintLabel(h)}</Badge>
      {h.orderKey ? (
        <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl({ key: h.orderKey })}>
          {h.order}
        </Link>
      ) : null}
      <span className="text-muted">{h.text}</span>
    </li>
  );
  const link = (extra: Record<string, string>) => `/admin/buero/bestellungen?${new URLSearchParams({ zeitraum: periodKey, ...extra }).toString()}`;

  const counts: { label: string; value: number | null; href?: string; hint?: string }[] = [
    { label: "Offen", value: k.counts.open, href: link({ status: "offen" }) },
    { label: "Bezahlt", value: k.counts.paid, href: link({ zahlung: "bezahlt" }) },
    { label: "Unbezahlt", value: k.counts.unpaid, href: link({ zahlung: "unbezahlt" }) },
    { label: "Händlerbestellungen", value: k.counts.dealer, href: link({ typ: "haendler" }) },
    { label: "Privatbestellungen", value: k.counts.private, href: link({ typ: "privat" }) },
    { label: "In Bearbeitung", value: k.counts.inProgress, href: link({ status: "in_bearbeitung" }) },
    { label: "Für Versand freigegeben", value: k.counts.released, href: link({ status: "freigegeben" }) },
    { label: "Versendet", value: k.counts.shipped, href: link({ status: "versendet" }) },
    { label: "Storniert", value: k.counts.cancelled, href: link({ status: "storniert" }) },
    { label: "Exportiert", value: k.counts.exported, href: link({ exportiert: "ja" }) },
  ];

  // Aufmerksamkeit: Kachel und Liste zählen dieselben Bestellungen (gewählter Zeitraum); ältere werden extra verlinkt
  const needsAll = loaded.orders.map((o) => ({ o, reasons: attention(o, o.office, products) })).filter((x) => x.reasons.length);
  const needs = needsAll.filter(({ o }) => o.createdAt >= period.from && o.createdAt < period.to);
  // nur dieses Kalenderjahr zählen – genau das zeigt der Link (zeitraum=jahr)
  const inYear = (o: { createdAt: number }) => o.createdAt >= ranges.year.from && o.createdAt < ranges.year.to;
  const needsOlder = needsAll.filter(({ o }) => inYear(o) && !(o.createdAt >= period.from && o.createdAt < period.to)).length;
  const problemsInPeriod = needs.length;
  const office: { label: string; value: number; href: string; main?: boolean }[] = [
    { main: true, label: "Neu eingegangen", value: k.office.neu, href: link({ buero: "neu" }) },
    { main: true, label: "In Prüfung", value: k.office.pruefung, href: link({ buero: "pruefung" }) },
    { main: true, label: "Zurückgestellt", value: k.office.zurueckgestellt, href: link({ buero: "zurueckgestellt" }) },
    { main: true, label: "Freigegeben", value: k.office.freigegeben + k.office.logistik, href: link({ status: "freigegeben" }) },
    { label: "Noch nicht weitergegeben", value: k.office.freigegeben, href: link({ buero: "freigegeben" }) },
    { label: "An Logistik weitergegeben", value: k.office.logistik, href: link({ buero: "logistik" }) },
    { label: "Versand noch nicht bestätigt", value: k.office.freigegeben + k.office.logistik, href: link({ status: "freigegeben" }) },
    { label: "Versendet", value: k.office.versendet, href: link({ buero: "versendet" }) },
    { label: "Abgeschlossen", value: k.office.abgeschlossen, href: link({ buero: "abgeschlossen" }) },
    { main: true, label: "Probleme", value: problemsInPeriod, href: link({ aufmerksamkeit: "1" }) },
  ];

  return (
    <>
      <PageHeader
        actions={loaded.source === "demo" ? <Badge tone="amber">Beispieldaten</Badge> : null}
        description="Alle Privat- und Händlerbestellungen auf einen Blick. Alle Zahlen kommen direkt aus den gespeicherten Bestellungen."
        title="Büroverwaltung"
      />

      {p["keine-berechtigung"] ? (
        <div className="mb-6">
          <Notice title="Dafür fehlt die Berechtigung" tone="red">
            Dein Zugang darf diesen Bereich nicht öffnen. Bitte wende dich an den Administrator.
          </Notice>
        </div>
      ) : null}
      {loaded.errors.length ? (
        <div className="mb-6">
          <Notice title="Die Zahlen sind gerade unvollständig" tone="red">
            {loaded.errors.join(" ")}
          </Notice>
        </div>
      ) : null}
      {loaded.source === "none" ? (
        <div className="mb-6">
          <Notice title="Stripe ist nicht verbunden" tone="blue">
            Privatbestellungen erscheinen, sobald der Stripe-Schlüssel eingetragen ist. Händlerbestellungen werden trotzdem gezählt.
          </Notice>
        </div>
      ) : null}

      {k.cancelledNotRefunded ? (
        <div className="mb-6">
          <Notice title={`${k.cancelledNotRefunded} stornierte ${k.cancelledNotRefunded === 1 ? "Bestellung ist" : "Bestellungen sind"} bezahlt, aber nicht (vollständig) erstattet`}>
            Bitte im Stripe-Dashboard prüfen, ob eine Erstattung fällig ist.{" "}
            <Link className="underline underline-offset-4" href={link({ status: "storniert", zahlung: "bezahlt" })}>
              Anzeigen
            </Link>
          </Notice>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-[15px]">
          Bürostatus · <span className="text-muted">{period.label}</span>
        </h2>
        <ul className="flex gap-1 rounded-full border border-line bg-card p-1">
          {PERIODS.map((x) => (
            <li key={x.key}>
              <Link
                aria-current={x.key === periodKey ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1 text-[13px] ${x.key === periodKey ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5"}`}
                href={`/admin/buero?zeitraum=${x.key}`}
                scroll={false}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {office
          .filter((c) => c.main)
          .map((c) => (
          <Link className="rounded-3xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10" href={c.href} key={c.label}>
            <Stat label={c.label} value={c.value} />
          </Link>
          ))}
      </div>
      <Card className="mb-8" title={`Bestellungen, die Aufmerksamkeit benötigen (${needs.length}) · ${period.label}`}>
        {needs.length === 0 ? (
          <p className="text-[14px] text-muted">Im gewählten Zeitraum nichts – alle Bestellungen sind in Ordnung.</p>
        ) : (
          <ul className="divide-y divide-line text-[14px]">
            {needs.slice(0, 20).map(({ o, reasons }) => (
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2" key={o.key}>
                <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl(o)}>
                  {o.number}
                </Link>
                <span className="flex flex-wrap gap-1.5">
                  {reasons.map((r) => (
                    <Badge key={r.kind} tone={r.kind === "geaendert" || r.kind === "abgleich" ? "red" : "amber"}>
                      {ATTENTION_LABEL[r.kind]}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {needs.length > 20 || needsOlder > 0 ? (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {needs.length > 20 ? (
              <Link className="underline underline-offset-4" href={link({ aufmerksamkeit: "1" })}>
                Alle {needs.length} anzeigen
              </Link>
            ) : null}
            {needsOlder > 0 ? (
              <Link className="underline underline-offset-4" href="/admin/buero/bestellungen?zeitraum=jahr&aufmerksamkeit=1">
                {needsOlder} weitere {needsOlder === 1 ? "Bestellung" : "Bestellungen"} außerhalb des Zeitraums (dieses Jahr)
              </Link>
            ) : null}
          </p>
        ) : null}
      </Card>

      {auto === null || hints.length ? (
        <Card className="mb-8" title={`Benachrichtigungen und Erinnerungen (${hints.length})`}>
          {auto === null ? (
            <p className="text-[14px] text-red-700">Die Einstellungen für Benachrichtigungen konnten gerade nicht geladen werden.</p>
          ) : (
            <ul className="divide-y divide-line text-[14px]">
              {hints.slice(0, 5).map(hintRow)}
            </ul>
          )}
          {hints.length > 5 ? (
            <details className="group mt-1">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
                <Chevron />
                {Math.min(hints.length, 15) - 5} weitere anzeigen
              </summary>
              <ul className="divide-y divide-line text-[14px]">{hints.slice(5, 15).map(hintRow)}</ul>
              {hints.length > 15 ? <p className="mt-3 text-[13px] text-muted">… und {hints.length - 15} weitere.</p> : null}
            </details>
          ) : null}
          {can(me.role, "office.automation") ? (
            <p className="mt-3 text-[13px]">
              <Link className="underline underline-offset-4" href="/admin/buero/einstellungen/berichte">
                Einstellen
              </Link>
            </p>
          ) : null}
        </Card>
      ) : null}

      <h2 className="mb-3 font-medium text-[15px]">Umsatz (brutto, ohne Stornos, abzüglich Erstattungen)</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(
          [
            ["Tagesumsatz", k.revenue.day],
            ["Wochenumsatz", k.revenue.week],
            ["Monatsumsatz", k.revenue.month],
            ["Jahresumsatz", k.revenue.year],
          ] as const
        ).map(([l, r]) => (
          <Stat hint={`netto ${formatPrice(r.net)} · ${r.orders} ${r.orders === 1 ? "Bestellung" : "Bestellungen"}`} key={l} label={l} value={formatPrice(r.gross)} />
        ))}
      </div>

      <details className="group mb-6">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-card px-4 py-2 font-medium text-[14px] outline-none hover:border-ink/40 focus-visible:ring-4 focus-visible:ring-ink/10 [&::-webkit-details-marker]:hidden">
          <Chevron />
          Alle Zahlen und Status anzeigen
        </summary>
        <div className="mt-6">
          <h2 className="mb-3 font-medium text-[15px]">
            Weitere Bürostatus · <span className="text-muted">{period.label}</span>
          </h2>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {office
              .filter((c) => !c.main)
              .map((c) => (
                <Link className="rounded-3xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10" href={c.href} key={c.label}>
                  <Stat label={c.label} value={c.value} />
                </Link>
              ))}
          </div>
        <h2 className="mb-3 font-medium text-[15px]">Neue Bestellungen</h2>
        <div className="mb-8 grid grid-cols-3 gap-3">
          <Stat label="Heute" value={k.counts.today} />
          <Stat label="Diese Woche" value={k.counts.week} />
          <Stat label="Dieser Monat" value={k.counts.month} />
        </div>

          <h2 className="mb-3 font-medium text-[15px]">
            Status und Beträge · <span className="text-muted">{period.label}</span>
          </h2>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {counts.map((c) =>
            c.href ? (
              <Link className="rounded-3xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10" href={c.href} key={c.label}>
                <Stat label={c.label} value={c.value ?? "—"} />
              </Link>
            ) : (
              <Stat hint={c.hint} key={c.label} label={c.label} value={c.value ?? "—"} />
            ),
          )}
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Umsatz brutto" value={formatPrice(k.money.gross)} hint={`netto ${formatPrice(k.money.net)}`} />
          <Stat label="Rabatte" value={formatPrice(k.money.discount)} />
          <Stat label="Versandkosten" value={formatPrice(k.money.shipping)} hint={k.money.shippingOnRequest ? `+ ${k.money.shippingOnRequest}× Spedition nach Absprache` : undefined} />
          <Stat label="Pfand" value={formatPrice(k.money.deposit)} />
          <Stat label="Erstattungen" value={formatPrice(k.money.refunds)} />
          <Stat label="Unbezahlt" value={formatPrice(k.money.unpaidGross)} />
        </div>
        <Card title="So wird gerechnet">
          <ul className="list-disc space-y-1 pl-5 text-[14px] text-muted">
            <li>Umsatz = Bruttobetrag abzüglich Erstattungen. Stornierte Bestellungen zählen nicht. Privatbestellungen zählen erst nach der Zahlung, Händlerbestellungen (auf Rechnung) ab Bestellung.</li>
            <li>Rabatte, Versand und Pfand in brutto. Händlerwerte sind netto gespeichert und werden mit 19 % umgerechnet.</li>
            <li>Wochen nach ISO (Montag bis Sonntag), alle Zeiten in deutscher Zeit.</li>
            <li>Keine Lagerbestände: Mengen sind bestellte Mengen.</li>
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Stand: {formatDateTime(now)} · {can(me.role, "office.export") ? <Link className="underline underline-offset-4" href="/admin/buero/export">Zum Excel-Export</Link> : "Nur Lesezugriff"}
          </p>
        </Card>
        </div>
      </details>
    </>
  );
}
