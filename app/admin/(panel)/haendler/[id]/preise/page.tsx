import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DealerPriceForm } from "./dealer-price-form";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getBasePricing, getTiers } from "@/lib/dealer-data";
import { STEP_KEYS, canToInput, effectiveCanPrices } from "@/lib/dealer-pricing";
import { getDealer } from "@/lib/dealer-store";

export const metadata: Metadata = { title: "Preise & Stufe" };

export default async function DealerPricingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const dealer = await getDealer(id);
  if (!dealer) notFound();
  const [pricing, tiers] = await Promise.all([getBasePricing(), getTiers()]);
  const tier = tiers.find((t) => t.id === dealer.tierId) ?? tiers[0];
  const rows = pricing.groups.map((g) => {
    const byTier = effectiveCanPrices(g.prices, tier, undefined);
    return {
      id: g.id,
      name: g.name,
      tier: Object.fromEntries(STEP_KEYS.map((k) => [k, canToInput(byTier[k].value)])),
      custom: Object.fromEntries(STEP_KEYS.map((k) => [k, canToInput(dealer.customCanPrices?.[g.id]?.[k])])),
    };
  });
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
