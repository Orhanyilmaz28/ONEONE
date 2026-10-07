import Image from "next/image";
import Link from "next/link";
import { requireDealer } from "@/lib/dealer-auth";
import { getDealerPasses } from "@/lib/dealer-data";
import { dealerRows } from "@/lib/dealer-rows";
import { getProducts } from "@/lib/catalog";

export default async function PortalHome() {
  const dealer = await requireDealer();
  const [products, passes] = await Promise.all([getProducts(), getDealerPasses()]);
  const { rows, tierName } = await dealerRows(dealer, products);
  const priced = rows.filter((r) => r.t1.value).length;
  const singles = products.filter((p) => !p.collections.includes("mixpakete"));
  const passCount = Object.keys(passes).filter((k) => k !== "katalog").length;
  const since = dealer.approvedAt ? new Date(dealer.approvedAt).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : null;
  const first = dealer.contact.split(" ")[0];

  const tiles = [
    { href: "/haendler/portal/preise", title: "Preisliste", text: "Alle Artikel mit deinen Händlerpreisen – netto, je Tray und je Dose.", big: priced ? `${priced}` : "–", unit: "Preise" },
    { href: "/haendler/portal/artikelpaesse", title: "Artikelpässe", text: "Datenblätter als PDF zum Download – für Listung und Kasse.", big: passCount ? `${passCount}` : "–", unit: passCount === 1 ? "Pass" : "Pässe" },
    { href: "/palette", title: "Palette anfragen", text: "Menge nennen, Mischpalette wünschen – wir machen dir ein Angebot.", big: "108", unit: "Trays je Palette" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-accent/30 bg-card p-8 sm:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-[28rem] rounded-full bg-accent/20 blur-3xl" />
        <p className="t-eyebrow relative">Händlerbereich</p>
        <h1 className="t-display relative mt-4">
          Hallo <span className="grad-text">{first}</span>.
        </h1>
        <p className="t-lead relative mt-4 max-w-xl">
          Schön, dass <b className="text-ink">{dealer.company}</b> dabei ist. Hier findest du deine Preise, die Artikelpässe und alles für die nächste Palette.
        </p>
        <ul className="relative mt-6 flex flex-wrap gap-2 text-sm">
          <li className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5">
            <span aria-hidden className="text-accent">✓</span> Gewerbenachweis geprüft
          </li>
          <li className="flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5">Stufe {tierName}</li>
          <li className="flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5">Händlerkonto aktiv{since ? ` seit ${since}` : ""}</li>
        </ul>
      </section>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link className="group block h-full rounded-[2rem] border border-line bg-card p-6 transition hover:-translate-y-1 hover:border-accent" href={t.href}>
              <p className="font-black text-5xl text-accent tracking-tight">{t.big}</p>
              <p className="text-muted text-xs uppercase tracking-[0.2em]">{t.unit}</p>
              <p className="t-h3 mt-5">{t.title}</p>
              <p className="mt-1 text-muted text-sm">{t.text}</p>
              <p className="mt-4 font-bold text-accent text-sm transition-transform group-hover:translate-x-1">Öffnen →</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12">
        <h2 className="t-h3">Das Sortiment</h2>
        <ul className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-4">
          {singles.map((p) => (
            <li className="w-36 shrink-0" key={p.handle}>
              <Link className="group block" href="/haendler/portal/preise">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-card">
                  <Image alt="" className="object-cover transition duration-500 group-hover:scale-105" fill sizes="144px" src={p.images[0]?.src ?? ""} />
                </span>
                <span className="mt-2 block truncate font-medium text-sm">{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
