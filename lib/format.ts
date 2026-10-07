const eur = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatPrice(cents: number) {
  return eur.format(cents / 100);
}

// Versandkosten stehen in den Einstellungen (Dashboard → Einstellungen, lib/settings.ts)

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** Einwegpfand je Dose in Cent (wird an der Kasse separat berechnet, nicht im Produktpreis enthalten) */
export const DEPOSIT_PER_CAN = 25;

/**
 * Anzahl Dosen in einer Variante: Angabe im Katalog, sonst aus dem Titel gelesen („12er Pack“, „24 Dosen“) – sonst 1.
 * So bekommen auch im Dashboard neu angelegte Produkte Pfand.
 */
export function cansOf(variant: { cans?: number; title: string }) {
  if (variant.cans && variant.cans > 0) return variant.cans;
  const m = variant.title.match(/(\d+)\s*(?:er\b|dosen|flaschen|stück)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** Pfand in Cent für eine Warenkorb-Position: Dosen je Packung × Menge × 0,25 € */
export function depositFor(variant: { cans?: number; title: string }, quantity: number) {
  return cansOf(variant) * quantity * DEPOSIT_PER_CAN;
}
