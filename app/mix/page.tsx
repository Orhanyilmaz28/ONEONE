import type { Metadata } from "next";
import { MixConfigurator } from "./mix-configurator";
import { catalog, getProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Mix-Konfigurator",
  description: "Stell dir deinen EXSTASE-Mix zusammen – Tray für Tray. Ab 2 Sorten mit Mix-Rabatt bis 15 %.",
  alternates: { canonical: "/mix" },
};

export default async function MixPage() {
  const products = (await getProducts()).filter((p) => p.variants.length === 1 && !p.onRequest);
  const groups = catalog.collections
    .map((c) => ({ title: c.title, handles: products.filter((p) => p.collections[0] === c.handle).map((p) => p.handle) }))
    .filter((g) => g.handles.length);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="py-12 lg:py-16">
        <p className="t-eyebrow">Mix-Konfigurator</p>
        <h1 className="t-h1 mt-3">Dein Mix</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">Wähle deine Sorten Tray für Tray. Ab 2 verschiedenen Sorten gibt es Mix-Rabatt – je mehr Trays, desto mehr.</p>
      </header>
      <MixConfigurator groups={groups} products={products} />
    </div>
  );
}
