import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommissionChart } from "@/components/commission-chart";
import { Badge, Card, PageHeader, Stat, Table, btnSecondary, formatDay } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { commissionStats, getCommissionsOf, getStatementsOf, monthLabel, monthOf, openLines } from "@/lib/commissions";
import { formatPrice } from "@/lib/format";
import { getInfluencer } from "@/lib/influencers";
import { setStatementPaidAction } from "../actions";
import { StatementForm } from "./statement-form";

export const metadata: Metadata = { title: "Influencer – Provisionen" };

export default async function InfluencerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const inf = await getInfluencer(id);
  if (!inf) notFound();
  const [commissions, statements] = await Promise.all([getCommissionsOf(id), getStatementsOf(id)]);
  const stats = commissionStats(commissions, statements);
  // Abrechenbar: abgeschlossene Monate (bis Vormonat), in denen es offene Positionen gibt
  const current = monthOf(new Date().toISOString());
  const months = [...new Set(commissions.map((c) => monthOf(c.date)))]
    .filter((m) => m < current)
    .sort()
    .reverse()
    .filter((m) => {
      const { due, reversals } = openLines(commissions, id, m);
      return due.length > 0 || reversals.length > 0;
    })
    .map((m) => ({ value: m, label: monthLabel(m) }));
  return (
    <>
      <PageHeader
        actions={
          <Link className={btnSecondary} href="/admin/influencer">
            ← Alle Influencer
          </Link>
        }
        description={`${inf.name} · ${inf.email} · Code ${inf.code ?? "–"} (${inf.discountPct} % Rabatt, ${inf.commissionPct} % Provision)`}
        title={inf.alias}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat hint={`${stats.ordersThisMonth} diesen Monat`} label="Bestellungen" value={stats.ordersTotal} />
        <Stat label="Umsatz netto" value={formatPrice(stats.revenueNet)} />
        <Stat hint="noch nicht abgerechnet" label="Provision offen" value={formatPrice(Math.max(0, stats.pendingUnbilled))} />
        <Stat hint={`ausgezahlt ${formatPrice(stats.paidOut)}`} label="Auszahlung offen" value={formatPrice(stats.unpaid)} />
      </div>
      <div className="mb-6">
        <CommissionChart months={stats.months} />
      </div>
      <Card className="mb-6" title="Monatsgutschrift">
        <p className="mb-3 text-[14px] text-muted">
          Erstellt die Gutschrift für den gewählten Monat (inkl. älterer, noch offener Provisionen und Stornos bereits abgerechneter Bestellungen). Der Influencer sieht sie sofort im Dashboard{inf.iban ? "" : " – Achtung: Bankverbindung fehlt noch"}.
        </p>
        <StatementForm id={id} months={months} />
        {statements.length ? (
          <div className="mt-5">
            <Table head={["Nummer", "Zeitraum", "Betrag", "Status", ""]}>
              {statements.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 pr-4 font-medium">{s.number}</td>
                  <td className="py-3 pr-4">{monthLabel(s.month)}</td>
                  <td className="py-3 pr-4 tabular-nums">{formatPrice(s.gross)}</td>
                  <td className="py-3 pr-4">{s.paid ? <Badge tone="green">ausgezahlt {s.paidAt ? formatDay(s.paidAt) : ""}</Badge> : <Badge tone="amber">offen</Badge>}</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      <Link className={btnSecondary} href={`/admin/influencer/gutschrift/${s.id}`}>
                        Ansehen / PDF
                      </Link>
                      <form action={setStatementPaidAction.bind(null, s.id, id, !s.paid)}>
                        <button className={btnSecondary} type="submit">
                          {s.paid ? "Doch nicht ausgezahlt" : "Als ausgezahlt markieren"}
                        </button>
                      </form>
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        ) : null}
      </Card>
      <Card title="Bestellungen mit diesem Code">
        {commissions.length === 0 ? (
          <p className="text-[14px] text-muted">Noch keine Bestellungen.</p>
        ) : (
          <Table head={["Datum", "Bestellung", "Warenwert netto", "Satz", "Provision", "Status"]}>
            {commissions.map((c) => (
              <tr key={c.orderId}>
                <td className="py-3 pr-4">{formatDay(c.date)}</td>
                <td className="py-3 pr-4">
                  <Link className="underline" href={`/admin/bestellungen/${c.orderId}`}>
                    {c.orderNumber}
                  </Link>
                </td>
                <td className="py-3 pr-4 tabular-nums">{formatPrice(c.goodsNet)}</td>
                <td className="py-3 pr-4">{c.pct} %</td>
                <td className="py-3 pr-4 tabular-nums">{formatPrice(c.amount)}</td>
                <td className="py-3">
                  {c.status === "storniert" ? <Badge tone="red">storniert</Badge> : c.statementId ? <Badge tone="green">abgerechnet</Badge> : <Badge tone="amber">vorgemerkt</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-[13px] text-muted">Wird eine Bestellung unter „Bestellungen“ auf „storniert“ gesetzt oder in Stripe voll erstattet, wird die Provision automatisch storniert.</p>
      </Card>
    </>
  );
}
