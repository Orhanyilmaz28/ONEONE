import Link from "next/link";
import { requireDealer } from "@/lib/dealer-auth";
import { DEALER_ORDER_STATUS, getOrdersOfDealer } from "@/lib/dealer-orders";
import { formatPrice as euro } from "@/lib/format";

export const metadata = { title: "Bestellungen" };

type Props = { searchParams: Promise<{ neu?: string }> };

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export default async function DealerOrdersPage({ searchParams }: Props) {
  const dealer = await requireDealer();
  const { neu } = await searchParams;
  const orders = await getOrdersOfDealer(dealer.id);
  const fresh = typeof neu === "string" && orders.some((o) => o.number === neu) ? neu : null;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Bestellungen</h1>
      {fresh ? (
        <p className="mt-6 rounded-[1.5rem] border border-accent/50 bg-accent/10 px-5 py-4" role="status">
          <b>Danke!</b> Deine Bestellung <b>{fresh}</b> ist bei uns eingegangen. Wir melden uns mit der Bestätigung und der Rechnung.
        </p>
      ) : null}
      {orders.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-line border-dashed px-6 py-12 text-center">
          <p className="font-medium">Noch keine Bestellungen.</p>
          <Link className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-black text-sm transition hover:bg-accent-dark" href="/haendler/portal/bestellen">
            Jetzt bestellen
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((o) => (
            <li className="rounded-[1.5rem] border border-line bg-card p-5" key={o.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-bold">
                  {o.number} <span className="font-normal text-muted text-sm">· {dateFmt.format(new Date(o.createdAt))}</span>
                </p>
                <span className={`rounded-full px-3 py-1 font-bold text-xs ${o.status === "storniert" ? "border border-line text-muted" : "bg-accent text-black"}`}>{DEALER_ORDER_STATUS[o.status]}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {o.lines.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                  <li className="flex justify-between gap-4" key={i}>
                    <span>
                      {l.quantity} × {l.kind === "palette" ? "Palette" : "Tray"} {l.title}
                    </span>
                    <span className="tabular-nums">{euro(l.total)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-line border-t pt-3 text-sm">
                <b className="tabular-nums">{euro(o.net)}</b> netto <span className="text-muted">· zzgl. {euro(o.deposit)} Pfand und MwSt.</span>
              </p>
              {o.note ? <p className="mt-2 whitespace-pre-line text-muted text-sm">Anmerkung: {o.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
