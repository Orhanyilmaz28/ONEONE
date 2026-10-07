import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealerPriceForm } from "./dealer-price-form";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { getDealerPrices, getTiers } from "@/lib/dealer-data";
import { PRICE_KEYS, centsToInput, effectivePrice } from "@/lib/dealer-pricing";
import { getDealer } from "@/lib/dealer-store";

export const metadata: Metadata = { title: "Preise & Stufe" };

export default async function DealerPricingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const dealer = await getDealer(id);
  if (!dealer) notFound();
  const [products, base, tiers] = await Promise.all([getProducts({ includeHidden: true }), getDealerPrices(), getTiers()]);
  const tier = tiers.find((t) => t.id === dealer.tierId) ?? tiers[0];
  const rows = DEALER_GROUPS.flatMap((g) =>
    products.filter(g.test).map((p) => ({
      handle: p.handle,
      title: p.title,
      group: g.title,
      base: Object.fromEntries(PRICE_KEYS.map((k) => [k, centsToInput(base[p.handle]?.[k])])),
      tier: Object.fromEntries(PRICE_KEYS.map((k) => [k, centsToInput(effectivePrice(k, base[p.handle], tier, undefined).value)])),
      custom: Object.fromEntries(PRICE_KEYS.map((k) => [k, centsToInput(dealer.customPrices?.[p.handle]?.[k])])),
    })),
  );
  return (
    <>
      <PageHeader description={`${dealer.contact} · ${dealer.email}`} title={`Preise & Stufe: ${dealer.company}`} />
      <Link className="mb-6 inline-block text-[14px] underline" href="/admin/haendler">
        ← Zurück zu den Anfragen
      </Link>
      <DealerPriceForm id={dealer.id} rows={rows} tierId={tier.id} tiers={tiers} />
    </>
  );
}
