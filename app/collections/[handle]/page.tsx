import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductBrowser } from "@/components/product-browser";
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
