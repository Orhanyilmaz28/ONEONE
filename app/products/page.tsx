import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductBrowser } from "@/components/product-browser";
import { catalog, getProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "Alle Produkte" };

export default async function ProductsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="py-12 lg:py-16">
        <p className="t-eyebrow">Shop</p>
        <h1 className="t-h1 mt-3">Alle Produkte</h1>
      </header>
      <Suspense>
        <ProductBrowser collections={catalog.collections} products={await getProducts()} />
      </Suspense>
    </div>
  );
}
