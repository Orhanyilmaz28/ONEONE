import Image from "next/image";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { getDealerPasses } from "@/lib/dealer-data";
import { getProducts } from "@/lib/catalog";

export const metadata = { title: "Artikelpässe" };

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function PassesPage() {
  await requireDealer();
  const [products, passes] = await Promise.all([getProducts(), getDealerPasses()]);
  const groups = DEALER_GROUPS
    .map((g) => ({ ...g, items: products.filter(g.test) }))
    .filter((g) => g.items.length);
  const katalog = passes.katalog;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Artikelpässe</h1>
      <p className="t-lead mt-3 max-w-2xl">Datenblätter zu jedem Artikel als PDF – für deine Listung, Kasse und Kundenfragen.</p>

      <a
        aria-disabled={!katalog}
        className={`group relative mt-8 flex flex-col gap-2 overflow-hidden rounded-[2rem] border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 ${katalog ? "border-accent/50 bg-accent/10 transition hover:border-accent" : "pointer-events-none border-line bg-card opacity-70"}`}
        href={katalog ? "/haendler/portal/pass/katalog" : undefined}
      >
        <span>
          <span className="block font-black text-2xl">Gesamtkatalog</span>
          <span className="text-muted text-sm">{katalog ? `PDF · ${kb(katalog.size)}` : "Der Gesamtkatalog folgt in Kürze."}</span>
        </span>
        {katalog ? <span className="inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black">Herunterladen</span> : null}
      </a>

      {groups.map((g) => (
        <section className="mt-12" key={g.key}>
          <h2 className="t-h3 mb-4">{g.title}</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {g.items.map((p) => {
              const pass = passes[p.handle];
              return (
                <li className="flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-card" key={p.handle}>
                  <span className="relative block aspect-[4/5] bg-paper">
                    <Image alt="" className="object-cover" fill sizes="(min-width: 1024px) 20vw, 45vw" src={p.images[0]?.src ?? ""} />
                  </span>
                  <span className="flex flex-1 flex-col p-4">
                    <span className="font-bold">{p.title}</span>
                    <span className="mb-3 text-muted text-xs">{pass ? `PDF · ${kb(pass.size)}` : "Pass folgt in Kürze"}</span>
                    {pass ? (
                      <a className="mt-auto inline-flex h-10 items-center justify-center rounded-full bg-accent font-bold text-black text-sm transition hover:bg-accent-dark" href={`/haendler/portal/pass/${p.handle}`}>
                        Pass öffnen
                      </a>
                    ) : (
                      <span className="mt-auto inline-flex h-10 items-center justify-center rounded-full border border-line text-muted text-sm">Folgt</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
