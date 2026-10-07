"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { setDealerPrices } from "@/lib/dealer-data";
import { PRICE_KEYS, type PriceSet, parseEuro } from "@/lib/dealer-pricing";

export type PriceState = { ok?: string; error?: string } | undefined;

/** Basispreise (netto) speichern: je Artikel 1 Tray, ab 2 Trays (je Tray) und Palette */
export async function savePricesAction(_prev: PriceState, form: FormData): Promise<PriceState> {
  await assertAdmin();
  const products = (await getProducts({ includeHidden: true })).filter((p) => DEALER_GROUPS.some((g) => g.test(p)));
  const next: Record<string, PriceSet> = {};
  for (const p of products) {
    const set: PriceSet = {};
    for (const k of PRICE_KEYS) {
      const v = parseEuro(form.get(`${k}_${p.handle}`));
      if (v === "invalid") return { error: `Ungültiger Preis bei „${p.title}“. Bitte nur Zahlen wie 12,50 eintragen.` };
      if (v) set[k] = v;
    }
    if (Object.keys(set).length) next[p.handle] = set;
  }
  await setDealerPrices(() => next);
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler", "layout");
  return { ok: `Basispreise für ${Object.keys(next).length} Artikel gespeichert.` };
}
