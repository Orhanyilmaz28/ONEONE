import { TierBadge } from "@/components/tier-badge";
import { PriceTable } from "./price-table";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { getDealerOrder } from "@/lib/dealer-orders";
import { dealerRows } from "@/lib/dealer-rows";
import { getDealerPasses } from "@/lib/dealer-data";
import { getProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Preisliste & Bestellen" };

type Props = { searchParams: Promise<{ nochmal?: string }> };

export default async function PricesPage({ searchParams }: Props) {
  const dealer = await requireDealer();
  const { nochmal } = await searchParams;
  const [products, passes, settings, again] = await Promise.all([
    getProducts(),
    getDealerPasses(),
    getSettings(),
    // „Nochmal bestellen“: nur eigene Bestellungen
    nochmal && /^[a-f0-9]{16}$/.test(nochmal) ? getDealerOrder(nochmal) : undefined,
  ]);
  const { rows, tierName } = await dealerRows(dealer, products);
  const groups = DEALER_GROUPS.map((g) => ({ key: g.key, title: g.title })).filter((g) => rows.some((r) => r.group === g.key));
  const initialQty = again && again.dealerId === dealer.id ? Object.fromEntries(again.calc.lines.map((l) => [l.handle, l.trays])) : undefined;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <h1 className="t-h1">Preisliste &amp; Bestellen</h1>
        <TierBadge name={tierName} />
      </div>
      <p className="t-lead mt-3 max-w-2xl">Deine Händlerpreise je Artikel: 1 Tray, ab 2 Trays (Preis je Tray) und ganze Palette. Alle Preise netto – zuzüglich gesetzlicher MwSt. und 0,25 € Einwegpfand je Dose bzw. Flasche.</p>
      {initialQty ? <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">Die Mengen aus Bestellung {again?.number} sind eingetragen – prüfen und unten auf „Bestellen“ tippen.</p> : null}
      <PriceTable
        address={{ company: dealer.company, contact: dealer.contact, street: dealer.street, zip: dealer.zip, city: dealer.city }}
        groups={groups}
        initialQty={initialQty}
        katalog={Boolean(passes.katalog)}
        rows={rows}
        shipping={{ cost: settings.shipping.cost, freeFrom: settings.shipping.freeFrom }}
      />
    </div>
  );
}
