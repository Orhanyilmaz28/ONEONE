import type { Metadata } from "next";
import Link from "next/link";
import { PaletteForm } from "./palette-form";
import { getProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Palette anfragen",
  description: "EXSTASE Paletten für Händler, Gastronomie und Events – Preis auf Anfrage, Lieferung per Spedition.",
};

type Props = { searchParams: Promise<{ produkt?: string }> };

export default async function PalettePage({ searchParams }: Props) {
  const { produkt } = await searchParams;
  const [products, settings] = await Promise.all([getProducts(), getSettings()]);
  const paletten = products.filter((p) => p.onRequest).map((p) => ({ handle: p.handle, title: p.title }));
  const facts = [
    ["120", "Trays je Palette", "Energy-Palette: 2.880 Dosen"],
    ["1", "Anfrage, ein Angebot", "Händlerpreis nach Menge und Region"],
    ["Spedition", "Lieferung", "direkt an deine Rampe oder dein Lager"],
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="relative overflow-hidden py-12 lg:py-20">
        <div aria-hidden className="pointer-events-none absolute -top-20 right-0 size-[34rem] rounded-full bg-accent/15 blur-3xl" />
        <p className="t-eyebrow relative">Für Händler, Gastro & Events</p>
        <h1 className="t-display relative mt-4 max-w-4xl">
          Die ganze <span className="grad-text">Palette.</span>
          <br />
          Ein Angebot.
        </h1>
        <p className="t-lead relative mt-6 max-w-xl">
          Du brauchst richtig viel EXSTASE? Sag uns deine Menge – wir machen dir ein Angebot mit Händlerpreis und liefern per Spedition direkt zu dir. Noch kein Händlerkonto? Dann registrier dich zuerst als Händler.
        </p>
        <ul className="relative mt-10 grid gap-3 sm:grid-cols-3">
          {facts.map(([big, t, d]) => (
            <li className="rounded-[1.5rem] border border-line bg-card p-5" key={t}>
              <p className="font-black text-4xl text-accent tracking-tight">{big}</p>
              <p className="mt-1 font-medium">{t}</p>
              <p className="text-muted text-sm">{d}</p>
            </li>
          ))}
        </ul>
        <Link className="relative mt-6 inline-flex h-12 items-center rounded-full border border-accent px-7 font-bold text-accent transition hover:bg-accent hover:text-black" href="/haendler">
          Als Händler registrieren
        </Link>
      </header>
      <PaletteForm email={settings.company.email} paletten={paletten} preselect={produkt} />
    </div>
  );
}
