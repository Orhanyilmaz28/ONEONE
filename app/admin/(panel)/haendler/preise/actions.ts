"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { saveBasePricing } from "@/lib/dealer-data";
import { type CanPrices, type DealerPricing, STEPS, parseCanPrice } from "@/lib/dealer-pricing";
import { lkwOnly } from "@/lib/lkw";

export type PriceState = { ok?: string; error?: string } | undefined;

/** Preisgruppen (Dosenpreise je Mengenstufe) und Zuordnung der Artikel speichern */
export async function savePricesAction(_prev: PriceState, form: FormData): Promise<PriceState> {
  await assertAdmin();
  const count = Math.min(30, Math.max(0, Number(form.get("count")) || 0));
  const groups: DealerPricing["groups"] = [];
  for (let i = 0; i < count; i++) {
    const id = String(form.get(`g${i}_id`) ?? "");
    const name = String(form.get(`g${i}_name`) ?? "").trim().slice(0, 40);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
    if (!name) return { error: "Bitte jeder Preisgruppe einen Namen geben." };
    const prices: CanPrices = {};
    for (const s of STEPS) {
      const v = parseCanPrice(form.get(`g${i}_${s.key}`));
      if (v === "invalid") return { error: `Ungültiger Dosenpreis bei „${name}“ (${s.label}). Bitte nur Zahlen wie 0,42 eintragen.` };
      if (v) prices[s.key] = v;
    }
    if (groups.some((g) => g.id === id)) continue;
    groups.push({ id, name, prices });
  }
  const products = (await getProducts({ includeHidden: true })).filter((p) => DEALER_GROUPS.some((g) => g.test(p)) && !lkwOnly(p));
  const assign: Record<string, string> = {};
  for (const p of products) {
    const v = String(form.get(`a_${p.handle}`) ?? "");
    // Ausdrücklich „keine“ (leer) wird gespeichert, damit die Voreinstellung nicht wieder greift
    assign[p.handle] = groups.some((g) => g.id === v) ? v : "";
  }
  await saveBasePricing({ groups, assign });
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler", "layout");
  const priced = Object.values(assign).filter(Boolean).length;
  return { ok: `Gespeichert: ${groups.length} Preisgruppen, ${priced} Artikel mit Preisen.` };
}
