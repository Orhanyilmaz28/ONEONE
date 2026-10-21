import { PRODUCT_SPECS, type ProductSpec } from "@/lib/product-specs";

/**
 * Artikelnummern aus den Artikelpässen (lib/product-specs.ts) – nur lesen.
 * Liefert je Produkt die Nummer und, falls dieselbe Nummer bei anderen Produkten steht, deren Handles.
 */
export type SkuInfo = { artNr?: string; spec?: ProductSpec; duplicateOf: string[] };

export function skuInfo(handles: string[], specs: Record<string, ProductSpec> = PRODUCT_SPECS): Record<string, SkuInfo> {
  const owners = new Map<string, string[]>();
  for (const h of handles) {
    const nr = specs[h]?.artNr?.trim();
    if (nr) owners.set(nr, [...(owners.get(nr) ?? []), h]);
  }
  return Object.fromEntries(
    handles.map((h) => {
      const nr = specs[h]?.artNr?.trim() || undefined;
      return [h, { artNr: nr, spec: specs[h], duplicateOf: nr ? (owners.get(nr) ?? []).filter((o) => o !== h) : [] }];
    }),
  );
}
