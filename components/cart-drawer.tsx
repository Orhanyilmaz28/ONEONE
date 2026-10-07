"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { depositFor, formatPrice } from "@/lib/format";
import { useShopData } from "@/lib/shop-data";
import { ArrowIcon, CloseIcon, MinusIcon, PlusIcon } from "./icons";
import { LogoMark } from "./logo";
import { ProductImage } from "./product-image";
import { shippingRules } from "./trust";

export function CartDrawer() {
  const { lines, subtotal, isOpen, close, setQuantity, count } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Versandkosten aus den Einstellungen im Dashboard
  const shipping = shippingRules(useShopData().settings.shipping);
  const freeFrom = shipping.freeFrom;
  const deposit = lines.reduce((n, l) => n + depositFor(l.variant, l.quantity), 0);
  const remaining = freeFrom ? Math.max(0, freeFrom - subtotal) : 0;
  const progress = freeFrom ? Math.min(1, subtotal / freeFrom) : 1;

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

  return (
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
                        animate={{ opacity: 1, height: "auto" }}
                        className="overflow-hidden"
                        exit={{ opacity: 0, height: 0 }}
                        initial={{ opacity: 0, height: 0 }}
                        key={line.variantId}
                        layout
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
                              <p className="shrink-0 text-sm">
                                {formatPrice(line.variant.price * line.quantity)}
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
                                <span className="w-6 text-center text-sm tabular-nums">
                                  {line.quantity}
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
            </div>

            {lines.length > 0 ? (
              <footer className="space-y-4 border-line border-t px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted">Zwischensumme</span>
                  <span className="t-h3">{formatPrice(subtotal)}</span>
                </div>
                {deposit > 0 ? (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Einwegpfand (0,25 € je Dose)</span>
                    <span>{formatPrice(deposit)}</span>
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
  );
}
