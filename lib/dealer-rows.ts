import { type DealerRow, DEALER_GROUPS, dealerUnit, palletTrays } from "./dealer-catalog";
import { getDealerPasses, getDealerPrices, getTiers } from "./dealer-data";
import { type Dealer } from "./dealer-store";
import { effectivePrice } from "./dealer-pricing";
import { cansOf } from "./format";
import type { Product } from "./types";

/** Preisliste für einen Händler: nur einzelne Artikel, drei Preise (1 Tray, ab 2 Trays, Palette) nach Stufe und individuellen Preisen */
export async function dealerRows(dealer: Dealer, products: Product[]): Promise<{ rows: DealerRow[]; tierName: string }> {
  const [base, tiers, passes] = await Promise.all([getDealerPrices(), getTiers(), getDealerPasses()]);
  const tier = tiers.find((t) => t.id === dealer.tierId) ?? tiers[0];
  const rows: DealerRow[] = products.flatMap((p) => {
    const g = DEALER_GROUPS.find((x) => x.test(p));
    if (!g) return [];
    const custom = dealer.customPrices?.[p.handle];
    return [
      {
        handle: p.handle,
        title: p.title,
        image: p.images[0]?.src ?? "",
        group: g.key,
        unit: dealerUnit(p),
        perTray: p.variants[0] ? cansOf(p.variants[0]) : 1,
        trays: palletTrays(p),
        t1: effectivePrice("t1", base[p.handle], tier, custom),
        t2: effectivePrice("t2", base[p.handle], tier, custom),
        pal: effectivePrice("pal", base[p.handle], tier, custom),
        pass: Boolean(passes[p.handle]),
      },
    ];
  });
  return { rows, tierName: tier?.name ?? "Standard" };
}
