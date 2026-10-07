import Image from "next/image";
import { cansOf } from "@/lib/format";
import { PACK_CONTENTS, SORT_NAMES } from "@/lib/pack-contents";
import type { Product } from "@/lib/types";

/**
 * Packung im Überblick: alle Dosen der Packung (z. B. 24er Tray) stehen nebeneinander und fallen beim Scrollen nacheinander ein.
 * Einzelprodukte: die Packungsgröße der Standard-Variante in ihrer Sorte; Mixpakete: immer die komplette Anzahl, nach Sorten gemischt.
 */
export function PackShowcase({ product }: { product: Product }) {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!variant) return null;
  const total = cansOf(variant);
  if (total < 2) return null;

  const mix = PACK_CONTENTS[product.handle];
  const parts: [string, number][] = mix ?? [[product.handle, total]];
  const cans = parts.flatMap(([handle, n]) => Array.from({ length: n }, () => handle));
  const count = cans.length;
  const unit = product.productType === "Mineralwasser" ? "Flaschen" : "Dosen";
  const cols = count % 8 === 0 ? "grid-cols-6 md:grid-cols-8" : "grid-cols-6";

  return (
    <section aria-label={`${count} ${unit} im ${variant.title}`} className="mx-auto mt-16 max-w-7xl px-0 lg:mt-24">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-eyebrow">{variant.title.replace(/pack/i, "Tray")}</p>
          <h2 className="t-h2 mt-3">
            {count} {unit} – <span className="grad-text">alles drin.</span>
          </h2>
        </div>
        {mix ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {parts.map(([handle, n]) => (
              <li className="rounded-full border border-line bg-card px-3.5 py-1.5" key={handle}>
                <span className="font-bold text-accent">{n}×</span> {SORT_NAMES[handle] ?? handle}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small text-muted">{count} × {product.title}, gut verpackt im Karton.</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-[2rem] border border-line bg-card px-4 pt-8 pb-6 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(168,230,82,0.14),transparent_70%)]" />
        <ul className={`relative grid gap-x-2 gap-y-6 sm:gap-x-4 ${cols}`}>
          {cans.map((handle, i) => (
            <li className="tray-can flex justify-center" key={i} style={{ "--i": i } as React.CSSProperties}>
              <Image alt="" aria-hidden className="h-auto w-full max-w-[64px] object-contain [filter:drop-shadow(0_14px_14px_rgba(0,0,0,0.6))]" height={170} loading="lazy" sizes="64px" src={`/dosen-foto/frei/${handle}.webp`} width={64} />
            </li>
          ))}
        </ul>
        <p className="relative mt-6 text-center font-bold text-muted text-xs uppercase tracking-[0.25em]">
          {count} {unit} · {(variant.price / count / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} pro {unit === "Dosen" ? "Dose" : "Flasche"} · zzgl. Pfand
        </p>
      </div>
    </section>
  );
}
