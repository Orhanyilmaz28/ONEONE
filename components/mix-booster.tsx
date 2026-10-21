"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { MIX_MAX as max, MIX_TIERS, type MixResult } from "@/lib/mix";
import { PlusIcon } from "./icons";

/**
 * Auffälliger Rabatt-Hinweis oben im Warenkorb: „Nimm mehr Trays – krieg mehr Rabatt“.
 * Zeigt die nächste Stufe, was sie spart, eine Stufenleiste und einen Knopf für +1 Tray.
 */
export function MixBooster({ mix, sim, addLabel, onAdd }: { mix: MixResult; sim: MixResult; addLabel?: string; onAdd?: () => void }) {
  const extra = Math.max(0, sim.discount - mix.discount);
  let title: string;
  let text: string;
  if (mix.sorts < 2) {
    title = `Mix 2 Sorten – spar ${sim.pct} %`;
    text = extra ? `Leg 1 Tray einer zweiten Sorte dazu und spar sofort ${formatPrice(extra)}.` : "Ab 2 verschiedenen Sorten gibt es Mix-Rabatt.";
  } else if (mix.next) {
    title = mix.next.missing === 1 ? `Nur 1 Tray mehr = −${mix.next.pct} %` : `Noch ${mix.next.missing} Trays bis −${mix.next.pct} %`;
    text = mix.pct
      ? `Jetzt sparst du ${formatPrice(mix.discount)} – mit −${mix.next.pct} % sparst du ${formatPrice(sim.discount)}.`
      : `Nimm mehr Trays, krieg mehr Rabatt – bis zu ${max} %.`;
  } else {
    title = `Maximaler Mix-Rabatt: −${mix.pct} %`;
    text = `Stark! Du sparst ${formatPrice(mix.discount)} auf deinen Mix.`;
  }
  const reached = mix.sorts >= 2 ? mix.pct : 0;

  // Kleiner Funkenregen, sobald eine neue Stufe erreicht ist
  const prev = useRef(reached);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (reached > prev.current) setBurst((n) => n + 1);
    prev.current = reached;
  }, [reached]);

  return (
    <section aria-label="Mix-Rabatt" aria-live="polite" className="mix-booster relative overflow-hidden rounded-2xl p-3 text-black sm:p-4 shadow-[0_12px_30px_-12px_rgba(168,230,82,0.7)]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="hidden font-bold text-[11px] uppercase tracking-[0.14em] opacity-70 sm:block">Mehr Trays · mehr Rabatt</p>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="font-black text-base leading-tight sm:mt-0.5 sm:text-lg"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 8 }}
              key={title}
              transition={{ duration: 0.25 }}
            >
              {title}
            </motion.p>
          </AnimatePresence>
          {/* Handy: Erklärsatz weglassen, damit im Warenkorb Platz für die Artikel bleibt */}
          <p className="mt-1 hidden text-[13px] leading-snug sm:block">{text}</p>
        </div>
        <div className="relative shrink-0">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              className="booster-glow flex size-12 flex-col sm:size-16 items-center justify-center rounded-full bg-black text-center font-black text-accent leading-none"
              exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.15 } }}
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              key={reached}
              transition={{ type: "spring", stiffness: 420, damping: 14 }}
            >
              {reached ? (
                <span className="text-base sm:text-xl">−{reached}%</span>
              ) : (
                <>
                  <span className="text-[10px] uppercase">bis</span>
                  <span className="text-base sm:text-xl">−{max}%</span>
                </>
              )}
            </motion.span>
          </AnimatePresence>
          {/* Funken bei neuer Stufe */}
          <span aria-hidden className="pointer-events-none absolute inset-0" key={burst}>
            {burst
              ? Array.from({ length: 10 }, (_, i) => {
                  const a = (i / 10) * Math.PI * 2;
                  return (
                    <motion.span
                      animate={{ x: Math.cos(a) * 46, y: Math.sin(a) * 46, opacity: 0, scale: 0.4 }}
                      className="absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 rounded-full"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      key={`${burst}-${a}`}
                      style={{ background: i % 2 ? "#000" : "#fff" }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                    />
                  );
                })
              : null}
          </span>
        </div>
      </div>

      {/* Stufenleiste: jede Stufe ein Segment, erreichte Stufen füllen sich */}
      <ol aria-label="Rabattstufen" className="mt-2 flex gap-1 sm:mt-3">
        {MIX_TIERS.map((t) => {
          const on = mix.sorts >= 2 && mix.trays >= t.min;
          const isNext = mix.sorts >= 2 ? mix.next?.trays === t.min : t.min === MIX_TIERS[0].min;
          return (
            <li className="min-w-0 flex-1 text-center" key={t.min} title={`ab ${t.min} Trays: ${t.pct} %`}>
              <span className={`relative block h-2 overflow-hidden rounded-full bg-black/15 ${isNext ? "booster-next" : ""}`}>
                <motion.span
                  animate={{ scaleX: on ? 1 : 0 }}
                  className="absolute inset-0 origin-left rounded-full bg-black"
                  initial={false}
                  transition={{ type: "spring", stiffness: 200, damping: 22 }}
                />
              </span>
              <span className={`mt-1 block text-[10px] tabular-nums ${on ? "font-black" : "opacity-60"}`}>{t.pct}%</span>
            </li>
          );
        })}
      </ol>

      {onAdd && addLabel && (mix.sorts < 2 || mix.next) ? (
        <button
          className="booster-nudge mt-2 inline-flex h-9 w-full sm:mt-3 sm:h-10 items-center justify-center gap-2 rounded-full bg-black px-4 font-bold text-accent text-sm transition hover:scale-[1.02] active:scale-95"
          onClick={onAdd}
          type="button"
        >
          <PlusIcon className="size-3.5" />
          {addLabel}
        </button>
      ) : null}
    </section>
  );
}
