import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MixLadder } from "@/components/mix-ladder";
import { ProductBrowser } from "@/components/product-browser";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";
import { catalog, getCollection, getProductsInCollection } from "@/lib/catalog";

type Props = { params: Promise<{ handle: string }> };

export function generateStaticParams() {
  return catalog.collections.map((c) => ({ handle: c.handle }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = getCollection((await params).handle);
  return collection ? { title: collection.title, description: collection.description } : {};
}

export default async function CollectionPage({ params }: Props) {
  const { handle } = await params;
  const collection = getCollection(handle);
  if (!collection) {
    notFound();
  }
  if (handle === "mixpakete") {
    return <MixCollection collection={collection} products={await getProductsInCollection(handle)} />;
  }
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="py-12 lg:py-16">
        <p className="t-eyebrow">Kollektion</p>
        <h1 className="t-h1 mt-3">{collection.title}</h1>
        {collection.description ? <p className="mt-4 max-w-xl text-lg text-muted">{collection.description}</p> : null}
      </header>
      <Suspense>
        <ProductBrowser
          activeCollection={handle}
          collections={catalog.collections}
          products={await getProductsInCollection(handle)}
        />
      </Suspense>
    </div>
  );
}

const traysOf = (p: Product) => p.contents?.reduce((a, [, n]) => a + n, 0) ?? 1;

const GROUPS = [
  { id: "starter", title: "Starter", intro: "Der schnelle Einstieg: 2 bis 4 Trays, gleich probieren und sparen.", test: (p: Product) => !p.onRequest && traysOf(p) <= 4 },
  { id: "power", title: "Power", intro: "Für Durstige und WGs: 6 bis 9 Trays mit ordentlich Rabatt.", test: (p: Product) => !p.onRequest && traysOf(p) >= 5 && traysOf(p) <= 9 },
  { id: "mega", title: "Mega", intro: "Wenn es richtig knallen soll: 12 bis 24 Trays, bis zu 15 % günstiger.", test: (p: Product) => !p.onRequest && traysOf(p) >= 10 },
  { id: "palette", title: "Palette", intro: "Die ganze Palette für Händler, Gastronomie und Events – nur auf Anfrage, mit Händlerpreis.", test: (p: Product) => Boolean(p.onRequest) },
];

/** Mixpakete nach Größe: Starter → Power → Mega → Palette */
function MixCollection({ collection, products }: { collection: { title: string; description?: string }; products: Product[] }) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="py-12 lg:py-16">
        <p className="t-eyebrow">Kollektion</p>
        <h1 className="t-h1 mt-3">{collection.title}</h1>
        {collection.description ? <p className="mt-4 max-w-xl text-lg text-muted">{collection.description}</p> : null}
      </header>
      <MixLadder />
      {GROUPS.map((g) => {
        const list = products.filter(g.test).sort((a, b) => traysOf(a) - traysOf(b) || a.title.localeCompare(b.title, "de"));
        if (!list.length) return null;
        return (
          <section className="scroll-mt-28 pb-16" id={g.id} key={g.id}>
            <div className="mb-8 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <h2 className="t-h2">
                <span className="grad-text">{g.title}</span>
              </h2>
              <p className="t-lead max-w-md">{g.intro}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
              {list.map((p) => (
                <ProductCard key={p.handle} product={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
