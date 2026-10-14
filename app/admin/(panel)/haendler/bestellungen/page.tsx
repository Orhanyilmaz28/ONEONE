import type { Metadata } from "next";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { Badge, Card, EmptyState, PageHeader, btnSecondary, formatDateTime, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { DEALER_ORDER_STATUS, type DealerOrderStatus, getDealerOrders } from "@/lib/dealer-orders";
import { formatPrice } from "@/lib/format";
import { setDealerOrderStatusAction } from "./actions";

export const metadata: Metadata = { title: "Händler-Bestellungen" };

const TONE: Record<DealerOrderStatus, "amber" | "blue" | "green" | "neutral" | "red"> = { neu: "amber", bestaetigt: "blue", versendet: "green", erledigt: "neutral", storniert: "red" };

export default async function DealerOrdersAdminPage() {
  await requireAdmin();
  const orders = await getDealerOrders();
  const open = orders.filter((o) => o.status === "neu").length;
  return (
    <>
      <PageHeader
        description={`Bestellungen aus dem Händlerbereich (netto, ohne Online-Zahlung). Bestätigen, Rechnung schicken und den Status setzen – der Händler sieht ihn in seinem Bereich.${open ? ` ${open} neu.` : ""}`}
        title="Händler"
      />
      <DealerTabs active="/admin/haendler/bestellungen" />
      {orders.length === 0 ? (
        <EmptyState title="Noch keine Händler-Bestellungen">Freigegebene Händler bestellen im Händlerbereich unter „Bestellen“.</EmptyState>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card
              actions={<Badge tone={TONE[o.status]}>{DEALER_ORDER_STATUS[o.status]}</Badge>}
              key={o.id}
              title={
                <>
                  {o.number} · {o.dealer.company} <span className="font-normal text-muted text-sm">· {formatDateTime(o.createdAt)}</span>
                </>
              }
            >
              <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
                <div>
                  <ul className="space-y-1 text-sm">
                    {o.lines.map((l, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                      <li className="flex justify-between gap-4" key={i}>
                        <span>
                          {l.quantity} × {l.kind === "palette" ? "Palette" : "Tray"} {l.title} <span className="text-muted">à {formatPrice(l.unitPrice)}</span>
                        </span>
                        <span className="tabular-nums">{formatPrice(l.total)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-line border-t pt-3 text-sm">
                    <b>{formatPrice(o.net)}</b> netto · Pfand {formatPrice(o.deposit)} netto · zzgl. MwSt.
                  </p>
                  {o.note ? <p className="mt-2 whitespace-pre-line text-sm">Anmerkung: {o.note}</p> : null}
                </div>
                <div className="text-sm">
                  <p className="font-medium">{o.dealer.contact}</p>
                  <p>
                    <a className="underline" href={`mailto:${o.dealer.email}?subject=${encodeURIComponent(`Deine Bestellung ${o.number}`)}`}>
                      {o.dealer.email}
                    </a>
                  </p>
                  {o.dealer.phone ? <p>{o.dealer.phone}</p> : null}
                  <p className="mt-2 text-muted">
                    {o.dealer.street}, {o.dealer.zip} {o.dealer.city}
                    {o.dealer.vatId ? <><br />USt-IdNr. {o.dealer.vatId}</> : null}
                  </p>
                  <form action={setDealerOrderStatusAction} className="mt-4 flex gap-2" key={o.status}>
                    <input name="id" type="hidden" value={o.id} />
                    <select aria-label="Status" className={input} defaultValue={o.status} name="status">
                      {Object.entries(DEALER_ORDER_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button className={btnSecondary} type="submit">
                      Speichern
                    </button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
