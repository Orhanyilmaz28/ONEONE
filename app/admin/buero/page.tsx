import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice, PageHeader, Stat, formatDateTime } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { computeKpis, overviewStart, standardRanges } from "@/lib/office/kpis";
import { can } from "@/lib/office/roles";
import { loadOfficeOrders } from "@/lib/office/source";
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
  const link = (extra: Record<string, string>) => `/admin/buero/bestellungen?${new URLSearchParams({ zeitraum: periodKey, ...extra }).toString()}`;

  const counts: { label: string; value: number | null; href?: string; hint?: string }[] = [
    { label: "Offen", value: k.counts.open, href: link({ status: "offen" }) },
    { label: "Bezahlt", value: k.counts.paid, href: link({ zahlung: "bezahlt" }) },
    { label: "Unbezahlt", value: k.counts.unpaid, href: link({ zahlung: "unbezahlt" }) },
    { label: "Händlerbestellungen", value: k.counts.dealer, href: link({ typ: "haendler" }) },
    { label: "Privatbestellungen", value: k.counts.private, href: link({ typ: "privat" }) },
    { label: "In Bearbeitung", value: k.counts.inProgress, href: link({ status: "in_bearbeitung" }) },
    { label: "Für Versand freigegeben", value: k.counts.released, hint: "wird ab Phase 3C erfasst" },
    { label: "Versendet", value: k.counts.shipped, href: link({ status: "versendet" }) },
    { label: "Storniert", value: k.counts.cancelled, href: link({ status: "storniert" }) },
    { label: "Exportiert", value: k.counts.exported, href: link({ exportiert: "ja" }) },
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

      <h2 className="mb-3 font-medium text-[15px]">Neue Bestellungen</h2>
      <div className="mb-8 grid grid-cols-3 gap-3">
        <Stat label="Heute" value={k.counts.today} />
        <Stat label="Diese Woche" value={k.counts.week} />
        <Stat label="Dieser Monat" value={k.counts.month} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-[15px]">
          Status und Beträge · <span className="text-muted">{period.label}</span>
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
    </>
  );
}
