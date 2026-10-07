import Image from "next/image";
import { cansOf } from "@/lib/format";
import { SORT_COLORS, SORT_NAMES, trayCans } from "@/lib/pack-contents";
import type { Product } from "@/lib/types";

/**
 * Packung im Überblick (fällt beim Scrollen nacheinander ein):
 * - Einzelprodukt: alle Dosen/Flaschen des Trays
 * - Mixpaket: Tray-Mosaik (jedes Kästchen = 1 Tray, in Sortenfarbe) und je Sorte ein Tray mit allen Dosen
 * Verkauft werden nur ganze Trays – keine Einzeldosen.
 */
export function PackShowcase({ product }: { product: Product }) {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!variant) return null;
  const total = cansOf(variant);
  if (total < 2) return null;

  const contents = product.contents;
  const mix = Boolean(contents);
  const groups: [string, number][] = contents ?? [[product.handle, 1]];
  const trays = groups.reduce((a, [, n]) => a + n, 0);
  const allWater = groups.every(([h]) => h.startsWith("wasser"));
  const anyWater = groups.some(([h]) => h.startsWith("wasser"));
  const unit = allWater ? "Flaschen" : anyWater ? "Dosen & Flaschen" : "Dosen";
  const perUnit = (variant.price / total / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const mosaic = mix && trays >= 4 ? groups.flatMap(([h, n]) => Array.from({ length: n }, () => h)) : [];
  const num = (n: number) => n.toLocaleString("de-DE");

  return (
    <section aria-label={`${num(total)} ${unit}`} className="mx-auto mt-16 max-w-7xl px-0 lg:mt-24">
      <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="t-eyebrow">{product.onRequest ? "Die ganze Palette" : mix ? `${trays} Trays` : variant.title}</p>
          <h2 className="t-h2 mt-3">
            {num(total)} {unit} – <span className="grad-text">alles drin.</span>
          </h2>
        </div>
        <p className="t-small max-w-sm text-muted">
          {mix ? "Jede Sorte als ganzes Tray – wir verkaufen nur komplette Trays, keine Einzeldosen." : `${total} × ${product.title}, gut verpackt im Karton. Verkauft wird nur das ganze Tray.`}
        </p>
      </div>

      {mosaic.length ? (
        <div className="relative mb-4 overflow-hidden rounded-[2rem] border border-line bg-card p-5 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(168,230,82,0.12),transparent_70%)]" />
          <p className="relative mb-4 font-bold text-xs uppercase tracking-[0.25em] text-muted">Jedes Kästchen = 1 Tray</p>
          <ul className="relative grid grid-cols-[repeat(auto-fill,minmax(2.1rem,1fr))] gap-1.5 sm:gap-2">
            {mosaic.map((h, i) => (
              <li
                className="tray-can aspect-[4/3] rounded-md border border-white/10"
                key={i}
                style={{ "--i": i, background: `linear-gradient(135deg, ${SORT_COLORS[h] ?? "#a8e652"}, color-mix(in srgb, ${SORT_COLORS[h] ?? "#a8e652"} 40%, #000))` } as React.CSSProperties}
                title={SORT_NAMES[h]}
              />
            ))}
          </ul>
          <ul className="relative mt-5 flex flex-wrap gap-2 text-sm">
            {groups.map(([h, n]) => (
              <li className="flex items-center gap-2 rounded-full border border-line px-3 py-1" key={h}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: SORT_COLORS[h] }} />
                <span className="font-bold text-accent">{n}×</span> {SORT_NAMES[h] ?? h}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`grid gap-4 ${groups.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {groups.map(([h, n]) => {
          const per = mix ? trayCans(h) : total;
          const cols = per % 8 === 0 ? "grid-cols-6 md:grid-cols-8" : "grid-cols-6";
          const u = h.startsWith("wasser") ? "Flaschen" : "Dosen";
          return (
            <div className="relative overflow-hidden rounded-[2rem] border border-line bg-card px-4 pt-6 pb-5 sm:px-8" key={h}>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-80" style={{ background: `radial-gradient(ellipse at bottom, color-mix(in srgb, ${SORT_COLORS[h] ?? "#a8e652"} 22%, transparent), transparent 70%)` }} />
              {mix ? (
                <p className="relative mb-4 flex items-baseline justify-between gap-3 font-bold text-sm uppercase tracking-wide">
                  <span>{SORT_NAMES[h] ?? h}</span>
                  <span className="text-accent">
                    {n > 1 ? `${n} Trays = ${num(n * per)} ${u}` : `1 Tray · ${per} ${u}`}
                  </span>
                </p>
              ) : null}
              <ul className={`relative grid gap-x-2 gap-y-5 sm:gap-x-3 ${cols}`}>
                {Array.from({ length: per }, (_, i) => (
                  <li className="tray-can flex justify-center" key={i} style={{ "--i": i } as React.CSSProperties}>
                    <Image alt="" aria-hidden className={`h-auto w-full object-contain [filter:drop-shadow(0_14px_14px_rgba(0,0,0,0.6))] ${groups.length > 1 ? "max-w-[44px]" : "max-w-[64px]"}`} height={170} loading="lazy" sizes="64px" src={`/dosen-foto/frei/${h}.webp`} width={64} />
                  </li>
                ))}
              </ul>
              {mix && n > 1 ? <p className="relative mt-4 text-center text-muted text-xs">Hier ein Tray – du bekommst {n} davon.</p> : null}
              {!mix ? (
                <p className="relative mt-6 text-center font-bold text-muted text-xs uppercase tracking-[0.25em]">
                  {total} {unit} · {perUnit} pro {unit === "Dosen" ? "Dose" : "Flasche"} · zzgl. Pfand
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {mix && !product.onRequest ? (
        <p className="mt-6 text-center font-bold text-muted text-xs uppercase tracking-[0.25em]">
          {num(total)} {unit} gesamt · {perUnit} pro {unit === "Dosen" ? "Dose" : "Stück"} · zzgl. Pfand
        </p>
      ) : null}
    </section>
  );
}
