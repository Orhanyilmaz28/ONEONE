import { promises as fs } from "node:fs";
import path from "node:path";
import { BUNDLED_PASSES } from "./bundled-passes";
import { type CanPrices, DEFAULT_PRICING, type DealerPricing, DEFAULT_TIERS, STEP_KEYS, type Tier } from "./dealer-pricing";
import { KEYS, deleteBinary, getBinary, getJSON, putBinary, updateJSON } from "./store";

/** Dosenpreise (netto) in Preisgruppen, Händlerstufen und Artikelpässe (PDF) – nur im Händlerbereich sichtbar */

const cleanPrices = (p: unknown): CanPrices =>
  Object.fromEntries(STEP_KEYS.flatMap((k) => {
    const v = (p as Record<string, unknown> | undefined)?.[k];
    return typeof v === "number" && v > 0 ? [[k, v]] : [];
  }));

/** Preisgruppen und Zuordnung; ältere Speicherstände (Preise je Tray) werden ignoriert → Konditionen laut Flyer */
export const getBasePricing = async (): Promise<DealerPricing> => {
  const raw = await getJSON<Partial<DealerPricing> | null>(KEYS.dealerPrices, null);
  if (!raw || !Array.isArray(raw.groups)) return DEFAULT_PRICING;
  return {
    groups: raw.groups.filter((g) => g && typeof g.id === "string" && typeof g.name === "string").map((g) => ({ id: g.id, name: g.name, prices: cleanPrices(g.prices) })),
    assign: raw.assign && typeof raw.assign === "object" ? Object.fromEntries(Object.entries(raw.assign).filter(([, v]) => typeof v === "string")) : {},
  };
};

export async function saveBasePricing(next: DealerPricing) {
  await updateJSON<unknown>(KEYS.dealerPrices, null, () => next);
}

/** Händlerstufen; ohne eigene Einträge gibt es „Standard“ mit 0 % */
export async function getTiers(): Promise<Tier[]> {
  const list = await getJSON<Tier[]>(KEYS.dealerTiers, []);
  return Array.isArray(list) && list.length ? list : DEFAULT_TIERS;
}

export async function saveTiers(tiers: Tier[]) {
  await updateJSON<Tier[]>(KEYS.dealerTiers, [], () => tiers);
}

export type DealerPass = { id: string; name: string; size: number; updatedAt: string };
export type DealerPasses = Record<string, DealerPass>;

/** Mitgelieferte Pässe (aus dem Code) und im Dashboard hochgeladene – hochgeladene haben Vorrang */
export const getDealerPasses = async (): Promise<DealerPasses> => {
  const bundled: DealerPasses = Object.fromEntries(Object.entries(BUNDLED_PASSES).map(([k, size]) => [k, { id: `file:${k}`, name: `${k}.pdf`, size, updatedAt: "" }]));
  return { ...bundled, ...(await getJSON<DealerPasses>(KEYS.dealerPasses, {})) };
};

/** Artikelpass (PDF) für ein Produkt speichern; `key` = Produkt-Handle oder „katalog“ */
export async function savePass(key: string, name: string, data: Buffer) {
  const id = `pass-${key}-${Date.now().toString(36)}`;
  await putBinary(id, data);
  let old: DealerPass | undefined;
  await updateJSON<DealerPasses>(KEYS.dealerPasses, {}, (all) => {
    old = all[key];
    return { ...all, [key]: { id, name, size: data.length, updatedAt: new Date().toISOString() } };
  });
  if (old) await deleteBinary([(old as DealerPass).id]).catch(() => undefined);
}

export async function removePass(key: string) {
  let old: DealerPass | undefined;
  await updateJSON<DealerPasses>(KEYS.dealerPasses, {}, (all) => {
    old = all[key];
    const { [key]: _gone, ...rest } = all;
    return rest;
  });
  if (old) await deleteBinary([(old as DealerPass).id]).catch(() => undefined);
}

export const readPass = async (key: string): Promise<{ data: Buffer; name: string } | null> => {
  const pass = (await getDealerPasses())[key];
  if (!pass) return null;
  if (pass.id.startsWith("file:")) {
    const data = await fs.readFile(path.join(process.cwd(), "data", "artikelpaesse", `${key}.pdf`)).catch(() => null);
    return data ? { data, name: pass.name } : null;
  }
  const data = await getBinary(pass.id);
  return data ? { data, name: pass.name } : null;
};
