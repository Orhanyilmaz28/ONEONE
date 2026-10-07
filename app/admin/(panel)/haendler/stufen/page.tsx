import type { Metadata } from "next";
import { TierForm } from "./tier-form";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getTiers } from "@/lib/dealer-data";
import { getDealers } from "@/lib/dealer-store";

export const metadata: Metadata = { title: "Händlerstufen" };

export default async function TiersPage() {
  await requireAdmin();
  const [tiers, dealers] = await Promise.all([getTiers(), getDealers()]);
  const counts: Record<string, number> = {};
  for (const d of dealers.filter((x) => x.status === "freigegeben")) {
    const id = tiers.some((t) => t.id === d.tierId) ? (d.tierId as string) : tiers[0].id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return (
    <>
      <PageHeader description="Lege Stufen mit Namen und Prozent an. Der Nachlass wird von den Basispreisen abgezogen. Welche Stufe ein Händler hat, stellst du bei dem Händler ein (Reiter „Anfragen“ → „Preise & Stufe“)." title="Händler" />
      <DealerTabs active="/admin/haendler/stufen" />
      <TierForm counts={counts} tiers={tiers} />
    </>
  );
}
