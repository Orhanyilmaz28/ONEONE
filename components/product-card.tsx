"use client";

import Link from "next/link";
import { useRef } from "react";
import { useCart } from "@/lib/cart";
import { cansOf } from "@/lib/format";
import { getSold } from "@/lib/reviews";
import { useRating } from "@/lib/shop-data";
import { formatAverage, Stars } from "./stars";
import type { Product } from "@/lib/types";
import { Price } from "./price";
import { AiMediaLabel } from "./ai-media";
import { ProductImage } from "./product-image";

/**
 * Jede MP4 in public/video hat eine WebM-Schwester (VP9, etwa halb so groß) → WebM zuerst anbieten.
 * Externe Videos (z. B. nach einem Shopify-Import) bekommen nur ihre MP4.
 */
const hasWebm = (src: string) => /^\/video\/[\w-]+\.mp4$/.test(src);

/** Vorschau-Video nur bei echter Maus (Hover) und ohne „Bewegung reduzieren“ abspielen */
const canPreview = () => window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;

export function ProductCard({
  product,
  preload,
  reveal = true,
  className = "",
}: {
  product: Product;
  index?: number;
  /** Erstes Produktbild sofort laden (Karten im ersten Bildschirm) */
  preload?: boolean;
  reveal?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const videoRef = useRef<HTMLVideoElement>(null);
  const video = product.videos?.[0];
  const prices = product.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const cheapest = product.variants.find((v) => v.price === min);
  const available = product.variants.some((v) => v.available);
  const onSale = product.variants.some((v) => v.compareAtPrice !== undefined && v.compareAtPrice > v.price);
  const colorOption = product.options.find((o) => o.name.startsWith("Farbe"));
  // Sterne inklusive der im Dashboard veröffentlichten Bewertungen
  const rating = useRating(product.handle);
  const sold = getSold(product.handle);
  // Schnell hinzufügen nur bei einfachen Produkten (Farbe + Größe); sonst zur Produktseite
  const simple = product.options.every((o) => o.name === "Packung" || o.name === "Farbe" || o.name === "Größe");
  const quickVariants = !simple ? [] : colorOption ? product.variants.filter((v) => v.options.Farbe === colorOption.values[0]) : product.variants;
  const pack = product.packSize ?? 1;
  // Ein einziges Angebot (z. B. 24er Tray): direkt „Jetzt kaufen“ auf der Karte
  const single = simple && product.variants.length === 1 ? product.variants[0] : undefined;
  // Preis pro Dose: aus der günstigsten Variante (Packungsgröße), sonst aus der Paketgröße des Produkts
  const perUnit = cheapest ? cansOf(cheapest) : pack;
  const saving = cheapest?.compareAtPrice ? Math.round((1 - cheapest.price / cheapest.compareAtPrice) * 100) : 0;
  // KI-Kennzeichnung: Startbild unten links; beim Darüberfahren (Video bzw. zweites Foto) oben rechts – unten liegt dann „Schnell hinzufügen“
  const firstMedia = product.images[0];
  const hoverMedia = video ?? product.images[1] ?? product.images[0];

  return (
    <article className={`group relative ${reveal ? "sd-up" : ""} ${className}`}>
      <div
        className="relative overflow-hidden rounded-[1.75rem] bg-cream"
        data-tilt="4"
        onMouseEnter={() => {
          if (canPreview()) videoRef.current?.play().catch(() => {});
        }}
        onMouseLeave={() => {
          const v = videoRef.current;
          if (v) {
            v.pause();
            v.currentTime = 0;
          }
        }}
      >
        <Link aria-label={product.title} className="block" href={`/products/${product.handle}`}>
          <div className="relative aspect-[4/5]">
            <ProductImage
              className="transition-transform duration-[1.2s] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.05]"
              preload={preload}
              product={product}
            />
            {video ? (
              <>
                <video
                  aria-hidden
                  className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100 motion-reduce:hidden"
                  loop
                  muted
                  playsInline
                  preload="none"
                  ref={videoRef}
                >
                  {hasWebm(video.src) ? <source src={video.src.replace(/\.mp4$/, ".webm")} type='video/webm; codecs="vp9"' /> : null}
                  <source src={video.src} type="video/mp4" />
                </video>
                {/* Bei „Bewegung reduzieren“ statt Video das zweite Foto zeigen */}
                {product.images[1] ? (
                  <div className="absolute inset-0 hidden opacity-0 transition-opacity duration-700 group-hover:opacity-100 motion-reduce:block">
                    <ProductImage index={1} product={product} />
                  </div>
                ) : null}
              </>
            ) : product.images[1] ? (
              <div className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100">
                <ProductImage index={1} product={product} />
              </div>
            ) : null}
            <AiMediaLabel className="transition-opacity md:group-hover:opacity-0" src={firstMedia?.src} type={firstMedia?.type} />
            <AiMediaLabel className="opacity-0 transition-opacity md:group-hover:opacity-100" position="top-right" src={hoverMedia?.src} type={hoverMedia?.type} />
            {video ? (
              <span className="pointer-events-none absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-card/95 shadow-sm transition-opacity group-hover:opacity-0 motion-reduce:hidden">
                <svg aria-hidden className="ml-0.5 size-2.5" viewBox="0 0 10 12">
                  <path d="M0 0l10 6-10 6z" fill="currentColor" />
                </svg>
              </span>
            ) : null}
          </div>
        </Link>

        <div className="pointer-events-none absolute top-3 left-3 flex gap-1.5">
          {pack > 1 ? <span className="rounded-full bg-accent px-3 py-1 font-medium text-black text-xs">{pack} Dosen</span> : null}
          {onSale && saving ? <span className="rounded-full bg-[linear-gradient(135deg,#b5e86a,#ffe566)] px-3 py-1 font-medium text-black text-xs">−{saving} %</span> : null}
          {colorOption ? <ColorDots colors={colorOption.values} /> : null}
          {available ? null : <span className="rounded-full bg-card/90 px-3 py-1 text-muted text-xs">Ausverkauft</span>}
        </div>

        {available && quickVariants.length > 1 ? (
          <div className="absolute inset-x-3 bottom-3 hidden translate-y-4 rounded-2xl bg-card/95 p-3 opacity-0 shadow-lg transition-all duration-500 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 md:block">
            <p className="mb-2 text-center text-muted text-xs">
              Schnell hinzufügen{colorOption ? ` · ${colorOption.values[0]}` : ""}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {quickVariants.map((v) => (
                <button
                  aria-label={`${product.title} ${v.title} in den Warenkorb`}
                  className="min-w-10 rounded-full border border-line bg-card px-3 py-1.5 font-medium text-sm transition hover:border-ink hover:bg-accent hover:text-black disabled:opacity-40"
                  data-quick-add
                  disabled={!v.available}
                  key={v.id}
                  onClick={() => add(product.handle, v.id)}
                  type="button"
                >
                  {v.options["Größe"] ?? v.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 px-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-h3">
            <Link href={`/products/${product.handle}`}>{product.title}</Link>
          </h3>
          <Price className="shrink-0 pt-0.5 text-[15px]" compareAtPrice={cheapest?.compareAtPrice} from={new Set(prices).size > 1} price={min} />
        </div>
        {product.subtitle ? <p className="t-small mt-0.5 text-muted">{product.subtitle}</p> : null}
        {perUnit > 1 ? (
          <p className="t-small mt-1 font-medium">
            {(min / perUnit / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro Dose · zzgl. Pfand
          </p>
        ) : null}
        {single ? (
          <button
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent font-bold text-black text-sm transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            data-quick-add
            disabled={!single.available}
            onClick={() => add(product.handle, single.id)}
            type="button"
          >
            {single.available ? "Jetzt kaufen" : "Ausverkauft"}
          </button>
        ) : (
          <Link className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-line font-medium text-sm transition hover:border-accent hover:text-accent" href={`/products/${product.handle}`}>
            Auswählen
          </Link>
        )}
        {rating.count || sold ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {rating.count ? (
              <>
                <Stars className="size-3.5" value={rating.average} />
                <span className="font-medium">{formatAverage(rating.average)}</span>
                <span className="text-muted">({rating.count})</span>
              </>
            ) : null}
            {sold ? <span className="text-muted">· {sold.toLocaleString("de-DE")}× verkauft</span> : null}
          </p>
        ) : null}
      </div>
    </article>
  );
}

const SWATCH: Record<string, string> = { Schwarz: "#141414", "Midnight Blue": "#1f2a4f", Nude: "#d8b89c" };

function ColorDots({ colors }: { colors: string[] }) {
  return (
    <span aria-label={`Farben: ${colors.join(", ")}`} className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-1" role="img">
      {colors.map((c) => (
        <span className="size-3 rounded-full ring-1 ring-ink/15" key={c} style={{ background: SWATCH[c] ?? "#ccc" }} />
      ))}
    </span>
  );
}
