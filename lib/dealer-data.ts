import { KEYS, deleteBinary, getBinary, getJSON, putBinary, updateJSON } from "./store";

/** Händlerpreise (netto, in Cent) und Artikelpässe (PDF) – nur im Händlerbereich sichtbar */
export type DealerPrice = { /** Netto-Preis je Tray bzw. je Paket/Palette in Cent */ net?: number };
export type DealerPrices = Record<string, DealerPrice>;

export type DealerPass = { id: string; name: string; size: number; updatedAt: string };
export type DealerPasses = Record<string, DealerPass>;

export const getDealerPrices = async (): Promise<DealerPrices> => getJSON<DealerPrices>(KEYS.dealerPrices, {});
export const getDealerPasses = async (): Promise<DealerPasses> => getJSON<DealerPasses>(KEYS.dealerPasses, {});

export async function setDealerPrices(change: (current: DealerPrices) => DealerPrices) {
  await updateJSON<DealerPrices>(KEYS.dealerPrices, {}, change);
}

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
  const data = await getBinary(pass.id);
  return data ? { data, name: pass.name } : null;
};
