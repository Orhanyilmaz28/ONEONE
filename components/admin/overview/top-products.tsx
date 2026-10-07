import Image from "next/image";
import Link from "next/link";
import { Badge, Card } from "@/components/admin/ui";
import type { Product } from "@/lib/types";
import { Icon } from "./icons";
import type { TopProduct } from "./stats";

/** Die meistverkauften Produkte der letzten 30 Tage (nach Stückzahl) */
export function TopProducts({ items, products }: { items: TopProduct[]; products: Map<string, Product & { hidden?: boolean }> }) {
  const max = Math.max(1, ...items.map((i) => i.quantity));

  return (
    <Card
      actions={
        <Link className="rounded-md text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30" href="/admin/produkte">
          Alle Produkte
        </Link>
      }
      padded={false}
      title="Bestseller · 30 Tage"
    >
      {items.length ? (
        <ol className="divide-y divide-line">
          {items.map((item, i) => {
            const product = products.get(item.handle);
            const image = product?.images[0];
            const share = Math.round((item.quantity / max) * 100);
            return (
              <li className="flex items-center gap-3.5 px-6 py-3.5" key={item.handle}>
                <span aria-hidden className="w-4 shrink-0 text-center font-medium text-[13px] text-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-cream ring-1 ring-line">
                  {image ? <Image alt="" className="object-cover" fill sizes="44px" src={image.src} /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {product ? (
                      <Link className="truncate font-medium text-[14px] hover:underline" href={`/admin/produkte/${item.handle}`}>
                        {product.title}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-[14px]">{item.name}</p>
                    )}
                    {product?.hidden ? <Badge>Ausgeblendet</Badge> : null}
                  </div>
                  {/* Anteil im Vergleich zum Bestseller */}
                  <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-cream">
                    <div className="h-full rounded-full bg-ink/80" style={{ width: `${share}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{item.orders === 1 ? "in 1 Bestellung" : `in ${item.orders} Bestellungen`}</p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-medium text-[15px] tabular-nums">{item.quantity.toLocaleString("de-DE")}</span>
                  <span className="block text-[12px] text-muted">Stück</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-cream text-ink/60">
            <Icon name="box" />
          </span>
          <p className="mt-3 font-medium text-[15px]">Noch keine Verkäufe</p>
          <p className="mt-1 max-w-xs text-[14px] text-muted">Sobald Bestellungen eingehen, siehst du hier, welche Produkte am beliebtesten sind.</p>
        </div>
      )}
    </Card>
  );
}
