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

/**
 * Internetseite der Marke (Link „Zur EXSTASE-Website“ in Kopfzeile, Handy-Menü und Fußzeile).
 * Später auf https://exstase.com umstellen: Umgebungsvariable NEXT_PUBLIC_BRAND_SITE_URL in Vercel setzen (oder den Standard hier ändern).
 */
export const BRAND_SITE_URL = (process.env.NEXT_PUBLIC_BRAND_SITE_URL || "https://exstase-animiert.vercel.app").replace(/\/$/, "");

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

/**
 * Füllmenge je Dose/Flasche in ml, gelesen aus Untertitel oder Titel (z. B. „Der Klassiker · 250 ml“, „0,5 l“).
 * Unbekannt → undefined (dann wird kein Grundpreis angezeigt).
 */
export function volumeMlOf(product: { subtitle?: string; title: string }): number | undefined {
  const text = `${product.subtitle ?? ""} ${product.title}`;
  const ml = text.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (ml) return Number(ml[1].replace(",", ".")) || undefined;
  const l = text.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  return l ? Number(l[1].replace(",", ".")) * 1000 || undefined : undefined;
}

/**
 * Grundpreis nach Preisangabenverordnung (§ 4 PAngV): Preis je Liter, ohne Pfand – z. B. „3,00 €/l“.
 * `units` = Dosen/Flaschen in der Packung. Ohne bekannte Füllmenge: null.
 */
export function basePricePerLiter(priceCents: number, units: number, ml: number | undefined) {
  if (!ml || ml <= 0 || units <= 0 || priceCents <= 0) return null;
  return `${formatPrice(Math.round((priceCents * 1000) / (units * ml)))}/l`;
}

/** Pfand in Cent für eine Warenkorb-Position: Dosen je Packung × Menge × 0,25 € */
export function depositFor(variant: { cans?: number; title: string }, quantity: number) {
  return cansOf(variant) * quantity * DEPOSIT_PER_CAN;
}

/** Mixpaket (mehrere Trays) – steht in Listen immer hinter den einzelnen Produkten */
export const isMixProduct = (p: { collections: string[] }) => p.collections.includes("mixpakete");
