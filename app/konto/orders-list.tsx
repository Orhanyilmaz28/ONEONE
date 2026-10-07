import Image from "next/image";
import { carrierLabel, trackingUrl } from "@/app/admin/(panel)/bestellungen/shipping";
import { catalog, getBaseProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABEL, type Order } from "@/lib/orders";

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });

const STATUS_TONE: Record<Order["meta"]["status"], string> = {
  offen: "bg-amber-50 text-amber-900 ring-amber-200",
  versendet: "bg-sky-50 text-sky-900 ring-sky-200",
  erledigt: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  storniert: "bg-ink/5 text-ink/70 ring-line",
};
const STATUS_TEXT: Record<Order["meta"]["status"], string> = {
  offen: "In Bearbeitung",
  versendet: ORDER_STATUS_LABEL.versendet,
  erledigt: "Zugestellt",
  storniert: ORDER_STATUS_LABEL.storniert,
};

/** Bestellungen als Karten – mit Produktbild, Status und Sendungsverfolgung */
export async function OrdersList({ orders }: { orders: Order[] }) {
  const products = new Map([...catalog.products, ...(await getBaseProducts())].map((p) => [p.handle, p]));
  return (
    <ul className="space-y-4">
      {orders.map((o) => {
        const track = trackingUrl(o.meta.tracking, o.meta.carrier);
        return (
          <li className="rounded-[1.75rem] border border-line bg-card p-5 sm:p-6" key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">Bestellung {o.number}</p>
                <p className="text-[14px] text-muted">vom {dateFmt.format(o.createdAt)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 font-medium text-[13px] ring-1 ${STATUS_TONE[o.meta.status]}`}>{STATUS_TEXT[o.meta.status]}</span>
            </div>
            <ul className="mt-4 divide-y divide-line border-line border-t">
              {o.items.map((it, i) => {
                const p = it.handle ? products.get(it.handle) : undefined;
                const img = p?.images[0];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
                  <li className="flex items-center gap-4 py-3" key={i}>
                    <div className="relative h-16 w-[52px] shrink-0 overflow-hidden rounded-xl bg-cream">
                      {img ? <Image alt="" className="object-cover" fill sizes="52px" src={img.src} /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[15px]">{p?.title ?? it.name}</p>
                      {it.description ? <p className="text-[13px] text-muted">{it.description}</p> : null}
                    </div>
                    <p className="shrink-0 text-[14px] text-ink/70 tabular-nums">{it.quantity} ×</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-line border-t pt-4">
              <p className="text-[15px]">
                Gesamt <b className="tabular-nums">{formatPrice(o.amountTotal)}</b>
              </p>
              {track ? (
                <a className="rounded-full border border-line px-4 py-2 text-[14px] transition hover:border-ink" href={track} rel="noreferrer" target="_blank">
                  Sendung verfolgen ({carrierLabel(o.meta.carrier)}) ↗
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
