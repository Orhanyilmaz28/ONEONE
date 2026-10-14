import Link from "next/link";
import { requireDealer } from "@/lib/dealer-auth";
import { TIER_LABELS } from "@/lib/dealer-order-calc";
import { type DealerOrderStatus, getDealerOrdersOf } from "@/lib/dealer-orders";
import { formatPrice as euro } from "@/lib/format";

export const metadata = { title: "Meine Bestellungen" };

const STATUS: Record<DealerOrderStatus, { label: string; cls: string }> = {
  eingegangen: { label: "Eingegangen", cls: "border-white/20 text-ink" },
  bestätigt: { label: "Bestätigt", cls: "border-accent/60 text-accent" },
  versendet: { label: "Versendet", cls: "border-accent bg-accent text-black" },
  storniert: { label: "Storniert", cls: "border-red-400/50 text-red-300" },
};
const date = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export default async function DealerOrdersPage() {
  const dealer = await requireDealer();
  const orders = await getDealerOrdersOf(dealer.id);
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Meine Bestellungen</h1>
      <p className="t-lead mt-3 max-w-2xl">Alle Bestellungen auf Rechnung mit Status. Mit „Nochmal bestellen“ übernimmst du die Mengen in die Preisliste.</p>
      <Link className="mt-5 inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black transition hover:bg-accent-dark" href="/haendler/portal/preise">
        Neue Bestellung
      </Link>

      {orders.length === 0 ? (
        <p className="mt-10 rounded-[1.5rem] border border-line border-dashed bg-card px-6 py-12 text-center text-muted">Noch keine Bestellungen – wähle in der Preisliste deine Mengen und tippe auf „Bestellen“.</p>
      ) : (
        <ul className="mt-10 grid gap-4">
          {orders.map((o) => (
            <li className="rounded-[1.5rem] border border-line bg-card" key={o.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{o.number}</span>
                    <span className="block text-muted text-sm">
                      {date(o.createdAt)} · {o.calc.trays} Trays{o.reference ? ` · Ihre Nr. ${o.reference}` : ""}
                    </span>
                  </span>
                  <span className={`rounded-full border px-3 py-1 font-bold text-xs ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                  <span className="font-bold tabular-nums">{euro(o.calc.gross)}</span>
                  <span aria-hidden className="text-muted transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="grid gap-6 border-line border-t p-5 md:grid-cols-[1.4fr_1fr]">
                  <div>
                    <ul className="divide-y divide-line text-sm">
                      {o.calc.lines.map((l) => (
                        <li className="flex justify-between gap-3 py-2" key={l.handle}>
                          <span>
                            <b>{l.trays} ×</b> {l.title}
                            <span className="block text-muted text-xs">
                              {euro(l.perTray)} je Tray · {TIER_LABELS[l.tier]}
                            </span>
                          </span>
                          <span className="tabular-nums">{euro(l.total)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-muted text-sm">
                      Netto {euro(o.calc.net)} · MwSt. {euro(o.calc.vat)} · {o.calc.shippingNet === null ? "Spedition nach Absprache" : o.calc.shippingNet ? `Versand ${euro(o.calc.shippingNet)}` : "Versand kostenlos"}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted text-xs uppercase tracking-wider">Lieferung</p>
                    <p className="mt-1">
                      {o.delivery.company}
                      <br />
                      {o.delivery.contact}
                      <br />
                      {o.delivery.street}
                      <br />
                      {o.delivery.zip} {o.delivery.city}
                    </p>
                    {o.wishDate ? <p className="mt-2">Wunschtermin: {date(`${o.wishDate}T12:00:00Z`)}</p> : null}
                    {o.note ? <p className="mt-2 whitespace-pre-line text-muted">{o.note}</p> : null}
                    <p className="mt-3 text-muted text-xs">{o.history.map((h) => `${STATUS[h.status].label} ${date(h.at)}`).join(" → ")}</p>
                    <Link className="mt-4 inline-flex h-10 items-center rounded-full border border-accent px-5 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" href={`/haendler/portal/preise?nochmal=${o.id}`}>
                      Nochmal bestellen
                    </Link>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
