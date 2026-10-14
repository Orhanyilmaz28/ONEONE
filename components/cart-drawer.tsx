"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { depositFor, formatPrice } from "@/lib/format";
import { MIX_TIERS } from "@/lib/mix";
import { SORT_COLORS } from "@/lib/pack-contents";
import { useShopData } from "@/lib/shop-data";
import { ArrowIcon, CloseIcon, MinusIcon, PlusIcon } from "./icons";
import { LogoMark } from "./logo";
import { ProductImage } from "./product-image";
import { Rolling } from "./rolling";
import { shippingRules } from "./trust";

/** Sortenfarbe als halbtransparentes rgba (für das kurze Aufleuchten neuer Zeilen) */
function tint(handle: string, alpha: number) {
  const hex = (SORT_COLORS[handle] ?? "#a8e652").replace("#", "");
  const n = Number.parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function CartDrawer() {
  const { lines, subtotal, isOpen, close, setQuantity, setLine, count, mix } = useCart();
  const { products } = useShopData();
  // Sorten, die man im Warenkorb noch dazunehmen kann (verfügbar und noch nicht drin)
  const addable = products.filter((p) => p.variants.length === 1 && p.variants[0].available && !p.onRequest && !lines.some((l) => l.handle === p.handle));
  const net = subtotal - mix.discount;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Versandkosten aus den Einstellungen im Dashboard
  const shipping = shippingRules(useShopData().settings.shipping);
  const freeFrom = shipping.freeFrom;
  const deposit = lines.reduce((n, l) => n + depositFor(l.variant, l.quantity), 0);
  const remaining = freeFrom ? Math.max(0, freeFrom - net) : 0;
  const progress = freeFrom ? Math.min(1, net / freeFrom) : 1;

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Tastatur & Screenreader: Fokus in den Warenkorb – beim Schließen zurück, wo er vorher war
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen, close]);

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!(res.ok && data.url)) {
        throw new Error(data.error ?? "Checkout fehlgeschlagen");
      }
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  // Fortschritt zur nächsten Mix-Rabattstufe (zählt erst ab 2 Sorten)
  const prevMin = [...MIX_TIERS].reverse().find((t) => t.min <= mix.trays)?.min ?? 0;
  const mixProgress = mix.sorts < 2 ? 0 : mix.next ? Math.max(0, Math.min(1, (mix.trays - prevMin) / (mix.next.trays - prevMin))) : 1;

  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            animate={{ x: 0 }}
            aria-label="Warenkorb"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-paper shadow-2xl"
            exit={{ x: "100%" }}
            initial={{ x: "100%" }}
            role="dialog"
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <header className="flex items-center justify-between border-line border-b px-6 py-5">
              <h2 className="t-h3">
                Warenkorb <span className="text-muted text-base">({count})</span>
              </h2>
              <button
                aria-label="Warenkorb schließen"
                className="rounded-full p-2 transition hover:bg-cream"
                onClick={close}
                ref={closeRef}
                type="button"
              >
                <CloseIcon />
              </button>
            </header>

            {/* Hinweis zum kostenlosen Versand – entfällt, wenn es im Shop keinen gibt */}
            {lines.length > 0 && (freeFrom || shipping.alwaysFree) ? (
              <div className="border-line border-b px-6 py-4">
                <p className="text-sm">
                  {remaining > 0 ? (
                    <>
                      Noch <strong>{formatPrice(remaining)}</strong> bis zum kostenlosen Versand
                    </>
                  ) : (
                    <>🎉 Du erhältst <strong>kostenlosen Versand</strong></>
                  )}
                </p>
                {freeFrom ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
                    <motion.div
                      animate={{ width: `${progress * 100}%` }}
                      className="h-full rounded-full bg-accent"
                      initial={false}
                      transition={{ type: "spring", damping: 25 }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <LogoMark className="anim-bob mb-2 h-16 w-auto text-ink/20" />
                  <p className="t-h3">Dein Warenkorb ist leer</p>
                  <p className="text-muted text-sm">Such dir deine Lieblingssorten aus.</p>
                  <Link
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-paper text-sm transition hover:bg-accent"
                    href="/products"
                    onClick={close}
                  >
                    Jetzt stöbern <ArrowIcon />
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {lines.map((line) => (
                      <motion.li
                        animate={{ opacity: 1, height: "auto", backgroundColor: tint(line.handle, 0) }}
                        className="-mx-3 overflow-hidden rounded-2xl px-3"
                        exit={{ opacity: 0, height: 0 }}
                        initial={{ opacity: 0, height: 0, backgroundColor: tint(line.handle, 0.22) }}
                        key={line.variantId}
                        layout
                        transition={{ backgroundColor: { duration: 1.4, ease: "easeOut" }, default: { type: "spring", stiffness: 380, damping: 34 } }}
                      >
                        <div className="flex gap-4 py-4">
                          <Link
                            className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-cream"
                            href={`/products/${line.handle}`}
                            onClick={close}
                          >
                            <ProductImage aiLabel="compact" product={line.product} sizes="96px" />
                          </Link>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{line.product.title}</p>
                                {line.product.variants.length > 1 ? (
                                  <p className="text-muted text-sm">{line.variant.title}</p>
                                ) : null}
                              </div>
                              <p className="shrink-0 text-sm tabular-nums">
                                <Rolling cents={line.variant.price * line.quantity} />
                              </p>
                            </div>
                            <div className="mt-auto flex items-center justify-between">
                              <div className="flex items-center rounded-full border border-line">
                                <button
                                  aria-label="Menge verringern"
                                  className="p-2 transition hover:text-accent"
                                  onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                                  type="button"
                                >
                                  <MinusIcon className="size-3.5" />
                                </button>
                                <span className="relative w-6 overflow-hidden text-center text-sm tabular-nums">
                                  <AnimatePresence initial={false} mode="popLayout">
                                    <motion.span animate={{ y: 0, opacity: 1 }} className="inline-block" exit={{ y: -10, opacity: 0 }} initial={{ y: 10, opacity: 0 }} key={line.quantity} transition={{ duration: 0.18 }}>
                                      {line.quantity}
                                    </motion.span>
                                  </AnimatePresence>
                                </span>
                                <button
                                  aria-label="Menge erhöhen"
                                  className="p-2 transition hover:text-accent"
                                  onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                                  type="button"
                                >
                                  <PlusIcon className="size-3.5" />
                                </button>
                              </div>
                              <button
                                className="text-muted text-xs underline-offset-4 hover:underline"
                                onClick={() => setQuantity(line.variantId, 0)}
                                type="button"
                              >
                                Entfernen
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
              {lines.length > 0 ? (
                <section aria-label="Mix zusammenstellen" className="mt-3 rounded-2xl border border-line p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm">Mix zusammenstellen</p>
                    <AnimatePresence initial={false} mode="popLayout">
                      {mix.pct > 0 ? (
                        <motion.span
                          animate={{ scale: [0.6, 1.15, 1], opacity: 1 }}
                          className="rounded-full bg-accent px-2.5 py-0.5 font-bold text-black text-xs"
                          exit={{ scale: 0.6, opacity: 0 }}
                          initial={{ scale: 0.6, opacity: 0 }}
                          key={mix.pct}
                          transition={{ duration: 0.45, ease: "easeOut" }}
                        >
                          −{mix.pct} %
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <p className="mt-1 text-muted text-xs">
                    {mix.sorts < 2
                      ? "Nimm eine zweite Sorte dazu – ab 2 Trays gemischt gibt es 3 % Mix-Rabatt."
                      : mix.next
                        ? `Noch ${mix.next.missing} ${mix.next.missing === 1 ? "Tray" : "Trays"} bis ${mix.next.pct} % Mix-Rabatt.`
                        : `Höchster Mix-Rabatt erreicht: ${mix.pct} %.`}
                  </p>
                  <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
                    <motion.div animate={{ width: `${mixProgress * 100}%` }} className="h-full rounded-full bg-accent" initial={false} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
                  </div>
                  {addable.length ? (
                    <motion.ul className="mt-3 grid grid-cols-2 gap-2" layout>
                      <AnimatePresence initial={false}>
                        {addable.map((p) => (
                          <motion.li animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} initial={{ opacity: 0, scale: 0.85 }} key={p.handle} layout transition={{ duration: 0.2 }}>
                            <button
                              aria-label={`1 Tray ${p.title} hinzufügen`}
                              className="flex w-full items-center gap-2 rounded-xl border border-line p-1.5 pr-2 text-left text-xs transition hover:border-accent"
                              onClick={() => setLine(p.handle, p.variants[0].id, 1)}
                              style={{ ["--c" as string]: SORT_COLORS[p.handle] ?? "#a8e652" }}
                              type="button"
                            >
                              <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-cream">
                                <ProductImage product={p} sizes="36px" />
                              </span>
                              <span className="min-w-0 flex-1 leading-tight">{p.title}</span>
                              <PlusIcon className="size-3.5 shrink-0 text-[var(--c)]" />
                            </button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </motion.ul>
                  ) : null}
                  <Link className="mt-3 inline-block text-accent text-xs underline-offset-4 hover:underline" href="/mix" onClick={close}>
                    Im Mix-Konfigurator öffnen →
                  </Link>
                </section>
              ) : null}
            </div>

            {lines.length > 0 ? (
              <footer className="space-y-4 border-line border-t px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted">Zwischensumme</span>
                  <span className="t-h3 tabular-nums">
                    <Rolling cents={subtotal} />
                  </span>
                </div>
                <AnimatePresence initial={false}>
                {mix.discount > 0 ? (
                  <motion.div animate={{ opacity: 1, height: "auto" }} className="flex items-baseline justify-between overflow-hidden text-sm" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} key="mix-rabatt">
                    <span className="text-accent">
                      Mix-Rabatt ({mix.pct} %, {mix.sorts} Sorten · {mix.trays} Trays)
                    </span>
                    <span className="text-accent tabular-nums">
                      <Rolling cents={mix.discount} prefix="−" />
                    </span>
                  </motion.div>
                ) : null}
                </AnimatePresence>
                {deposit > 0 ? (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Einwegpfand (0,25 € je Dose/Flasche)</span>
                    <span className="tabular-nums">
                      <Rolling cents={deposit} />
                    </span>
                  </div>
                ) : null}
                <p className="text-muted text-xs">
                  {shipping.alwaysFree
                    ? "inkl. MwSt. – der Versand ist kostenlos."
                    : "inkl. MwSt., zzgl. Pfand und Versand – wird im nächsten Schritt berechnet."}
                </p>
                {error ? (
                  <p className="rounded-xl bg-accent/10 px-3 py-2 text-accent-dark text-sm">{error}</p>
                ) : null}
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 font-medium text-paper transition hover:bg-accent disabled:opacity-60"
                  disabled={loading}
                  onClick={checkout}
                  type="button"
                >
                  {loading ? "Weiterleitung …" : "Sicher zur Kasse"}
                  {loading ? null : <ArrowIcon />}
                </button>
                <p className="text-center text-muted text-xs">
                  Kreditkarte · PayPal · Apple Pay · Google Pay · Klarna · SEPA
                </p>
              </footer>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
    </MotionConfig>
  );
}
