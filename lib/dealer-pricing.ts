/**
 * Händlerpreise – ohne Server-Abhängigkeiten, damit sie auch im Browser genutzt werden können.
 *
 * Im Dashboard werden nur Dosenpreise (netto, in Cent – auch mit Zehntel-Cent, z. B. 41,5) gepflegt, und zwar in
 * Preisgruppen (z. B. „Classic“, „Sorten“, „Ice Coffee“) mit einer Mengenstaffel pro Sorte: 1, 2, 4, 8, 10 Trays und Palette.
 * Jeder Artikel gehört zu einer Preisgruppe. Daraus rechnet der Shop Tray-Preise, Stufen-Nachlass und Bestellsummen.
 * Jeder Händler hat eine Stufe (Prozent Nachlass) und kann je Preisgruppe eigene Dosenpreise haben (Vorrang vor der Stufe).
 */
export const STEPS = [
  { key: "s1", min: 1, label: "1 Tray", short: "1" },
  { key: "s2", min: 2, label: "ab 2 Trays", short: "2" },
  { key: "s4", min: 4, label: "ab 4 Trays", short: "4" },
  { key: "s8", min: 8, label: "ab 8 Trays", short: "8" },
  { key: "s10", min: 10, label: "ab 10 Trays", short: "10" },
  { key: "pal", min: 120, label: "Palette", short: "Palette" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export const STEP_KEYS = STEPS.map((s) => s.key) as StepKey[];

/** Bezeichnung einer Preisstufe (auch für ältere Bestellungen mit „t1“/„t2“) */
export const STEP_LABELS: Record<string, string> = { ...Object.fromEntries(STEPS.map((s) => [s.key, s.key === "pal" ? "Palettenpreis" : s.label])), t1: "1 Tray", t2: "ab 2 Trays" };

/** Dosenpreise je Stufe in Cent (netto) */
export type CanPrices = Partial<Record<StepKey, number>>;
export type PriceGroup = { id: string; name: string; prices: CanPrices };
export type DealerPricing = { groups: PriceGroup[]; /** Produkt-Handle → Preisgruppe */ assign: Record<string, string> };
export type Tier = { id: string; name: string; /** Nachlass in Prozent auf die Basispreise (0–90) */ percent: number };

/** Voreinstellung, bis im Dashboard eigene Stufen gespeichert werden (Prozente frei änderbar) */
export const DEFAULT_TIERS: Tier[] = [
  { id: "basic", name: "Basic", percent: 0 },
  { id: "silver", name: "Silver", percent: 3 },
  { id: "gold", name: "Gold", percent: 6 },
  { id: "platin", name: "Platin", percent: 10 },
];

/** Konditionen laut Händler-Flyer („Ihre Konditionen“) – gelten, bis im Dashboard eigene gespeichert werden */
export const DEFAULT_PRICING: DealerPricing = {
  groups: [
    { id: "classic", name: "Classic", prices: { s1: 42, s2: 40, s4: 36, s8: 34, s10: 32, pal: 32 } },
    { id: "sorten", name: "Energy Sorten", prices: { s1: 44, s2: 42, s4: 38, s8: 36, s10: 34, pal: 34 } },
    { id: "ice-coffee", name: "Ice Coffee", prices: { pal: 45 } },
  ],
  assign: {},
};

/** Preisgruppe eines Artikels: eigene Zuordnung, sonst Classic / Energy Sorten / Ice Coffee (Wasser und X-Tea: keine) */
export function groupOf(p: { handle: string; collections: string[] }, pricing: DealerPricing): PriceGroup | undefined {
  const own = pricing.assign[p.handle];
  if (own === "") return undefined;
  const id = own ?? (p.handle === "classic" ? "classic" : p.collections.includes("energy") ? "sorten" : p.collections.includes("ice-coffee") ? "ice-coffee" : undefined);
  return pricing.groups.find((g) => g.id === id);
}

export type Effective = { value?: number; source: "individuell" | "stufe" | "basis" | "leer" };

/** Dosenpreis eines Händlers je Stufe: individuell → Gruppenpreis minus Stufen-Prozent → Gruppenpreis */
export function effectiveCanPrices(base: CanPrices | undefined, tier: Tier | undefined, custom: CanPrices | undefined): Record<StepKey, Effective> {
  const pct = tier?.percent ?? 0;
  return Object.fromEntries(
    STEP_KEYS.map((k) => {
      const own = custom?.[k];
      if (own) return [k, { value: own, source: "individuell" }];
      const b = base?.[k];
      if (!b) return [k, { source: "leer" }];
      // Stufen-Nachlass auf volle Cent je Dose gerundet
      return [k, pct ? { value: Math.round(b * (1 - pct / 100)), source: "stufe" } : { value: b, source: "basis" }];
    }),
  ) as Record<StepKey, Effective>;
}

/** „0,42“ / „0.415“ / „0,42 €“ → Cent (42 bzw. 41,5); leer → undefined; sonst "invalid" */
export function parseCanPrice(raw: unknown): number | undefined | "invalid" {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!s) return undefined;
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) return "invalid";
  const c = Math.round(Number(s) * 1000) / 10;
  return c > 0 && c < 100_000 ? c : undefined;
}

/** Cent → Eingabefeld („0,42“ bzw. „0,415“) */
export const canToInput = (c?: number) => (c ? (c / 100).toFixed(Number.isInteger(c) ? 2 : 3).replace(".", ",") : "");

/** Dosenpreis anzeigen: „0,42 €“ bzw. „0,415 €“ */
export const formatCan = (c: number) => `${(c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`;
