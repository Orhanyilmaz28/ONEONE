import { PRODUCT_SPECS } from "./product-specs";

/** MwSt.-Satz im Shop in Prozent (Ware, Pfand und Versand). Eiskaffee wird noch geprüft – dann hier je Artikel unterscheiden. */
export const CART_VAT = 19;

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

/**
 * Enthaltene MwSt. im Warenkorb – wie auf einer Rechnung je Position gerundet (Ware, Pfand, Versand),
 * so wie Stripe Tax bei Bruttopreisen rechnet. Beispiel 24er Classic: 2,87 + 0,96 + 0,94 = 4,77 €.
 */
export function cartVat(parts: { goods: number; deposit: number; shipping: number }, rate = CART_VAT) {
  return includedVat(parts.goods, rate) + includedVat(parts.deposit, rate) + includedVat(parts.shipping, rate);
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
