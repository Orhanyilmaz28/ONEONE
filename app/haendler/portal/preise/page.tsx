import { PriceTable } from "./price-table";
import { type DealerRow, DEALER_GROUPS, dealerUnit } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { getDealerPasses, getDealerPrices } from "@/lib/dealer-data";
import { getProducts } from "@/lib/catalog";
import { cansOf } from "@/lib/format";

export const metadata = { title: "Preisliste" };

export default async function PricesPage() {
  await requireDealer();
  const [products, prices, passes] = await Promise.all([getProducts(), getDealerPrices(), getDealerPasses()]);
  const rows: DealerRow[] = products.flatMap((p) => {
    const group = DEALER_GROUPS.find((g) => g.test(p));
    if (!group) return [];
    const net = prices[p.handle]?.net;
    const n = p.variants[0] ? cansOf(p.variants[0]) : 1;
    return [{ handle: p.handle, title: p.title, image: p.images[0]?.src ?? "", group: group.key, unit: dealerUnit(p), net, netPerUnit: net && n > 0 ? Math.round(net / n) : undefined, pass: Boolean(passes[p.handle]) }];
  });
  const groups = DEALER_GROUPS.map((g) => ({ key: g.key, title: g.title })).filter((g) => rows.some((r) => r.group === g.key));
  const katalog = Boolean(passes.katalog);
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Preisliste</h1>
      <p className="t-lead mt-3 max-w-2xl">Deine Händlerpreise je Tray. Alle Preise netto – zuzüglich gesetzlicher MwSt. und 0,25 € Einwegpfand je Dose bzw. Flasche.</p>
      <PriceTable groups={groups} katalog={katalog} rows={rows} />
    </div>
  );
}
