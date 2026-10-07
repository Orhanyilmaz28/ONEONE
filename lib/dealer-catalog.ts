import { cansOf, formatPrice } from "./format";
import type { Product } from "./types";

/** Reihenfolge und Namen der Bereiche in Preisliste und Artikelpässen */
export const DEALER_GROUPS = [
  { key: "energy", title: "Energy Drinks", test: (p: Product) => p.collections.includes("energy") && !p.collections.includes("mixpakete") },
  { key: "ice-tea", title: "X-Tea Ice Tea", test: (p: Product) => p.collections.includes("ice-tea") && !p.collections.includes("mixpakete") },
  { key: "ice-coffee", title: "Ice Coffee", test: (p: Product) => p.collections.includes("ice-coffee") && !p.collections.includes("mixpakete") },
  { key: "wasser", title: "Aqua x Wasser", test: (p: Product) => p.collections.includes("mineralwasser") && !p.collections.includes("mixpakete") },
  { key: "mix", title: "Mixpakete", test: (p: Product) => p.collections.includes("mixpakete") && !p.onRequest },
  { key: "palette", title: "Paletten", test: (p: Product) => Boolean(p.onRequest) },
] as const;

export type DealerRow = {
  handle: string;
  title: string;
  image: string;
  group: string;
  /** z. B. „24 Dosen · 0,25 l“ */
  unit: string;
  /** Netto-Händlerpreis in Cent (leer = noch nicht festgelegt) */
  net?: number;
  /** Netto je Dose/Flasche in Cent */
  netPerUnit?: number;
  pass: boolean;
};

export function dealerUnit(p: Product) {
  const v = p.variants[0];
  const n = v ? cansOf(v) : 1;
  const water = p.productType === "Mineralwasser";
  const trays = p.contents?.reduce((a, [, c]) => a + c, 0);
  const pieces = `${n.toLocaleString("de-DE")} ${water ? "Flaschen" : "Dosen"}`;
  if (trays) return `${trays} Trays · ${pieces}`;
  return `1 Tray · ${pieces}`;
}

export const euro = (cents: number) => formatPrice(cents);
