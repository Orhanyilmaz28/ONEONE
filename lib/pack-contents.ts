/** Dosen bzw. Flaschen je Tray (Energy, Coffee, Tea: 24 Dosen; Wasser: 12 Flaschen) */
export const trayCans = (handle: string) => (handle.startsWith("wasser") ? 12 : 24);

/** Sortenfarben (Kacheln, Glow) */
export const SORT_COLORS: Record<string, string> = {
  classic: "#a8e652",
  tropical: "#1fb6ff",
  "kiwi-lemon": "#ffd400",
  watermelon: "#ff2d95",
  "white-peach": "#ffb4a2",
  "ice-bonbon": "#7fd4ff",
  lime: "#c6f03c",
  "blueberry-coconut": "#8c6cff",
  zero: "#e9f5dc",
  "ice-coffee-latte": "#e3c9a3",
  "ice-coffee-cappuccino": "#c69c6d",
  "xtea-peach": "#ffa36c",
  "xtea-lemon": "#ffe14d",
  "xtea-watermelon": "#ff5c8a",
  "wasser-still": "#ff6fb5",
  "wasser-medium": "#4caf50",
  "wasser-classic": "#42a5f5",
};

export const SORT_NAMES: Record<string, string> = {
  classic: "Classic",
  tropical: "Tropical",
  "kiwi-lemon": "Kiwi & Lemon",
  watermelon: "Watermelon",
  "white-peach": "White Peach",
  "ice-bonbon": "Ice Bonbon",
  lime: "Lime",
  "blueberry-coconut": "Blueberry Coconut",
  zero: "Zero",
  "ice-coffee-latte": "Ice Coffee Latte",
  "ice-coffee-cappuccino": "Ice Coffee Cappuccino",
  "xtea-peach": "X-Tea Peach",
  "xtea-lemon": "X-Tea Lemon",
  "xtea-watermelon": "X-Tea Watermelon",

  "wasser-still": "Aqua x Still",
  "wasser-medium": "Aqua x Medium",
  "wasser-classic": "Aqua x Classic",
};

/**
 * Füllmenge je Dose/Flasche in ml – für den Grundpreis (Preis pro Liter, Pflicht nach § 4 PAngV).
 * X-Tea fehlt bewusst, bis die Füllmenge feststeht (dann wird dort kein Grundpreis angezeigt).
 */
export const UNIT_ML: Record<string, number> = {
  classic: 250,
  tropical: 250,
  "kiwi-lemon": 250,
  watermelon: 250,
  "white-peach": 250,
  "ice-bonbon": 250,
  lime: 250,
  "blueberry-coconut": 250,
  zero: 250,
  "ice-coffee-latte": 250,
  "ice-coffee-cappuccino": 250,
  "wasser-still": 500,
  "wasser-medium": 500,
  "wasser-classic": 500,
};

type PricedProduct = { handle: string; subtitle?: string; contents?: [handle: string, trays: number][] };
type PricedVariant = { price: number; title: string; cans?: number };

/** Gesamtinhalt einer Packung in Litern – null, wenn die Füllmenge einer Sorte unbekannt ist */
export function litresOf(product: PricedProduct, variant: PricedVariant): number | null {
  if (product.contents?.length) {
    let ml = 0;
    for (const [h, trays] of product.contents) {
      if (!UNIT_ML[h]) return null;
      ml += trays * trayCans(h) * UNIT_ML[h];
    }
    return ml / 1000;
  }
  // Einzelprodukt: Füllmenge aus der Liste oder aus dem Untertitel („… · 250 ml“, z. B. bei im Dashboard angelegten Produkten)
  const fromSubtitle = Number(product.subtitle?.match(/(\d{2,4})\s*ml\b/i)?.[1]);
  const ml = UNIT_ML[product.handle] ?? (fromSubtitle || 0);
  if (!ml) return null;
  const m = variant.title.match(/(\d+)\s*(?:er\b|dosen|flaschen|stück)/i);
  const units = variant.cans && variant.cans > 0 ? variant.cans : m ? Math.max(1, Number(m[1])) : 1;
  return (units * ml) / 1000;
}

/** Grundpreis als Text, z. B. „3,00 €/l“ (ohne Pfand) – null, wenn die Füllmenge unbekannt ist */
export function unitPriceLabel(product: PricedProduct, variant: PricedVariant): string | null {
  const litres = litresOf(product, variant);
  if (!litres) return null;
  return `${(variant.price / litres / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/l`;
}
