"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { setDealerPrices } from "@/lib/dealer-data";

/** „12,50“ oder „12.5“ → Cent; leer → undefined */
function toCents(raw: FormDataEntryValue | null): number | undefined | "invalid" {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!s) return undefined;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return "invalid";
  return Math.round(Number(s) * 100);
}

export type PriceState = { ok?: string; error?: string } | undefined;

export async function savePricesAction(_prev: PriceState, form: FormData): Promise<PriceState> {
  await assertAdmin();
  const products = await getProducts({ includeHidden: true });
  const next: Record<string, number | undefined> = {};
  for (const p of products) {
    const v = toCents(form.get(`net_${p.handle}`));
    if (v === "invalid") return { error: `Ungültiger Preis bei „${p.title}“. Bitte nur Zahlen wie 12,50 eintragen.` };
    next[p.handle] = v;
  }
  await setDealerPrices(() => Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { net: v as number }])));
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler/preise");
  return { ok: `${Object.values(next).filter((v) => v !== undefined).length} Händlerpreise gespeichert.` };
}

/** Vorschlag: aus dem Shop-Preis (brutto, 19 % MwSt.) einen Netto-Händlerpreis mit Abschlag berechnen – nur für leere Felder */
export async function suggestPricesAction(_prev: PriceState, form: FormData): Promise<PriceState> {
  await assertAdmin();
  const pct = Number(String(form.get("pct") ?? "").replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 60) return { error: "Bitte einen Abschlag zwischen 0 und 60 % eintragen." };
  const products = await getProducts({ includeHidden: true });
  let filled = 0;
  await setDealerPrices((current) => {
    const out = { ...current };
    for (const p of products) {
      if (out[p.handle]?.net || p.onRequest) continue;
      const gross = p.variants[0]?.price;
      if (!gross) continue;
      out[p.handle] = { net: Math.round(((gross / 1.19) * (1 - pct / 100)) / 10) * 10 };
      filled++;
    }
    return out;
  });
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler/preise");
  return { ok: `${filled} leere Preise mit ${pct} % Abschlag auf den Netto-Shop-Preis eingetragen. Bitte prüfen und speichern.` };
}
