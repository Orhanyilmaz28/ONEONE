import { PriceTable } from "./price-table";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { dealerRows } from "@/lib/dealer-rows";
import { getDealerPasses } from "@/lib/dealer-data";
import { getProducts } from "@/lib/catalog";

export const metadata = { title: "Preisliste" };

export default async function PricesPage() {
  const dealer = await requireDealer();
  const [products, passes] = await Promise.all([getProducts(), getDealerPasses()]);
  const { rows, tierName } = await dealerRows(dealer, products);
  const groups = DEALER_GROUPS.map((g) => ({ key: g.key, title: g.title })).filter((g) => rows.some((r) => r.group === g.key));
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich · Stufe {tierName}</p>
      <h1 className="t-h1 mt-3">Preisliste</h1>
      <p className="t-lead mt-3 max-w-2xl">Deine Händlerpreise je Artikel: 1 Tray, ab 2 Trays (Preis je Tray) und ganze Palette. Alle Preise netto – zuzüglich gesetzlicher MwSt. und 0,25 € Einwegpfand je Dose bzw. Flasche.</p>
      <PriceTable groups={groups} katalog={Boolean(passes.katalog)} rows={rows} />
    </div>
  );
}
