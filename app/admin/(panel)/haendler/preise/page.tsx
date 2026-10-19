import type { Metadata } from "next";
import { PriceForms } from "./price-forms";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS, dealerUnit } from "@/lib/dealer-catalog";
import { getBasePricing } from "@/lib/dealer-data";
import { STEP_KEYS, canToInput, groupOf } from "@/lib/dealer-pricing";
import { cansOf } from "@/lib/format";
import { lkwOnly } from "@/lib/lkw";
import { strictReads } from "@/lib/store";

export const metadata: Metadata = { title: "Dosenpreise" };

export default async function DealerPricesPage() {
  await requireAdmin();
  const [products, pricing] = await strictReads(() => Promise.all([getProducts({ includeHidden: true }), getBasePricing()]));
  const groups = pricing.groups.map((g) => ({ id: g.id, name: g.name, values: Object.fromEntries(STEP_KEYS.map((k) => [k, canToInput(g.prices[k])])) }));
  const items = DEALER_GROUPS.flatMap((dg) =>
    products.filter(dg.test).map((p) => ({
      handle: p.handle,
      title: p.title,
      area: dg.title,
      unit: dealerUnit(p),
      perTray: p.variants[0] ? cansOf(p.variants[0]) : 1,
      lkw: lkwOnly(p),
      group: lkwOnly(p) ? "" : (groupOf(p, pricing)?.id ?? ""),
    })),
  );
  return (
    <>
      <PageHeader
        description="Trag nur die Dosenpreise ein (netto, je Dose) – je Preisgruppe mit Mengenstaffel pro Sorte. Daraus rechnet der Shop Tray-Preise, Stufen-Nachlass und Bestellsummen. Ab 120 Trays gesamt gilt der Palettenpreis. Unten legst du fest, welcher Artikel zu welcher Preisgruppe gehört."
        title="Händler"
      />
      <DealerTabs active="/admin/haendler/preise" />
      <PriceForms groups={groups} items={items} />
    </>
  );
}
