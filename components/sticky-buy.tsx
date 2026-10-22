"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { ArrowIcon } from "./icons";
import { ProductImage } from "./product-image";

/** Schwebende Kaufleiste – erscheint, sobald der Kaufbereich aus dem Bild scrollt. */
export function StickyBuy({ product }: { product: Product }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById("kaufen");
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(target);
    return () => {
      io.disconnect();
      document.documentElement.removeAttribute("data-sticky-buy");
    };
  }, []);
  useEffect(() => {
    // Hilfe-Button rückt nach oben, solange die Kaufleiste sichtbar ist
    if (show) document.documentElement.setAttribute("data-sticky-buy", "");
    else document.documentElement.removeAttribute("data-sticky-buy");
  }, [show]);
  const price = Math.min(...product.variants.map((v) => v.price));
  // Ein einziges Angebot (z. B. 24er Tray): kein „Größe wählen“; ausverkauft: kein Kauf-Knopf
  const single = product.variants.length === 1;
  const available = product.variants.some((v) => v.available);
  const { add } = useCart();
  const btn = "anim-shine relative inline-flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-accent px-4 font-medium text-black text-sm transition hover:bg-accent-dark sm:px-5 sm:text-base";
  return (
    <div
      className={`fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl items-center gap-3 rounded-full border border-line bg-card p-2 pr-2 shadow-[0_20px_60px_-15px_rgba(20,20,20,0.35)] transition-all duration-500 sm:inset-x-6 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"
      }`}
      data-print-hide
      // Unsichtbar = weder klick- noch per Tab erreichbar und für Screenreader ausgeblendet
      inert={!show}
    >
      {/* Auf schmalen Handys ohne Bild und Namen – sonst wird der Preis zerquetscht */}
      <span aria-hidden className="relative hidden size-12 shrink-0 overflow-hidden rounded-full bg-cream sm:block">
        <ProductImage aiLabel="compact" product={product} sizes="48px" />
      </span>
      <span className="min-w-0 flex-1 pl-2 sm:pl-0">
        <span className="hidden truncate font-medium sm:block">{product.title}</span>
        <span className="block font-bold text-sm sm:hidden">{formatPrice(price)}</span>
        <span className="block text-[11px] text-muted leading-tight sm:text-sm sm:leading-normal">
          <span className="hidden sm:inline">{formatPrice(price)} · </span>inkl. MwSt., zzgl. Pfand und Versand
        </span>
      </span>
      {available && single ? (
        // Ein einziges Angebot (z. B. 24er Tray): direkt in den Warenkorb
        <button className={btn} onClick={() => add(product.handle, product.variants[0].id)} type="button">
          In den Warenkorb
          <span className="hidden sm:inline-flex">
            <ArrowIcon />
          </span>
        </button>
      ) : available ? (
        <a className={btn} href="#kaufen">
          <span className="hidden sm:inline">Größe wählen</span>
          <span className="sm:hidden">Wählen</span>
          <ArrowIcon />
        </a>
      ) : (
        <span className="inline-flex h-12 shrink-0 items-center rounded-full border border-line px-5 text-muted">Ausverkauft</span>
      )}
    </div>
  );
}
