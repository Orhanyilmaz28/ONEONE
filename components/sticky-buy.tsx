"use client";

import { useEffect, useState } from "react";
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
  return (
    <div
      className={`fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl items-center gap-3 rounded-full border border-line bg-white p-2 pr-2 shadow-[0_20px_60px_-15px_rgba(20,20,20,0.35)] transition-all duration-500 sm:inset-x-6 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"
      }`}
      data-print-hide
      // Unsichtbar = weder klick- noch per Tab erreichbar und für Screenreader ausgeblendet
      inert={!show}
    >
      <span aria-hidden className="relative size-12 shrink-0 overflow-hidden rounded-full bg-cream">
        <ProductImage aiLabel="compact" product={product} sizes="48px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{product.title}</span>
        <span className="t-small block text-muted">{formatPrice(price)} · inkl. MwSt., zzgl. Versand</span>
      </span>
      <a className="anim-shine relative inline-flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-full bg-ink px-5 font-medium text-white transition hover:bg-black" href="#kaufen">
        <span className="hidden sm:inline">Größe wählen</span>
        <span className="sm:hidden">Kaufen</span>
        <ArrowIcon />
      </a>
    </div>
  );
}
