"use client";

import { MinusIcon, PlusIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { useCart } from "@/lib/cart";
import { depositFor, formatPrice } from "@/lib/format";
import { MIX_TIERS, mixDiscount } from "@/lib/mix";
import type { Product } from "@/lib/types";

/** Mix zusammenstellen: Mengen je Sorte (ganze Trays) – wirkt direkt auf den Warenkorb */
export function MixConfigurator({ products, groups }: { products: Product[]; groups: { title: string; handles: string[] }[] }) {
  const { lines, setLine, open } = useCart();
  const qty = (p: Product) => lines.find((l) => l.variantId === p.variants[0].id)?.quantity ?? 0;
  const chosen = products.filter((p) => qty(p) > 0);
  const mix = mixDiscount(chosen.map((p) => ({ handle: p.handle, quantity: qty(p), price: p.variants[0].price })));
  const deposit = chosen.reduce((n, p) => n + depositFor(p.variants[0], qty(p)), 0);
  const byHandle = new Map(products.map((p) => [p.handle, p]));

  return (
    <div className="grid grid-cols-1 gap-8 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-10">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="t-h3 mb-4">{g.title}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.handles.map((h) => {
                const p = byHandle.get(h);
                if (!p) return null;
                const v = p.variants[0];
                const q = qty(p);
                return (
                  <li className={`flex items-center gap-4 rounded-[1.25rem] border bg-card p-3 ${q > 0 ? "border-accent/60" : "border-line"}`} key={h}>
                    <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-cream">
                      <ProductImage product={p} sizes="80px" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-muted text-sm">
                        {formatPrice(v.price)} je {v.title.replace(" Tray", "-Tray")}
                      </span>
                    </span>
                    {v.available ? (
                      <span className="flex items-center rounded-full border border-line">
                        <button aria-label={`${p.title}: ein Tray weniger`} className="p-2.5 transition hover:text-accent disabled:opacity-30" disabled={q === 0} onClick={() => setLine(h, v.id, q - 1)} type="button">
                          <MinusIcon className="size-3.5" />
                        </button>
                        <span aria-live="polite" className="w-7 text-center tabular-nums">
                          {q}
                        </span>
                        <button aria-label={`${p.title}: ein Tray mehr`} className="p-2.5 transition hover:text-accent" onClick={() => setLine(h, v.id, q + 1)} type="button">
                          <PlusIcon className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <span className="rounded-full border border-line px-3 py-1.5 text-muted text-xs">Ausverkauft</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-[1.75rem] border border-line bg-card p-6">
          <h2 className="t-h3">Dein Mix</h2>
          {chosen.length === 0 ? (
            <p className="mt-3 text-muted text-sm">Noch nichts gewählt. Leg mit + deine ersten Trays in den Mix.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {chosen.map((p) => (
                <li className="flex justify-between gap-3" key={p.handle}>
                  <span className="truncate">
                    {qty(p)}× {p.title}
                  </span>
                  <span className="tabular-nums">{formatPrice(qty(p) * p.variants[0].price)}</span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-5 space-y-2 border-line border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {mix.trays} {mix.trays === 1 ? "Tray" : "Trays"} · {mix.sorts} {mix.sorts === 1 ? "Sorte" : "Sorten"}
              </dt>
              <dd className="tabular-nums">{formatPrice(mix.subtotal)}</dd>
            </div>
            {mix.discount > 0 ? (
              <div className="flex justify-between text-accent">
                <dt>Mix-Rabatt {mix.pct} %</dt>
                <dd className="tabular-nums">−{formatPrice(mix.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between font-medium text-base">
              <dt>Summe</dt>
              <dd className="tabular-nums">{formatPrice(mix.subtotal - mix.discount)}</dd>
            </div>
            {deposit > 0 ? (
              <div className="flex justify-between text-muted text-xs">
                <dt>zzgl. Einwegpfand</dt>
                <dd className="tabular-nums">{formatPrice(deposit)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-4 rounded-xl bg-cream px-3 py-2 text-xs">
            {mix.trays === 0
              ? "Ab 2 verschiedenen Sorten gibt es Mix-Rabatt."
              : mix.sorts < 2
                ? "Nimm eine zweite Sorte dazu – dann gibt es Mix-Rabatt."
                : mix.next
                  ? `Noch ${mix.next.missing} ${mix.next.missing === 1 ? "Tray" : "Trays"} bis ${mix.next.pct} % Mix-Rabatt.`
                  : "Höchster Mix-Rabatt erreicht."}
          </p>

          <ul aria-label="Rabattstufen" className="mt-4 grid grid-cols-4 gap-1.5 text-center text-xs">
            {MIX_TIERS.map((t) => {
              const reached = mix.sorts >= 2 && mix.trays >= t.min;
              const current = reached && mix.pct === t.pct;
              return (
                <li className={`rounded-lg border px-1 py-1.5 ${current ? "border-accent bg-accent/15" : reached ? "border-accent/40" : "border-line text-muted"}`} key={t.min}>
                  <span className="block font-bold">−{t.pct} %</span>
                  <span className="block">ab {t.min}</span>
                </li>
              );
            })}
          </ul>

          <button className="mt-5 flex w-full items-center justify-center rounded-full bg-accent py-3.5 font-bold text-black transition hover:bg-accent-dark disabled:opacity-50" disabled={chosen.length === 0} onClick={open} type="button">
            Zum Warenkorb
          </button>
          {chosen.length > 0 ? (
            <button className="mt-2 w-full text-muted text-xs underline-offset-4 hover:underline" onClick={() => chosen.forEach((p) => setLine(p.handle, p.variants[0].id, 0))} type="button">
              Mix leeren
            </button>
          ) : null}
          <p className="mt-3 text-center text-muted text-xs">Inkl. MwSt., zzgl. Pfand und Versand. Dein Mix liegt direkt im Warenkorb.</p>
        </div>
      </aside>
    </div>
  );
}
