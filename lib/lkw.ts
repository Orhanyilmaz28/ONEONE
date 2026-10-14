import type { Product } from "./types";

/** Aqua x Wasser und X-Tea: für Händler nur auf Anfrage bei LKW-Bestellung (im Shop als ausverkauft geführt) */
export const lkwOnly = (p: Pick<Product, "collections">) => p.collections.includes("mineralwasser") || p.collections.includes("ice-tea");
