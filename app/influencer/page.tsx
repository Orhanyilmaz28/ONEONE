import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_COMMISSION_PCT, DEFAULT_DISCOUNT_PCT, FOLLOWERS, PLATFORMS } from "@/lib/influencer-rules";
import { InfluencerForm } from "./influencer-form";

export const metadata: Metadata = {
  title: "Influencer werden",
  description: `Werde EXSTASE-Partner: Deine Community spart ${DEFAULT_DISCOUNT_PCT} % mit deinem Code, du bekommst ${DEFAULT_COMMISSION_PCT} % Provision auf jede Bestellung.`,
  alternates: { canonical: "/influencer" },
};

const STEPS = [
  ["1", "Bewerben", "Kanal, Reichweite und deinen Wunsch-Code angeben – dauert zwei Minuten."],
  ["2", "Freischaltung", "Wir schauen uns deinen Kanal an und schalten dich frei. Du legst dein Passwort fest."],
  ["3", "Code teilen", "Deine Zuschauer sparen mit deinem Code – du siehst jede Bestellung und deine Provision im Dashboard."],
];
const PERKS = [
  [`${DEFAULT_DISCOUNT_PCT} % für deine Community`, "Mit deinem persönlichen Code oder Link sparen deine Zuschauer bei jeder Bestellung."],
  [`${DEFAULT_COMMISSION_PCT} % Provision`, "Auf den Warenwert jeder Bestellung mit deinem Code – ohne Deckel."],
  ["Eigenes Dashboard", "Bestellungen, Provision und Auszahlungen live – mit monatlicher Gutschrift für deine Buchhaltung."],
];

export default function InfluencerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="relative overflow-hidden py-12 lg:py-20">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-[32rem] rounded-full bg-accent/15 blur-3xl" />
        <p className="t-eyebrow relative">Für Creator & Streamer</p>
        <h1 className="t-display relative mt-4 max-w-4xl">
          Werde <span className="grad-text">EXSTASE</span>-Partner.
        </h1>
        <p className="t-lead relative mt-6 max-w-xl">
          Dein Code, deine Community, deine Provision. Teile deinen persönlichen Rabattcode – deine Zuschauer sparen, du verdienst an jeder Bestellung mit.
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
          <Link className="mt-8 inline-flex h-12 items-center rounded-full border border-accent px-7 font-bold text-accent transition hover:bg-accent hover:text-black" href="/influencer/login">
            Schon Partner? Zum Login
          </Link>
        </aside>
        <InfluencerForm followers={[...FOLLOWERS]} platforms={[...PLATFORMS]} />
      </div>
    </div>
  );
}
