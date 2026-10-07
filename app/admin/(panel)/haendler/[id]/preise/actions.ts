"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { getTiers } from "@/lib/dealer-data";
import { PRICE_KEYS, type PriceSet, parseEuro } from "@/lib/dealer-pricing";
import { setDealerPricing } from "@/lib/dealer-store";

export type DealerPriceState = { ok?: string; error?: string } | undefined;

/** Stufe und individuelle Preise eines Händlers speichern (leeres Feld = kein individueller Preis) */
export async function saveDealerPricingAction(id: string, _prev: DealerPriceState, form: FormData): Promise<DealerPriceState> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) return { error: "Händler nicht gefunden." };
  const tiers = await getTiers();
  const tierId = String(form.get("tier") ?? "");
  const products = (await getProducts({ includeHidden: true })).filter((p) => DEALER_GROUPS.some((g) => g.test(p)));
  const custom: Record<string, PriceSet> = {};
  for (const p of products) {
    const set: PriceSet = {};
    for (const k of PRICE_KEYS) {
      const v = parseEuro(form.get(`${k}_${p.handle}`));
      if (v === "invalid") return { error: `Ungültiger Preis bei „${p.title}“. Bitte nur Zahlen wie 12,50 eintragen.` };
      if (v) set[k] = v;
    }
    if (Object.keys(set).length) custom[p.handle] = set;
  }
  const ok = await setDealerPricing(id, tiers.some((t) => t.id === tierId) ? tierId : tiers[0].id, custom);
  if (!ok) return { error: "Händler nicht gefunden." };
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler", "layout");
  return { ok: `Gespeichert – ${Object.keys(custom).length} Artikel mit individuellen Preisen.` };
}
