import Image from "next/image";
import { cansOf } from "@/lib/format";
import { PACK_CONTENTS, SORT_NAMES, TRAY_SIZE } from "@/lib/pack-contents";
import type { Product } from "@/lib/types";

/**
 * Packung im Überblick: alle Dosen der Packung (z. B. 24er Tray) stehen nebeneinander und fallen beim Scrollen nacheinander ein.
 * Einzelprodukte: das Tray in seiner Sorte; Mixpakete: ein komplettes Tray (24 Dosen) je Sorte – es gibt keine Einzeldosen.
 */
export function PackShowcase({ product }: { product: Product }) {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!variant) return null;
  const total = cansOf(variant);
  if (total < 2) return null;

  const mix = PACK_CONTENTS[product.handle];
  const unit = product.productType === "Mineralwasser" ? "Flaschen" : "Dosen";
  const perUnit = (variant.price / total / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  // Einzelprodukt: ein Tray; Mixpaket: ein Tray je Sorte (immer komplette Trays, keine Einzeldosen)
  const trays: { handle: string; count: number }[] = mix ? mix.flatMap(([handle, n]) => Array.from({ length: n }, () => ({ handle, count: TRAY_SIZE }))) : [{ handle: product.handle, count: total }];

  return (
    <section aria-label={`${total} ${unit}`} className="mx-auto mt-16 max-w-7xl px-0 lg:mt-24">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-eyebrow">{mix ? `${trays.length} Trays` : variant.title}</p>
          <h2 className="t-h2 mt-3">
            {total} {unit} – <span className="grad-text">alles drin.</span>
          </h2>
        </div>
        <p className="t-small max-w-sm text-muted">
          {mix ? "Jede Sorte als ganzes Tray – wir verkaufen nur komplette Trays, keine Einzeldosen." : `${total} × ${product.title}, gut verpackt im Karton. Verkauft wird nur das ganze Tray.`}
        </p>
      </div>

      <div className={`grid gap-4 ${trays.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {trays.map((t, ti) => {
          const cols = t.count % 8 === 0 ? "grid-cols-6 md:grid-cols-8" : "grid-cols-6";
          return (
            <div className="relative overflow-hidden rounded-[2rem] border border-line bg-card px-4 pt-6 pb-5 sm:px-8" key={`${t.handle}-${ti}`}>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(168,230,82,0.14),transparent_70%)]" />
              {mix ? (
                <p className="relative mb-4 flex items-baseline justify-between gap-3 font-bold text-sm uppercase tracking-wide">
                  <span>{SORT_NAMES[t.handle] ?? t.handle}</span>
                  <span className="text-accent">Tray {ti + 1} · {t.count} {unit}</span>
                </p>
              ) : null}
              <ul className={`relative grid gap-x-2 gap-y-5 sm:gap-x-3 ${cols}`}>
                {Array.from({ length: t.count }, (_, i) => (
                  <li className="tray-can flex justify-center" key={i} style={{ "--i": i } as React.CSSProperties}>
                    <Image alt="" aria-hidden className={`h-auto w-full object-contain [filter:drop-shadow(0_14px_14px_rgba(0,0,0,0.6))] ${trays.length > 1 ? "max-w-[44px]" : "max-w-[64px]"}`} height={170} loading="lazy" sizes="64px" src={`/dosen-foto/frei/${t.handle}.webp`} width={64} />
                  </li>
                ))}
              </ul>
              {!mix ? (
                <p className="relative mt-6 text-center font-bold text-muted text-xs uppercase tracking-[0.25em]">
                  {total} {unit} · {perUnit} pro {unit === "Dosen" ? "Dose" : "Flasche"} · zzgl. Pfand
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {mix ? (
        <p className="mt-6 text-center font-bold text-muted text-xs uppercase tracking-[0.25em]">
          {total} {unit} gesamt · {perUnit} pro {unit === "Dosen" ? "Dose" : "Flasche"} · zzgl. Pfand
        </p>
      ) : null}
    </section>
  );
}
