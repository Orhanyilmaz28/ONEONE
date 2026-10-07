import type { ProductOverride } from "@/lib/catalog";
import type { Product } from "@/lib/types";

/**
 * Gemeinsame Hilfen für den Bereich „Produkte“ im Dashboard.
 * Wird im Browser (sofortige Rückmeldung beim Tippen) UND auf dem Server (endgültige Prüfung) genutzt –
 * deshalb hier nichts importieren, was nur auf dem Server läuft.
 */

/** Kleinster erlaubter Preis: 0,50 € (Stripe nimmt kleinere Beträge nicht an) */
export const MIN_PRICE = 50;
/** Größter erlaubter Preis: 9.999,00 € */
export const MAX_PRICE = 999_900;

/** Name der Formularfelder je Variante */
export const field = {
  price: (id: string) => `price.${id}`,
  compare: (id: string) => `compare.${id}`,
  available: (id: string) => `available.${id}`,
};

const plainEuro = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const groupedEuro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** 3190 → „31,90“ (für Eingabefelder, ohne Tausenderpunkt und ohne €-Zeichen) */
export function centsToInput(cents: number | undefined | null) {
  return typeof cents === "number" ? plainEuro.format(cents / 100) : "";
}

/** 3190 → „31,90 €“ */
export function euro(cents: number) {
  return groupedEuro.format(cents / 100);
}

/** Ergebnis beim Lesen einer Eingabe: Betrag in Cent (null = leer) oder eine Fehlermeldung */
type Parsed = { cents: number | null; error?: string };

const fail = (error: string): Parsed => ({ cents: null, error });

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Eingabe in Euro lesen – so, wie man es in Deutschland schreibt.
 * „31,90“ · „31,9“ · „31“ · „31.90“ · „1.234,50“ · „31,90 €“ → Cent.
 * Leere Eingabe → `cents: null`.
 */
export function parseEuro(raw: string): Parsed {
  const s = raw
    .trim()
    .replace(/€|eur(o)?/gi, "")
    .replace(/[\s  ]/g, "");
  if (!s) return { cents: null };
  if (s.startsWith("-")) return fail("Der Preis darf nicht negativ sein.");
  if (!/^[\d.,]+$/.test(s)) return fail("Bitte nur Ziffern und ein Komma eingeben, z. B. 31,90.");

  let whole: string;
  let fraction = "";
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length > 2) return fail("Bitte nur ein Komma verwenden, z. B. 31,90.");
    [whole, fraction] = parts;
    // Punkte vor dem Komma sind Tausenderpunkte (1.234,50)
    if (whole.includes(".")) {
      if (!THOUSANDS.test(whole)) return fail("Das sieht nicht wie ein Preis aus – Beispiel: 31,90.");
      whole = whole.replace(/\./g, "");
    }
  } else if (s.includes(".")) {
    if (THOUSANDS.test(s)) {
      // 1.234 → 1234 €
      whole = s.replace(/\./g, "");
    } else {
      const parts = s.split(".");
      if (parts.length > 2) return fail("Das sieht nicht wie ein Preis aus – Beispiel: 31,90.");
      // 31.90 → wie 31,90 behandeln
      [whole, fraction] = parts;
    }
  } else {
    whole = s;
  }

  if (whole === "") whole = "0"; // „,50“ → 0,50 €
  if (!/^\d{1,7}$/.test(whole) || !/^\d*$/.test(fraction)) return fail("Das sieht nicht wie ein Preis aus – Beispiel: 31,90.");
  if (fraction.length > 2) return fail("Bitte höchstens zwei Stellen nach dem Komma.");
  return { cents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")) };
}

/** Preisbereich prüfen – liefert eine Fehlermeldung oder undefined */
export function rangeError(cents: number, what = "Der Preis") {
  if (cents < MIN_PRICE) return `${what} muss mindestens ${euro(MIN_PRICE)} betragen.`;
  if (cents > MAX_PRICE) return `${what} darf höchstens ${euro(MAX_PRICE)} betragen.`;
  return undefined;
}

export type VariantInput = { price: string; compare: string; available: boolean };
export type VariantErrors = { price?: string; compare?: string };
export type VariantValue = { price: number; compareAtPrice?: number; available: boolean };

/** Eine Variante prüfen. Ergebnis: entweder Werte in Cent oder Fehlermeldungen je Feld */
export function checkVariant(input: VariantInput): { value?: VariantValue; errors: VariantErrors } {
  const errors: VariantErrors = {};
  const price = parseEuro(input.price);
  const compare = parseEuro(input.compare);

  let priceCents: number | undefined;
  if (price.error) errors.price = price.error;
  else if (price.cents === null) errors.price = "Bitte einen Preis eingeben.";
  else {
    errors.price = rangeError(price.cents);
    if (!errors.price) priceCents = price.cents;
  }

  let compareCents: number | undefined;
  if (compare.error) errors.compare = compare.error;
  else if (compare.cents !== null) {
    errors.compare = rangeError(compare.cents, "Der Streichpreis");
    if (!errors.compare && priceCents !== undefined && compare.cents <= priceCents) {
      errors.compare = "Der Streichpreis muss höher sein als der Preis – oder einfach leer lassen.";
    }
    if (!errors.compare) compareCents = compare.cents;
  }

  if (!errors.price) delete errors.price;
  if (!errors.compare) delete errors.compare;
  if (errors.price || errors.compare || priceCents === undefined) return { errors };
  return { value: { price: priceCents, compareAtPrice: compareCents, available: input.available }, errors };
}

/* ───────────────────────── Zutaten & Nährwerte ───────────────────────── */

/** Höchstlänge von Zutaten, Nährwerten und Allergenen (der Wert heißt aus historischen Gründen „material“) */
export const MATERIAL_MAX = 1500;

/** Eine Zeile: Steuerzeichen/Zeilenumbrüche zu Leerzeichen, mehrere Leerzeichen zu einem, Rand weg */
export function cleanMaterial(raw: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen gezielt entfernen
  return raw.replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, " ").replace(/\s+/g, " ").trim();
}

export type MaterialCheck = {
  /** Bereinigter Wert („“ = keine Angabe) */
  value: string;
  /** Verhindert das Speichern */
  error?: string;
  /** Freundlicher Tipp, verhindert das Speichern nicht */
  hint?: string;
};

/** Zutaten & Nährwerte prüfen */
export function checkMaterial(raw: string): MaterialCheck {
  const value = cleanMaterial(raw);
  if (!value) return { value };
  if (value.length > MATERIAL_MAX) return { value, error: `Bitte höchstens ${MATERIAL_MAX} Zeichen – gerade sind es ${value.length}.` };
  if (/^\[.*\]$/.test(value)) return { value, error: "Bitte die eckigen Klammern entfernen und die echte Angabe eintragen." };
  if (!/\p{L}{3,}/u.test(value)) return { value, error: "Bitte die Zutaten ausschreiben, z. B. „Wasser, Zucker, Säuerungsmittel …“." };
  return { value };
}

/* ───────────────────────── Speichern ───────────────────────── */

/** Gewünschter Stand eines Produkts (vollständig, in Cent) */
export type DesiredProduct = {
  hidden: boolean;
  featured: boolean;
  variants: Record<string, VariantValue>;
  /** Bereinigte Materialangabe („“ = keine) */
  material: string;
};

/**
 * Nur die Unterschiede zum Grundkatalog speichern.
 * Liefert `undefined`, wenn alles dem Original entspricht (dann wird der Eintrag gelöscht).
 */
export function buildOverride(base: Product, desired: DesiredProduct): ProductOverride | undefined {
  const override: ProductOverride = {};
  if (desired.hidden) override.hidden = true;
  if (desired.featured !== Boolean(base.featured)) override.featured = desired.featured;

  const variants: NonNullable<ProductOverride["variants"]> = {};
  for (const v of base.variants) {
    const d = desired.variants[v.id];
    if (!d) continue;
    const o: NonNullable<ProductOverride["variants"]>[string] = {};
    if (d.price !== v.price) o.price = d.price;
    if (d.compareAtPrice !== v.compareAtPrice) {
      // null = Streichpreis aus dem Original entfernen
      o.compareAtPrice = d.compareAtPrice ?? null;
    }
    if (d.available !== v.available) o.available = d.available;
    if (Object.keys(o).length) variants[v.id] = o;
  }
  if (Object.keys(variants).length) override.variants = variants;
  // „“ wird nur gespeichert, wenn der Katalog selbst eine Angabe hat, die entfernt werden soll
  if (desired.material !== (base.material ?? "")) override.material = desired.material;

  return Object.keys(override).length ? override : undefined;
}

/** Wie viele Varianten wurden gegenüber dem Original geändert? */
export function changedVariantCount(override: ProductOverride | undefined) {
  return override?.variants ? Object.keys(override.variants).length : 0;
}
