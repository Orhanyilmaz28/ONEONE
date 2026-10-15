import Link from "next/link";
import { CommissionChart } from "@/components/commission-chart";
import { CopyButton } from "@/components/copy-button";
import { commissionStats, getCommissionsOf, getStatementsOf } from "@/lib/commissions";
import { SITE_URL, formatPrice } from "@/lib/format";
import { requireInfluencer } from "@/lib/influencer-auth";

export const metadata = { title: "Übersicht" };

const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export default async function InfluencerDashboard() {
  const inf = await requireInfluencer();
  const [commissions, statements] = await Promise.all([getCommissionsOf(inf.id), getStatementsOf(inf.id)]);
  const stats = commissionStats(commissions, statements);
  const link = inf.code ? `${SITE_URL}/?code=${inf.code}` : "";
  const missingPayout = !inf.iban;
  const tiles: [string, string, string?][] = [
    ["Bestellungen diesen Monat", String(stats.ordersThisMonth), `${stats.ordersTotal} insgesamt`],
    ["Provision noch nicht abgerechnet", formatPrice(Math.max(0, stats.pendingUnbilled)), "wird mit der Monatsgutschrift abgerechnet"],
    ["Abgerechnet, Auszahlung offen", formatPrice(stats.unpaid)],
    ["Ausgezahlt gesamt", formatPrice(stats.paidOut)],
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Hey {inf.name.split(" ")[0]}</p>
      <h1 className="t-h1 mt-3">Dein Partner-Dashboard</h1>

      {inf.code ? (
        <section className="mt-8 grid gap-4 rounded-[2rem] border border-accent/40 bg-card p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
          <div>
            <p className="text-muted text-sm">Dein Code</p>
            <p className="mt-1 font-black text-4xl text-accent tracking-wider sm:text-5xl">{inf.code}</p>
            <p className="mt-2 text-sm">
              <b>{inf.discountPct} %</b> Rabatt für deine Community · <b>{inf.commissionPct} %</b> Provision für dich
            </p>
            {!inf.active ? <p className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-amber-300 text-sm">Dein Code ist gerade pausiert. Melde dich bei uns, wenn das nicht so sein soll.</p> : null}
          </div>
          <div className="grid gap-3 md:justify-self-end">
            <CopyButton className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 font-bold text-black transition hover:bg-accent-dark" label="Code kopieren" text={inf.code} />
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-line px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-muted text-sm">{link}</span>
              <CopyButton className="shrink-0 font-bold text-accent text-sm" label="Link kopieren" text={link} />
            </div>
            <p className="text-muted text-xs">Mit dem Link ist dein Code im Warenkorb schon eingetragen.</p>
          </div>
        </section>
      ) : null}

      {missingPayout ? (
        <p className="mt-6 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-5 py-4 text-sm">
          Für deine Auszahlung fehlt noch deine Bankverbindung.{" "}
          <Link className="font-bold text-accent underline" href="/influencer/portal/konto">
            Jetzt eintragen
          </Link>
        </p>
      ) : null}

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <li className="rounded-[1.5rem] border border-line bg-card p-5" key={label}>
            <p className="text-muted text-sm">{label}</p>
            <p className="mt-2 font-black text-3xl tabular-nums">{value}</p>
            {sub ? <p className="mt-1 text-muted text-xs">{sub}</p> : null}
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <CommissionChart months={stats.months} />
      </div>

      <section className="mt-8 rounded-[1.5rem] border border-line bg-card p-5">
        <h2 className="font-bold">Letzte Bestellungen mit deinem Code</h2>
        {commissions.length === 0 ? (
          <p className="mt-4 text-muted text-sm">Noch keine Bestellungen – teile deinen Code und Link mit deiner Community!</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-2 pr-3 font-medium">Datum</th>
                  <th className="py-2 pr-3 font-medium">Bestellung</th>
                  <th className="py-2 pr-3 text-right font-medium">Warenwert netto</th>
                  <th className="py-2 pr-3 text-right font-medium">Provision</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {commissions.slice(0, 25).map((c) => (
                  <tr className={c.status === "storniert" ? "text-muted line-through decoration-white/30" : ""} key={c.orderId}>
                    <td className="py-2 pr-3">{day(c.date)}</td>
                    <td className="py-2 pr-3">{c.orderNumber}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPrice(c.goodsNet)}</td>
                    <td className="py-2 pr-3 text-right font-bold tabular-nums">{formatPrice(c.amount)}</td>
                    <td className="py-2 no-underline">{c.status === "storniert" ? "storniert" : c.statementId ? "abgerechnet" : "vorgemerkt"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-muted text-xs">Provision auf den Warenwert ohne MwSt., Pfand und Versand. Stornierte oder erstattete Bestellungen werden verrechnet. Kundendaten siehst du aus Datenschutzgründen nicht.</p>
      </section>
    </div>
  );
}
