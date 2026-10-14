import Image from "next/image";
import { PdfLink, ProductDataButton } from "@/components/dealer-dialog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { getDealerPasses } from "@/lib/dealer-data";
import { getProducts } from "@/lib/catalog";
import { lkwOnly } from "@/lib/lkw";
import { PRODUCT_SPECS } from "@/lib/product-specs";

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
      <a className="mt-5 inline-flex h-10 items-center rounded-full border border-accent px-4 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" download href="/haendler/portal/stammdaten">
        Stammdaten aller Artikel (CSV für Excel)
      </a>

      {katalog ? (
        <PdfLink
          className="group relative mt-8 flex flex-col gap-2 overflow-hidden rounded-[2rem] border border-accent/50 bg-accent/10 p-6 transition hover:border-accent sm:flex-row sm:items-center sm:justify-between sm:p-8"
          href="/haendler/portal/pass/katalog"
          title="Gesamtkatalog"
        >
          <span>
            <span className="block font-black text-2xl">Gesamtkatalog</span>
            <span className="text-muted text-sm">PDF · {kb(katalog.size)}</span>
          </span>
          <span className="inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black">Öffnen</span>
        </PdfLink>
      ) : (
        <div className="relative mt-8 flex flex-col gap-2 overflow-hidden rounded-[2rem] border border-line bg-card p-6 opacity-70 sm:p-8">
          <span className="block font-black text-2xl">Gesamtkatalog</span>
          <span className="text-muted text-sm">Der Gesamtkatalog folgt in Kürze.</span>
        </div>
      )}

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
                    <span className="text-muted text-xs">{pass ? `PDF · ${kb(pass.size)}` : "Pass folgt in Kürze"}</span>
                    {PRODUCT_SPECS[p.handle]?.artNr ? <span className="text-muted text-xs">Art.-Nr. {PRODUCT_SPECS[p.handle]?.artNr}</span> : null}
                    {lkwOnly(p) ? <span className="mt-1 text-accent text-xs">Nur per LKW auf Anfrage</span> : null}
                    <span className="mt-auto grid grid-cols-2 gap-2 pt-3">
                      {pass ? (
                        <PdfLink className="inline-flex h-10 items-center justify-center rounded-full bg-accent font-bold text-black text-sm transition hover:bg-accent-dark" href={`/haendler/portal/pass/${p.handle}`} title={`Artikelpass ${p.title}`}>
                          Pass
                        </PdfLink>
                      ) : (
                        <span className="inline-flex h-10 items-center justify-center rounded-full border border-line text-muted text-sm">Folgt</span>
                      )}
                      <ProductDataButton
                        className="inline-flex h-10 items-center justify-center rounded-full border border-line font-bold text-sm transition hover:border-accent hover:text-accent"
                        material={p.material}
                        passHref={pass ? `/haendler/portal/pass/${p.handle}` : undefined}
                        spec={PRODUCT_SPECS[p.handle]}
                        title={p.title}
                      />
                    </span>
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
