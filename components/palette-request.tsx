import Link from "next/link";
import { ArrowIcon } from "./icons";
import type { Product } from "@/lib/types";

/** Kaufbereich für Paletten: kein Warenkorb, sondern Anfrage (später Händler-Registrierung) */
export function PaletteRequest({ product }: { product: Product }) {
  const perks = [
    ["Händlerpreis", "Staffelpreise, abgestimmt auf deine Menge"],
    ["Lieferung per Spedition", "Direkt an deine Rampe oder dein Lager"],
    ["Mischpalette möglich", "Sorten nach deinem Wunsch zusammenstellen"],
  ];
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-accent/40 bg-card p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent/20 blur-3xl" />
      <p className="t-eyebrow relative">Nur auf Anfrage</p>
      <p className="relative mt-2 font-black text-3xl tracking-tight">Preis auf Anfrage</p>
      <p className="relative mt-1 text-muted text-sm">Für Händler, Gastronomie und Events – wir melden uns mit deinem Angebot.</p>
      <ul className="relative mt-5 grid gap-3 sm:grid-cols-1">
        {perks.map(([t, d]) => (
          <li className="flex items-start gap-3" key={t}>
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
            <span>
              <span className="font-medium">{t}</span>
              <span className="block text-muted text-sm">{d}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        className="anim-shine relative mt-6 inline-flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-accent font-bold text-black text-lg transition hover:bg-accent-dark"
        href={`/palette?produkt=${product.handle}`}
      >
        Palette anfragen <ArrowIcon />
      </Link>
      <p className="relative mt-3 text-center text-muted text-xs">
        Unverbindlich ·{" "}
        <Link className="underline" href="/haendler">
          als Händler registrieren
        </Link>
      </p>
    </div>
  );
}
