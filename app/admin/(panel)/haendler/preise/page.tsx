import type { Metadata } from "next";
import { PriceForms } from "./price-forms";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS, dealerUnit } from "@/lib/dealer-catalog";
import { getDealerPrices } from "@/lib/dealer-data";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Händlerpreise" };

export default async function DealerPricesPage() {
  await requireAdmin();
  const [products, prices] = await Promise.all([getProducts({ includeHidden: true }), getDealerPrices()]);
  const rows = products.flatMap((p) => {
    const g = DEALER_GROUPS.find((x) => x.test(p));
    if (!g) return [];
    const net = prices[p.handle]?.net;
    return [{ handle: p.handle, title: p.title, unit: dealerUnit(p), shop: p.onRequest ? "" : formatPrice(p.variants[0]?.price ?? 0), net: net ? (net / 100).toFixed(2).replace(".", ",") : "", group: g.title, order: DEALER_GROUPS.indexOf(g) }];
  });
  rows.sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader description="Netto-Preise je Tray bzw. je Paket und Palette. Nur freigegebene Händler sehen sie in ihrem Händlerbereich. Leere Felder zeigen dort „Preis folgt“." title="Händler" />
      <DealerTabs active="/admin/haendler/preise" />
      <PriceForms rows={rows} />
    </>
  );
}
