import type { Metadata } from "next";
import Link from "next/link";
import { HaendlerForm } from "./haendler-form";
import { BRANCHES, VOLUMES } from "@/lib/dealer-store";

export const metadata: Metadata = {
  title: "Händler werden",
  description: "Händler-Registrierung bei EXSTASE: Händlerpreise, Paletten und Mischpaletten für Handel, Gastronomie und Events.",
  alternates: { canonical: "/haendler" },
};

const STEPS = [
  ["1", "Anfrage senden", "Firmendaten, Wunschmenge und Gewerbenachweis in wenigen Minuten."],
  ["2", "Wir prüfen", "Wir schauen uns deine Angaben an und melden uns."],
  ["3", "Freischaltung", "Du legst dein Passwort fest und landest in deinem Händlerbereich mit Preisliste und Artikelpässen."],
];
const PERKS = [
  ["Händlerpreise", "Staffelpreise ab dem ersten Tray, nochmal besser bei Paletten."],
  ["Mischpaletten", "Energy, Ice Coffee, Ice Tea und Wasser nach deinem Wunsch zusammengestellt."],
  ["Spedition", "Lieferung direkt an deine Rampe oder dein Lager."],
];

export default function HaendlerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="relative overflow-hidden py-12 lg:py-20">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-[32rem] rounded-full bg-accent/15 blur-3xl" />
        <p className="t-eyebrow relative">Für Handel, Gastro & Events</p>
        <h1 className="t-display relative mt-4 max-w-4xl">
          Werde <span className="grad-text">EXSTASE</span>-Händler.
        </h1>
        <p className="t-lead relative mt-6 max-w-xl">
          Du willst EXSTASE in dein Regal, in deine Karte oder auf dein Event bringen? Registrier dich als Händler – wir melden uns mit deinen Konditionen.
        </p>
        <ol className="relative mt-10 grid gap-3 sm:grid-cols-3">
          {STEPS.map(([n, t, d]) => (
            <li className="rounded-[1.5rem] border border-line bg-card p-5" key={n}>
              <span className="flex size-9 items-center justify-center rounded-full bg-accent font-black text-black">{n}</span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="text-muted text-sm">{d}</p>
            </li>
          ))}
        </ol>
      </header>

      <div className="grid gap-8 pb-20 lg:grid-cols-[1fr_1.4fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="t-h3">Deine Vorteile</h2>
          <ul className="mt-5 grid gap-4">
            {PERKS.map(([t, d]) => (
              <li className="flex items-start gap-3" key={t}>
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
                <span>
                  <span className="font-medium">{t}</span>
                  <span className="block text-muted text-sm">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link className="mt-8 inline-flex h-12 items-center rounded-full border border-accent px-7 font-bold text-accent transition hover:bg-accent hover:text-black" href="/haendler/login">
            Schon Händler? Zum Login
          </Link>
          <p className="mt-6 text-muted text-sm">
            Nur eine einzelne Palette anfragen?{" "}
            <Link className="text-accent underline" href="/palette">
              Zur Palettenanfrage
            </Link>
            .
          </p>
        </aside>
        <HaendlerForm branches={[...BRANCHES]} volumes={[...VOLUMES]} />
      </div>
    </div>
  );
}
