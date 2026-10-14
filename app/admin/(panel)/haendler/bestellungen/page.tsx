import type { Metadata } from "next";
import { setDealerOrderStatusAction } from "./actions";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { Badge, EmptyState, PageHeader, btn, formatDateTime, formatDay, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { TIER_LABELS } from "@/lib/dealer-order-calc";
import { DEALER_ORDER_STATUS, type DealerOrderStatus, getDealerOrders } from "@/lib/dealer-orders";
import { formatCan } from "@/lib/dealer-pricing";
import { formatPrice } from "@/lib/format";
import { mailReady } from "@/lib/mail";

export const metadata: Metadata = { title: "Händler-Bestellungen" };

const TONE: Record<DealerOrderStatus, "amber" | "blue" | "green" | "red"> = { eingegangen: "amber", bestätigt: "blue", versendet: "green", storniert: "red" };
const LABEL: Record<DealerOrderStatus, string> = { eingegangen: "Eingegangen", bestätigt: "Bestätigt", versendet: "Versendet", storniert: "Storniert" };

type SearchParams = Promise<{ status?: string }>;

export default async function DealerOrdersAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { status } = await searchParams;
  const all = await getDealerOrders();
  const filter = DEALER_ORDER_STATUS.includes(status as DealerOrderStatus) ? (status as DealerOrderStatus) : undefined;
  const orders = filter ? all.filter((o) => o.status === filter) : all;
  const open = all.filter((o) => o.status === "eingegangen").length;
  return (
    <>
      <PageHeader
        description="Bestellungen freigegebener Händler – Zahlung auf Rechnung. Status setzen und den Händler auf Wunsch per E-Mail informieren. Die Rechnung schreibst du wie gewohnt."
        title="Händler"
      />
      <DealerTabs active="/admin/haendler/bestellungen" />
      <nav aria-label="Status" className="mb-5 flex flex-wrap gap-2 text-sm">
        <a className={`rounded-full border px-3 py-1.5 ${!filter ? "border-ink" : "border-line"}`} href="/admin/haendler/bestellungen">
          Alle ({all.length})
        </a>
        {DEALER_ORDER_STATUS.map((s) => (
          <a className={`rounded-full border px-3 py-1.5 ${filter === s ? "border-ink" : "border-line"}`} href={`/admin/haendler/bestellungen?status=${encodeURIComponent(s)}`} key={s}>
            {LABEL[s]} ({all.filter((o) => o.status === s).length})
          </a>
        ))}
      </nav>
      {open ? <p className="mb-5 font-medium text-amber-700 text-sm">{open} {open === 1 ? "neue Bestellung wartet" : "neue Bestellungen warten"} auf deine Bestätigung.</p> : null}
      {orders.length === 0 ? (
        <EmptyState title="Noch keine Händler-Bestellungen">Freigegebene Händler bestellen in ihrem Bereich unter „Preise &amp; Bestellen“.</EmptyState>
      ) : (
        <ul className="grid gap-4">
          {orders.map((o) => (
            <li className="scroll-mt-24 rounded-3xl border border-line bg-card" id={o.id} key={o.id}>
              <details open={o.status === "eingegangen"}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {o.number} · {o.delivery.company}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {formatDateTime(o.createdAt)} · {o.calc.trays} Trays · Stufe {o.tierName}
                      {o.reference ? ` · Nr. ${o.reference}` : ""}
                    </span>
                  </span>
                  <Badge tone={TONE[o.status]}>{LABEL[o.status]}</Badge>
                  <span className="font-medium tabular-nums">{formatPrice(o.calc.gross)}</span>
                </summary>
                <div className="grid gap-6 border-line border-t p-5 lg:grid-cols-[1.4fr_1fr]">
                  <div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line">
                        {o.calc.lines.map((l) => (
                          <tr key={l.handle}>
                            <td className="py-2">
                              <b>{l.trays} ×</b> {l.title}
                              <span className="block text-[12px] text-muted">
                                {l.units.toLocaleString("de-DE")} Stück · {l.canPrice ? `${formatCan(l.canPrice)}/Dose · ` : ""}
                                {formatPrice(l.perTray)} je Tray netto · {TIER_LABELS[l.tier]}
                              </span>
                            </td>
                            <td className="py-2 text-right tabular-nums">{formatPrice(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
                      <dt className="text-muted">Warenwert netto</dt>
                      <dd className="text-right tabular-nums">{formatPrice(o.calc.goodsNet)}</dd>
                      <dt className="text-muted">Pfand</dt>
                      <dd className="text-right tabular-nums">{formatPrice(o.calc.depositNet)}</dd>
                      <dt className="text-muted">{o.calc.shippingLabel}</dt>
                      <dd className="text-right tabular-nums">{o.calc.shippingNet === null ? "nach Absprache" : o.calc.shippingNet ? formatPrice(o.calc.shippingNet) : "kostenlos"}</dd>
                      <dt className="text-muted">Netto · 19 % MwSt.</dt>
                      <dd className="text-right tabular-nums">
                        {formatPrice(o.calc.net)} · {formatPrice(o.calc.vat)}
                      </dd>
                      <dt className="font-medium">Gesamt</dt>
                      <dd className="text-right font-medium tabular-nums">{formatPrice(o.calc.gross)}</dd>
                    </dl>
                  </div>
                  <div className="text-sm">
                    <p className="text-[12px] text-muted uppercase tracking-[0.08em]">Lieferung</p>
                    <p className="mt-1">
                      {o.delivery.company}
                      <br />
                      {o.delivery.contact}
                      <br />
                      {o.delivery.street}
                      <br />
                      {o.delivery.zip} {o.delivery.city}
                    </p>
                    <p className="mt-2">
                      <a className="underline" href={`mailto:${o.dealerEmail}?subject=${encodeURIComponent(`Ihre Bestellung ${o.number}`)}`}>
                        {o.dealerEmail}
                      </a>
                    </p>
                    {o.wishDate ? <p className="mt-2">Wunschtermin: {formatDay(`${o.wishDate}T12:00:00Z`)}</p> : null}
                    {o.note ? <p className="mt-2 whitespace-pre-line rounded-xl bg-paper p-3">{o.note}</p> : null}
                    <form action={setDealerOrderStatusAction} className="mt-4 grid gap-2">
                      <input name="id" type="hidden" value={o.id} />
                      <select aria-label="Status" className={input} defaultValue={o.status} name="status">
                        {DEALER_ORDER_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input defaultChecked={mailReady()} disabled={!mailReady()} name="notify" type="checkbox" /> Händler per E-Mail informieren{mailReady() ? "" : " (E-Mail-Versand nicht eingerichtet)"}
                      </label>
                      <button className={btn} type="submit">
                        Status speichern
                      </button>
                    </form>
                    <p className="mt-3 text-[12px] text-muted">{o.history.map((h) => `${LABEL[h.status]} ${formatDateTime(h.at)}`).join(" → ")}</p>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
