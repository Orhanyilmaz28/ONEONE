import type { Metadata } from "next";
import { MixConfigurator } from "@/components/mix-configurator";
import { catalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Mix-Konfigurator",
  description: "Stell dir deinen eigenen EXSTASE-Mix zusammen: Trays aus allen Sorten frei wählen – jede Sorte einzeln im Warenkorb und auf der Rechnung.",
  alternates: { canonical: "/konfigurator" },
};

export default function ConfiguratorPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="py-12 lg:py-16">
        <p className="t-eyebrow">Mix-Konfigurator</p>
        <h1 className="t-h1 mt-3">
          Dein Mix. <span className="grad-text">Deine Sorten.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Stell dir deinen Mix aus ganzen Trays zusammen – so viele Sorten und Trays, wie du willst. Jede Sorte steht danach einzeln im Warenkorb und auf deiner Rechnung.
        </p>
      </header>
      <MixConfigurator collections={catalog.collections.map((c) => ({ handle: c.handle, title: c.title }))} />
    </div>
  );
}
