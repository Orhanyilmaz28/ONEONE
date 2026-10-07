import type { Metadata } from "next";
import { PriceForms } from "./price-forms";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS, dealerUnit } from "@/lib/dealer-catalog";
import { getDealerPrices } from "@/lib/dealer-data";
import { PRICE_KEYS, centsToInput } from "@/lib/dealer-pricing";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Basispreise" };

export default async function DealerPricesPage() {
  await requireAdmin();
  const [products, prices] = await Promise.all([getProducts({ includeHidden: true }), getDealerPrices()]);
  const rows = DEALER_GROUPS.flatMap((g) =>
    products.filter(g.test).map((p) => ({
      handle: p.handle,
      title: p.title,
      unit: dealerUnit(p),
      shop: formatPrice(p.variants[0]?.price ?? 0),
      group: g.title,
      values: Object.fromEntries(PRICE_KEYS.map((k) => [k, centsToInput(prices[p.handle]?.[k])])),
    })),
  );
  return (
    <>
      <PageHeader description="Netto-Basispreise je Artikel: 1 Tray, je Tray ab 2 Trays und je Palette. Daraus entstehen die Preise der Händler: Basispreis minus Prozent der Stufe – oder der individuelle Preis des Händlers." title="Händler" />
      <DealerTabs active="/admin/haendler/preise" />
      <PriceForms rows={rows} />
    </>
  );
}
