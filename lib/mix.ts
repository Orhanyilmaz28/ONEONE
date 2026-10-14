/**
 * Mix-Rabatt (ohne Server-Abhängigkeiten – gilt gleich im Warenkorb, im Mix-Konfigurator und an der Kasse).
 * Rabatt gibt es nur, wenn wirklich gemischt wird (mindestens 2 verschiedene Sorten im Warenkorb).
 * Die Prozente richten sich nach der Gesamtzahl der Trays.
 */
export const MIX_TIERS = [
  { min: 2, pct: 3 },
  { min: 3, pct: 5 },
  { min: 4, pct: 7 },
  { min: 6, pct: 9 },
  { min: 9, pct: 10 },
  { min: 12, pct: 12 },
  { min: 18, pct: 13 },
  { min: 24, pct: 15 },
] as const;

export type MixLine = { handle: string; quantity: number; price: number };

export type MixResult = {
  trays: number;
  sorts: number;
  subtotal: number;
  pct: number;
  discount: number;
  /** nächste Stufe (falls es eine gibt) */
  next?: { trays: number; pct: number; missing: number };
};

export function tierFor(trays: number) {
  let pct = 0;
  for (const t of MIX_TIERS) if (trays >= t.min) pct = t.pct;
  return pct;
}

export function mixDiscount(lines: MixLine[]): MixResult {
  const active = lines.filter((l) => l.quantity > 0);
  const trays = active.reduce((n, l) => n + l.quantity, 0);
  const sorts = new Set(active.map((l) => l.handle)).size;
  const subtotal = active.reduce((n, l) => n + l.quantity * l.price, 0);
  const pct = sorts >= 2 ? tierFor(trays) : 0;
  const discount = Math.round((subtotal * pct) / 100);
  const nextTier = MIX_TIERS.find((t) => t.min > trays);
  const next = nextTier ? { trays: nextTier.min, pct: nextTier.pct, missing: nextTier.min - trays } : undefined;
  return { trays, sorts, subtotal, pct, discount, next };
}
