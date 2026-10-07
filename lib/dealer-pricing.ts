/**
 * Händlerpreise (netto, in Cent) – ohne Server-Abhängigkeiten, damit sie auch im Browser genutzt werden können.
 *
 * Es gibt drei Preise je Artikel: 1 Tray, je Tray ab 2 Trays und je Palette. Jeder Händler hat eine Stufe
 * (Name + Prozent Nachlass auf die Basispreise) und kann zusätzlich individuelle Preise haben, die immer Vorrang haben.
 */
export type PriceSet = { /** je Tray bei 1 Tray */ t1?: number; /** je Tray ab 2 Trays */ t2?: number; /** je Palette */ pal?: number };
export type Tier = { id: string; name: string; /** Nachlass in Prozent auf die Basispreise (0–90) */ percent: number };

export const PRICE_KEYS = ["t1", "t2", "pal"] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];
export const PRICE_LABELS: Record<PriceKey, string> = { t1: "1 Tray", t2: "ab 2 Trays (je Tray)", pal: "Palette" };

export const DEFAULT_TIERS: Tier[] = [{ id: "standard", name: "Standard", percent: 0 }];

export type Effective = { value?: number; source: "individuell" | "stufe" | "basis" | "leer" };

/** Preis eines Händlers für einen Preis-Typ: individuell → Stufe auf Basispreis → Basispreis */
export function effectivePrice(key: PriceKey, base: PriceSet | undefined, tier: Tier | undefined, custom: PriceSet | undefined): Effective {
  const own = custom?.[key];
  if (own) return { value: own, source: "individuell" };
  const b = base?.[key];
  if (!b) return { source: "leer" };
  const pct = tier?.percent ?? 0;
  if (!pct) return { value: b, source: "basis" };
  return { value: Math.round(b * (1 - pct / 100)), source: "stufe" };
}

/** „12,50“ oder „12.5“ → Cent; leer → undefined; sonst "invalid" */
export function parseEuro(raw: unknown): number | undefined | "invalid" {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!s) return undefined;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return "invalid";
  const c = Math.round(Number(s) * 100);
  return c > 0 ? c : undefined;
}

export const centsToInput = (c?: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
