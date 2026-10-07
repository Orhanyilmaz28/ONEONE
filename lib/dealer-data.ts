import { promises as fs } from "node:fs";
import path from "node:path";
import { BUNDLED_PASSES } from "./bundled-passes";
import { DEFAULT_TIERS, type PriceSet, type Tier } from "./dealer-pricing";
import { KEYS, deleteBinary, getBinary, getJSON, putBinary, updateJSON } from "./store";

/** Basispreise (netto), Händlerstufen und Artikelpässe (PDF) – nur im Händlerbereich sichtbar */
export type DealerPrices = Record<string, PriceSet>;

export const getDealerPrices = async (): Promise<DealerPrices> => {
  const raw = await getJSON<Record<string, PriceSet & { net?: number }>>(KEYS.dealerPrices, {});
  // ältere Einträge hatten nur „net“ (= Preis für 1 Tray)
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { t1: v.t1 ?? v.net, t2: v.t2, pal: v.pal }]));
};

export async function setDealerPrices(change: (current: DealerPrices) => DealerPrices) {
  await updateJSON<DealerPrices>(KEYS.dealerPrices, {}, change);
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
