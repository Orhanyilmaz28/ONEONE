import { cansOf, formatPrice } from "./format";
import type { Product } from "./types";

/** Reihenfolge und Namen der Bereiche in Preisliste und Artikelpässen */
export const DEALER_GROUPS = [
  { key: "energy", title: "Energy Drinks", test: (p: Product) => p.collections.includes("energy") && !p.collections.includes("mixpakete") },
  { key: "ice-tea", title: "X-Tea Ice Tea", test: (p: Product) => p.collections.includes("ice-tea") && !p.collections.includes("mixpakete") },
  { key: "ice-coffee", title: "Ice Coffee", test: (p: Product) => p.collections.includes("ice-coffee") && !p.collections.includes("mixpakete") },
  { key: "wasser", title: "Aqua x Wasser", test: (p: Product) => p.collections.includes("mineralwasser") && !p.collections.includes("mixpakete") },
] as const;

export type DealerPriceCell = { value?: number; source: "individuell" | "stufe" | "basis" | "leer" };
export type DealerRow = {
  handle: string;
  title: string;
  image: string;
  group: string;
  /** z. B. „1 Tray · 24 Dosen“ */
  unit: string;
  /** Dosen/Flaschen je Tray */
  perTray: number;
  /** Trays je Palette (nur wenn bekannt: 108 bei Dosen) */
  trays?: number;
  t1: DealerPriceCell;
  t2: DealerPriceCell;
  pal: DealerPriceCell;
  pass: boolean;
};

/** Trays je Euro-Palette laut Artikelpass (24 × 250 ml: 108); bei Wasser nicht bekannt */
export const palletTrays = (p: Product) => (p.productType === "Mineralwasser" ? undefined : 108);

export function dealerUnit(p: Product) {
  const v = p.variants[0];
  const n = v ? cansOf(v) : 1;
  const water = p.productType === "Mineralwasser";
  return `1 Tray · ${n.toLocaleString("de-DE")} ${water ? "Flaschen" : "Dosen"}`;
}

export const euro = (cents: number) => formatPrice(cents);
