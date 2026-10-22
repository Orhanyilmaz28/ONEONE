"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Rolling, RollingInt } from "@/components/rolling";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { useCart } from "@/lib/cart";
import { basePricePerLiter, cansOf, depositFor, formatPrice, volumeMlOf } from "@/lib/format";
import { MIX_TIERS, mixDiscount } from "@/lib/mix";
import { SORT_COLORS } from "@/lib/pack-contents";
import type { Product } from "@/lib/types";

/** Mix zusammenstellen: Mengen je Sorte (ganze Trays) – wirkt direkt auf den Warenkorb */
export function MixConfigurator({ products, groups }: { products: Product[]; groups: { title: string; handles: string[] }[] }) {
  const { lines, setLine, open } = useCart();
  const qty = (p: Product) => lines.find((l) => l.variantId === p.variants[0].id)?.quantity ?? 0;
  const chosen = products.filter((p) => qty(p) > 0);
  const mix = mixDiscount(chosen.map((p) => ({ handle: p.handle, quantity: qty(p), price: p.variants[0].price })));
  const deposit = chosen.reduce((n, p) => n + depositFor(p.variants[0], qty(p)), 0);
  const byHandle = new Map(products.map((p) => [p.handle, p]));

  // Tray-Raster: Reihenfolge wie die Sorten im Mix
  const blocks = chosen.flatMap((p) => Array.from({ length: qty(p) }, (_, i) => ({ key: `${p.handle}-${i}`, color: SORT_COLORS[p.handle] ?? "#a8e652", title: p.title })));
  // Fortschritt zur nächsten Rabattstufe (erst ab 2 Sorten zählt der Rabatt)
  const prevMin = [...MIX_TIERS].reverse().find((t) => t.min <= mix.trays)?.min ?? 0;
  const progress = mix.next ? Math.max(0, Math.min(1, (mix.trays - prevMin) / (mix.next.trays - prevMin))) : 1;

  return (
    <MotionConfig reducedMotion="user">
    <div className="grid grid-cols-1 gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-20">
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
                  <li
                    className="flex items-center gap-4 rounded-[1.25rem] border border-line bg-card p-3 transition-[box-shadow,border-color] duration-500"
                    key={h}
                    style={q > 0 ? { borderColor: `color-mix(in srgb, ${SORT_COLORS[h] ?? "#a8e652"} 70%, transparent)`, boxShadow: `0 0 28px -8px ${SORT_COLORS[h] ?? "#a8e652"}` } : undefined}
                  >
                    <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-cream">
                      <ProductImage product={p} sizes="80px" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-muted text-sm">
                        {formatPrice(v.price)} je {v.title.replace(" Tray", "-Tray")}
                        {basePricePerLiter(v.price, cansOf(v), volumeMlOf(p)) ? ` · ${basePricePerLiter(v.price, cansOf(v), volumeMlOf(p))}` : ""}
                      </span>
                    </span>
                    {v.available ? (
                      <span className="flex items-center rounded-full border border-line">
                        <button aria-label={`${p.title}: ein Tray weniger`} className="p-2.5 transition hover:text-accent disabled:opacity-30" disabled={q === 0} onClick={() => setLine(h, v.id, q - 1)} type="button">
                          <MinusIcon className="size-3.5" />
                        </button>
                        <span aria-live="polite" className="relative w-7 overflow-hidden text-center tabular-nums">
                          <AnimatePresence initial={false} mode="popLayout">
                            <motion.span animate={{ y: 0, opacity: 1 }} className="inline-block" exit={{ y: -10, opacity: 0 }} initial={{ y: 10, opacity: 0 }} key={q} transition={{ duration: 0.18 }}>
                              {q}
                            </motion.span>
                          </AnimatePresence>
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
          <TrayGrid blocks={blocks} />
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
                <RollingInt value={mix.trays} /> {mix.trays === 1 ? "Tray" : "Trays"} · {mix.sorts} {mix.sorts === 1 ? "Sorte" : "Sorten"}
              </dt>
              <dd className="tabular-nums">
                <Rolling cents={mix.subtotal} />
              </dd>
            </div>
            {mix.discount > 0 ? (
              <div className="flex justify-between text-accent">
                <dt>Mix-Rabatt {mix.pct} %</dt>
                <dd className="tabular-nums">
                  <Rolling cents={mix.discount} prefix="−" />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between font-medium text-base">
              <dt>Summe</dt>
              <dd className="tabular-nums">
                <Rolling cents={mix.subtotal - mix.discount} />
              </dd>
            </div>
            {deposit > 0 ? (
              <div className="flex justify-between text-muted text-xs">
                <dt>zzgl. Einwegpfand</dt>
                <dd className="tabular-nums">
                  <Rolling cents={deposit} />
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4 rounded-xl bg-cream px-3 py-2.5 text-xs">
          <p>
            {mix.trays === 0
              ? "Ab 2 verschiedenen Sorten gibt es Mix-Rabatt."
              : mix.sorts < 2
                ? "Nimm eine zweite Sorte dazu – dann gibt es Mix-Rabatt."
                : mix.next
                  ? `Noch ${mix.next.missing} ${mix.next.missing === 1 ? "Tray" : "Trays"} bis ${mix.next.pct} % Mix-Rabatt.`
                  : "Höchster Mix-Rabatt erreicht."}
          </p>
          <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
            <motion.div animate={{ width: `${(mix.sorts >= 2 || mix.trays === 0 ? progress : 0) * 100}%` }} className="h-full rounded-full bg-accent" initial={false} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
          </div>
          </div>

          <ul aria-label="Rabattstufen" className="mt-4 grid grid-cols-4 gap-1.5 text-center text-xs">
            {MIX_TIERS.map((t) => {
              const reached = mix.sorts >= 2 && mix.trays >= t.min;
              const current = reached && mix.pct === t.pct;
              return (
                <motion.li
                  animate={current ? { scale: [1, 1.14, 1], boxShadow: ["0 0 0 0 rgba(168,230,82,0)", "0 0 22px 2px rgba(168,230,82,0.55)", "0 0 10px 0 rgba(168,230,82,0.25)"] } : { scale: 1, boxShadow: "0 0 0 0 rgba(168,230,82,0)" }}
                  className={`rounded-lg border px-1 py-1.5 transition-colors duration-500 ${current ? "border-accent bg-accent/15" : reached ? "border-accent/40" : "border-line text-muted"}`}
                  key={t.min}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <span className="block font-bold">−{t.pct} %</span>
                  <span className="block">ab {t.min}</span>
                </motion.li>
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

      {/* Handy/Tablet: Zusammenfassung immer sichtbar unten – kein Scrollen zur Box „Dein Mix“ nötig */}
      <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-full border border-line bg-card/95 p-2 pl-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur lg:hidden" data-mix-bar data-print-hide>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm tabular-nums">
            <RollingInt value={mix.trays} /> {mix.trays === 1 ? "Tray" : "Trays"} · <Rolling cents={mix.subtotal - mix.discount} />
          </span>
          <span className="block truncate text-muted text-xs">
            {mix.sorts < 2 ? "Ab 2 Sorten Mix-Rabatt" : mix.next ? `Noch ${mix.next.missing} bis ${mix.next.pct} %` : "Höchster Rabatt"}
          </span>
        </span>
        <AnimatePresence initial={false} mode="popLayout">
          {mix.pct > 0 ? (
            <motion.span animate={{ scale: [0.6, 1.15, 1], opacity: 1 }} className="rounded-full bg-accent/15 px-2.5 py-1 font-bold text-accent text-xs" exit={{ scale: 0.6, opacity: 0 }} initial={{ scale: 0.6, opacity: 0 }} key={mix.pct} transition={{ duration: 0.45 }}>
              −{mix.pct} %
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button className="h-11 shrink-0 rounded-full bg-accent px-5 font-bold text-black text-sm transition hover:bg-accent-dark disabled:opacity-50" disabled={chosen.length === 0} onClick={open} type="button">
          Warenkorb
        </button>
      </div>
    </div>
    </MotionConfig>
  );
}

const MAX_BLOCKS = 48;

/** Tray-Raster: ein Kästchen je Tray in der Sortenfarbe – neue Trays ploppen hinein */
function TrayGrid({ blocks }: { blocks: { key: string; color: string; title: string }[] }) {
  const shown = blocks.slice(0, MAX_BLOCKS);
  return (
    <div className="mt-4">
      <ul aria-label={`${blocks.length} Trays im Mix`} className="grid min-h-6 grid-cols-8 gap-1.5">
        <AnimatePresence initial={false}>
          {shown.map((b) => (
            <motion.li
              animate={{ scale: 1, opacity: 1 }}
              className="aspect-[4/3] rounded-[4px] border border-white/10"
              exit={{ scale: 0, opacity: 0 }}
              initial={{ scale: 0, opacity: 0 }}
              key={b.key}
              layout
              style={{ background: `linear-gradient(135deg, ${b.color}, color-mix(in srgb, ${b.color} 40%, #000))` }}
              title={b.title}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
            />
          ))}
        </AnimatePresence>
      </ul>
      {blocks.length > MAX_BLOCKS ? <p className="mt-1 text-muted text-xs">+ {blocks.length - MAX_BLOCKS} weitere Trays</p> : null}
    </div>
  );
}
