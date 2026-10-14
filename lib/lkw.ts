import type { Product } from "./types";

/** Aqua x Wasser und X-Tea gibt es nur auf Anfrage bei LKW-Bestellung – kein Warenkorb, keine Einzel-Trays */
export const lkwOnly = (p: Pick<Product, "collections">) => p.collections.includes("mineralwasser") || p.collections.includes("ice-tea");

/** Passende Auswahl im Anfrageformular (/palette) zu einem Produkt */
export function requestKind(p: Pick<Product, "collections">) {
  if (p.collections.includes("mineralwasser")) return "wasser";
  if (p.collections.includes("ice-tea")) return "ice-tea";
  if (p.collections.includes("ice-coffee")) return "ice-coffee";
  return "energy";
}
