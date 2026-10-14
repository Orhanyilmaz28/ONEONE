"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { cansOf, DEPOSIT_PER_CAN, formatPrice } from "@/lib/format";
import { SORT_COLORS, unitPriceLabel } from "@/lib/pack-contents";
import { useShopData } from "@/lib/shop-data";
import type { Product } from "@/lib/types";
import { ArrowIcon, CheckIcon, MinusIcon, PlusIcon } from "./icons";

/** Bereiche des Konfigurators in Shop-Reihenfolge */
const GROUPS = ["energy", "ice-tea", "ice-coffee", "mineralwasser"];
/** Mehr nimmt der Warenkorb je Sorte nicht an */
const MAX_PER_SORT = 99;

type Sort = { product: Product; variantId: string; price: number; cans: number; available: boolean; perLitre: string | null };

/**
 * Mix-Konfigurator: Trays aus allen Sorten frei zusammenstellen.
 * Jede Sorte landet als eigene Position im Warenkorb – so steht später auch auf Bestellung und Rechnung alles einzeln.
 */
export function MixConfigurator({ collections }: { collections: { handle: string; title: string }[] }) {
  const { products, settings } = useShopData();
  const cart = useCart();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);
  // Hilfe-Button rückt über die Leiste unten (wie bei der Kaufleiste auf Produktseiten)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => (mq.matches ? document.documentElement.setAttribute("data-sticky-buy", "") : document.documentElement.removeAttribute("data-sticky-buy"));
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      document.documentElement.removeAttribute("data-sticky-buy");
    };
  }, []);

  const groups = useMemo(() => {
    const sorts = products
      .filter((p) => !p.onRequest && p.variants.length === 1)
      .map((p): Sort & { group?: string } => {
        const v = p.variants[0];
        return { product: p, variantId: v.id, price: v.price, cans: cansOf(v), available: v.available, perLitre: unitPriceLabel(p, v), group: GROUPS.find((g) => p.collections.includes(g)) };
      })
      .filter((s) => s.group);
    return GROUPS.map((g) => ({ handle: g, title: collections.find((c) => c.handle === g)?.title ?? g, sorts: sorts.filter((s) => s.group === g) })).filter((g) => g.sorts.length);
  }, [products, collections]);

  const all = groups.flatMap((g) => g.sorts);
  const chosen = all.filter((s) => s.available && (qty[s.product.handle] ?? 0) > 0).map((s) => ({ ...s, n: qty[s.product.handle] }));
  const trays = chosen.reduce((a, s) => a + s.n, 0);
  const cans = chosen.reduce((a, s) => a + s.n * s.cans, 0);
  const total = chosen.reduce((a, s) => a + s.n * s.price, 0);
  const freeFrom = settings.shipping.freeFrom;

  const set = (handle: string, n: number) => {
    setAdded(false);
    setQty((q) => ({ ...q, [handle]: Math.max(0, Math.min(MAX_PER_SORT, n)) }));
  };

  const addToCart = () => {
    for (const s of chosen) cart.add(s.product.handle, s.variantId, s.n);
    setQty({});
    setAdded(true);
  };

  const summary = (
    <div className="rounded-[2rem] border border-line bg-card p-6">
      <p className="t-eyebrow">Dein Mix</p>
      {trays ? (
        <>
          <ul aria-hidden className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(1.6rem,1fr))] gap-1.5">
            {chosen.flatMap((s) =>
              Array.from({ length: s.n }, (_, i) => (
                <li
                  className="aspect-[4/3] rounded-[4px] border border-white/10"
                  key={`${s.product.handle}-${i}`}
                  style={{ background: `linear-gradient(135deg, ${SORT_COLORS[s.product.handle] ?? "#a8e652"}, color-mix(in srgb, ${SORT_COLORS[s.product.handle] ?? "#a8e652"} 40%, #000))` }}
                />
              ))
            )}
          </ul>
          <ul className="mt-5 space-y-1.5 text-sm">
            {chosen.map((s) => (
              <li className="flex justify-between gap-3" key={s.product.handle}>
                <span>
                  {s.n} × {s.product.title}
                </span>
                <span className="tabular-nums">{formatPrice(s.n * s.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-baseline justify-between border-line border-t pt-4">
            <span className="font-medium">
              {trays} {trays === 1 ? "Tray" : "Trays"} · {cans.toLocaleString("de-DE")} Stück
            </span>
            <span className="font-bold text-xl tabular-nums">{formatPrice(total)}</span>
          </p>
          <p className="t-small mt-1 text-muted">
            inkl. MwSt., zzgl. {formatPrice(cans * DEPOSIT_PER_CAN)} Pfand und Versand
            {freeFrom ? (total >= freeFrom ? " · versandkostenfrei" : ` · ab ${formatPrice(freeFrom)} versandkostenfrei`) : ""}
          </p>
        </>
      ) : (
        <p className="mt-3 text-muted">Wähle mit + die Trays, die du möchtest – jede Sorte so oft du willst.</p>
      )}
      <button
        className="anim-shine relative mt-5 inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-accent font-bold text-black transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        disabled={!trays}
        onClick={addToCart}
        type="button"
      >
        Mix in den Warenkorb <ArrowIcon />
      </button>
      {added ? (
        <p className="mt-3 flex items-center gap-2 text-sm" role="status">
          <CheckIcon className="size-4 text-accent" /> Im Warenkorb – jede Sorte als eigene Position.
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-10 pb-28 lg:grid-cols-[1fr_22rem] lg:pb-0">
      <div className="space-y-12">
        {groups.map((g) => (
          <section key={g.handle}>
            <h2 className="t-h3 mb-4">{g.title}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {g.sorts.map((s) => {
                const n = qty[s.product.handle] ?? 0;
                return (
                  <li
                    className={`relative flex flex-col rounded-[1.5rem] border bg-card p-4 transition ${n ? "border-accent" : "border-line"} ${s.available ? "" : "opacity-55"}`}
                    key={s.product.handle}
                  >
                    <span className="relative mx-auto block h-32 w-20">
                      <Image alt="" className="object-contain [filter:drop-shadow(0_12px_12px_rgba(0,0,0,0.5))]" fill sizes="80px" src={`/dosen-foto/frei/${s.product.handle}.webp`} />
                    </span>
                    <span className="mt-3 block font-medium leading-tight">{s.product.title}</span>
                    <span className="t-small block text-muted">
                      {formatPrice(s.price)} · {s.cans} {s.product.productType === "Mineralwasser" ? "Flaschen" : "Dosen"}
                    </span>
                    {s.perLitre ? <span className="block text-muted text-xs">({s.perLitre})</span> : null}
                    <span className="flex-1" />
                    {s.available ? (
                      <span className="mt-3 flex items-center justify-between rounded-full border border-line">
                        <button aria-label={`${s.product.title}: ein Tray weniger`} className="flex size-10 items-center justify-center rounded-full transition hover:text-accent disabled:opacity-30" disabled={!n} onClick={() => set(s.product.handle, n - 1)} type="button">
                          <MinusIcon />
                        </button>
                        <span aria-live="polite" className="font-bold tabular-nums">
                          {n}
                        </span>
                        <button aria-label={`${s.product.title}: ein Tray mehr`} className="flex size-10 items-center justify-center rounded-full transition hover:text-accent disabled:opacity-30" disabled={n >= MAX_PER_SORT} onClick={() => set(s.product.handle, n + 1)} type="button">
                          <PlusIcon />
                        </button>
                      </span>
                    ) : (
                      <span className="mt-3 flex h-10 items-center justify-center rounded-full border border-line font-bold text-muted text-xs uppercase tracking-wide">Ausverkauft</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">{summary}</aside>

      {/* Handy: Summe und Knopf immer sichtbar */}
      <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-full border border-line bg-card p-2 pl-5 shadow-[0_20px_60px_-15px_rgba(20,20,20,0.35)] lg:hidden" data-print-hide>
        <span className="min-w-0 flex-1">
          <span className="block font-bold tabular-nums">{formatPrice(total)}</span>
          <span className="t-small block text-muted">
            {trays} {trays === 1 ? "Tray" : "Trays"} · zzgl. Pfand
          </span>
        </span>
        <button className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-accent px-5 font-bold text-black transition hover:bg-accent-dark disabled:bg-line disabled:text-muted" disabled={!trays} onClick={addToCart} type="button">
          In den Warenkorb
        </button>
      </div>
    </div>
  );
}
