import { PRODUCT_SPECS } from "./product-specs";

/** Normaler MwSt.-Satz im Shop in Prozent (Ware, Pfand und Versand) */
export const CART_VAT = 19;

/**
 * Abweichende MwSt.-Sätze je Produktart (Feld „productType“ im Katalog). Leer = alles 19 %.
 * Offener Prüfpunkt: Eiskaffee (Milchmischgetränk) könnte 7 % haben – erst nach Bestätigung durch den Steuerberater
 * hier eintragen, z. B. `"Ice Coffee": 7`. Pfand und Versand folgen dann automatisch dem Satz der Ware.
 */
export const VAT_BY_PRODUCT_TYPE: Record<string, number> = {};

/** MwSt.-Satz eines Produkts (unbekannt → Normalsatz) */
export function vatRateFor(product: { productType?: string } | undefined | null): number {
  const t = product?.productType?.trim();
  return (t && VAT_BY_PRODUCT_TYPE[t]) || CART_VAT;
}

/**
 * Stripe-Steuerart „Allgemein – körperliche Waren“ (Normalsatz, in Deutschland 19 %) für Getränke und Pfand.
 * Wirkt nur mit Stripe Tax (STRIPE_AUTOMATIC_TAX=1). Versand nimmt Stripe automatisch mit dem Satz der Ware.
 */
export const STRIPE_TAX_CODE = "txcd_99999999";

/** Enthaltene MwSt. eines Bruttobetrags in Cent, auf ganze Cent gerundet (z. B. 18,00 € → 2,87 €) */
export function includedVat(gross: number, rate = CART_VAT) {
  if (!(gross > 0)) return 0;
  return gross - Math.round((gross * 100) / (100 + rate));
}

/** Betrag in ganzen Cent nach Gewichten aufteilen (Summe bleibt exakt, Rest an die größten Nachkommaanteile) */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((n, w) => n + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * Math.max(0, w)) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((n, v) => n + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

export type TaxPosition = { kind: "ware" | "pfand" | "versand"; gross: number; rate: number; net: number; vat: number };
export type TaxSummary = { positions: TaxPosition[]; byRate: { rate: number; gross: number; net: number; vat: number }[]; vat: number; gross: number };

const pos = (kind: TaxPosition["kind"], gross: number, rate: number): TaxPosition => {
  const vat = includedVat(gross, rate);
  return { kind, gross, rate, net: gross - vat, vat };
};

/**
 * MwSt. einer Bestellung mit Bruttopreisen – je Position gerundet (wie auf der Rechnung und bei Stripe Tax).
 * Pfand und Versand folgen dem Satz der Ware (Nebenleistung): Pfand nach Dosen je Satz, Versand nach Warenwert je Satz.
 * Beispiel 24er Classic (18,00 + 6,00 Pfand + 5,90 Versand): 2,87 + 0,96 + 0,94 = 4,77 €.
 */
export function orderTax(goods: { gross: number; rate: number; cans?: number | null }[], deposit: number, shipping: number): TaxSummary {
  const positions: TaxPosition[] = goods.map((g) => pos("ware", g.gross, g.rate));
  const rates = [...new Set(goods.map((g) => g.rate))];
  if (!rates.length) rates.push(CART_VAT);
  const share = (amount: number, weight: (g: (typeof goods)[number]) => number, kind: TaxPosition["kind"]) => {
    if (!(amount > 0)) return;
    const w = rates.map((r) => goods.filter((g) => g.rate === r).reduce((n, g) => n + weight(g), 0));
    allocate(amount, w).forEach((a, i) => a > 0 && positions.push(pos(kind, a, rates[i])));
  };
  const cansKnown = goods.length > 0 && goods.every((g) => typeof g.cans === "number" && g.cans > 0);
  share(deposit, (g) => (cansKnown ? (g.cans as number) : g.gross), "pfand");
  share(shipping, (g) => g.gross, "versand");
  const byRate = [...new Set(positions.map((p) => p.rate))]
    .sort((a, b) => b - a)
    .map((rate) => {
      const ps = positions.filter((p) => p.rate === rate);
      return { rate, gross: ps.reduce((n, p) => n + p.gross, 0), net: ps.reduce((n, p) => n + p.net, 0), vat: ps.reduce((n, p) => n + p.vat, 0) };
    });
  return { positions, byRate, vat: byRate.reduce((n, r) => n + r.vat, 0), gross: positions.reduce((n, p) => n + p.gross, 0) };
}

/** Enthaltene MwSt. im Warenkorb (alles zum Normalsatz) – Kurzform von orderTax */
export function cartVat(parts: { goods: number; deposit: number; shipping: number }, rate = CART_VAT) {
  return orderTax([{ gross: parts.goods, rate }], parts.deposit, parts.shipping).vat;
}

/**
 * Inhalt einer Packung für die Anzeige, z. B. „24 × 250 ml“ (aus dem Artikelpass, sonst aus Dosenzahl und Produktart).
 * Leer, wenn nichts Sinnvolles bekannt ist.
 */
export function packContentLabel(product: { handle: string; productType?: string; title?: string }, cans: number) {
  const fromSpec = PRODUCT_SPECS[product.handle]?.tray.match(/^(\d+)\s*×\s*(\d+)\s*ml/);
  if (fromSpec && Number(fromSpec[1]) === cans) return `${fromSpec[1]} × ${fromSpec[2]} ml`;
  if (!(cans > 1)) return "";
  const water = /wasser|aqua/i.test(`${product.productType ?? ""} ${product.title ?? ""} ${product.handle}`);
  return `${cans} × ${water ? 500 : 250} ml`;
}
