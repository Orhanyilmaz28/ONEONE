"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { getBasePricing, getTiers } from "@/lib/dealer-data";
import { type CanPrices, STEPS, parseCanPrice } from "@/lib/dealer-pricing";
import { setDealerPricing } from "@/lib/dealer-store";

export type DealerPriceState = { ok?: string; error?: string } | undefined;

/** Stufe und eigene Dosenpreise (je Preisgruppe) eines Händlers speichern – leeres Feld = Preis nach Stufe */
export async function saveDealerPricingAction(id: string, _prev: DealerPriceState, form: FormData): Promise<DealerPriceState> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) return { error: "Händler nicht gefunden." };
  const [tiers, pricing] = await Promise.all([getTiers(), getBasePricing()]);
  const tierId = String(form.get("tier") ?? "");
  const custom: Record<string, CanPrices> = {};
  for (const g of pricing.groups) {
    const set: CanPrices = {};
    for (const s of STEPS) {
      const v = parseCanPrice(form.get(`${g.id}__${s.key}`));
      if (v === "invalid") return { error: `Ungültiger Preis bei „${g.name}“ (${s.label}). Bitte nur Zahlen wie 0,40 eintragen.` };
      if (v) set[s.key] = v;
    }
    if (Object.keys(set).length) custom[g.id] = set;
  }
  const ok = await setDealerPricing(id, tiers.some((t) => t.id === tierId) ? tierId : tiers[0].id, custom);
  if (!ok) return { error: "Händler nicht gefunden." };
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler", "layout");
  return { ok: `Gespeichert – ${Object.keys(custom).length} Preisgruppen mit eigenen Preisen.` };
}
