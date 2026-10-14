import { type DealerRow, DEALER_GROUPS, dealerUnit, palletTrays } from "./dealer-catalog";
import { getBasePricing, getDealerPasses, getTiers } from "./dealer-data";
import { type Dealer } from "./dealer-store";
import { effectiveCanPrices, groupOf } from "./dealer-pricing";
import { cansOf } from "./format";
import { lkwOnly } from "./lkw";
import { PRODUCT_SPECS } from "./product-specs";
import type { Product } from "./types";

/** Preisliste für einen Händler: Dosenpreise je Mengenstufe aus der Preisgruppe des Artikels, nach Stufe und eigenen Preisen */
export async function dealerRows(dealer: Dealer, products: Product[]): Promise<{ rows: DealerRow[]; tierName: string }> {
  const [pricing, tiers, passes] = await Promise.all([getBasePricing(), getTiers(), getDealerPasses()]);
  const tier = tiers.find((t) => t.id === dealer.tierId) ?? tiers[0];
  const rows: DealerRow[] = products.flatMap((p) => {
    const g = DEALER_GROUPS.find((x) => x.test(p));
    if (!g) return [];
    const lkw = lkwOnly(p);
    const group = lkw ? undefined : groupOf(p, pricing);
    return [
      {
        handle: p.handle,
        title: p.title,
        image: p.images[0]?.src ?? "",
        group: g.key,
        unit: dealerUnit(p),
        perTray: p.variants[0] ? cansOf(p.variants[0]) : 1,
        trays: palletTrays(p),
        steps: effectiveCanPrices(group?.prices, tier, group ? dealer.customCanPrices?.[group.id] : undefined),
        priceGroup: group?.name,
        pass: Boolean(passes[p.handle]),
        artNr: PRODUCT_SPECS[p.handle]?.artNr,
        gtin: PRODUCT_SPECS[p.handle]?.gtin,
        lkw,
        available: p.variants.some((v) => v.available),
      },
    ];
  });
  return { rows, tierName: tier?.name ?? "Standard" };
}
