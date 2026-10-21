import { type ProductOverrides, applyOverride, catalog, isAvailable, priceRange } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { skuInfo } from "./checks";
import { changedVariantCount } from "./pricing";

/**
 * Produktliste im Dashboard: Zeilen, Filter, Suche und Reihenfolge.
 * Die Bearbeiten-Seite nutzt dieselbe Reihenfolge fürs Blättern (‹ ›).
 */

/** Filter mit eigenem Knopf in der Leiste. „Ausgeblendet“ und „Angepasst“ erscheinen nur, wenn es solche Produkte gibt. */
export const FILTERS = [
  { key: "", label: "Alle" },
  { key: "bestseller", label: "Bestseller" },
  { key: "ausverkauft", label: "Ausverkauft" },
  { key: "zu-erledigen", label: "Zu erledigen" },
  { key: "ausgeblendet", label: "Ausgeblendet", onlyIfAny: true },
  { key: "angepasst", label: "Angepasst", onlyIfAny: true },
] as const;

/** Filter ohne eigenen Knopf – erreichbar über den Kasten „Zu erledigen“ (und den Startklar-Check der Übersicht) */
export const TODO_FILTERS = {
  "material-fehlt": { title: "Nur Produkte ohne Zutaten & Nährwerte", how: "Produkt öffnen, bei „Zutaten & Nährwerte“ die Angaben von der Dose eintragen und speichern." },
  "artnr-fehlt": { title: "Nur Produkte ohne Artikelnummer", how: "Die Artikelnummer kommt aus dem Artikelpass des Herstellers. Bitte beim Hersteller erfragen – nicht ausdenken." },
  "artnr-doppelt": { title: "Nur Produkte mit doppelter Artikelnummer", how: "Zwei Sorten tragen dieselbe Nummer. Die richtige Nummer je Sorte bitte beim Hersteller prüfen." },
} as const;

export type FilterKey = (typeof FILTERS)[number]["key"] | keyof typeof TODO_FILTERS;

export function isFilter(v: string): v is FilterKey {
  return v in TODO_FILTERS || FILTERS.some((f) => f.key === v);
}

export const collectionTitle = new Map(catalog.collections.map((c) => [c.handle, c.title]));

/** Eine Zeile der Übersicht: aktueller Stand eines Produkts samt Kennzeichen */
export type Row = {
  product: Product;
  hidden: boolean;
  featured: boolean;
  soldOut: boolean;
  unavailable: number;
  changed: number;
  /** Im Shop sichtbar, aber ohne Zutaten & Nährwerte (Pflicht nach Lebensmittelinformationsverordnung) */
  materialMissing: boolean;
  artNr?: string;
  ean?: string;
  /** Andere Produkte mit derselben Artikelnummer (Titel) */
  artNrDuplicate: string[];
  min: number;
  max: number;
  /** Streichpreis(e) der günstigsten Variante(n), falls vorhanden */
  compare?: number;
  collections: string[];
};

export function buildRows(products: Product[], overrides: ProductOverrides): Row[] {
  const skus = skuInfo(products.map((p) => p.handle));
  const titleOf = new Map(products.map((p) => [p.handle, p.title]));
  return products.map((base) => {
    const override = overrides[base.handle];
    const product = applyOverride(base, override);
    const { min, max } = priceRange(product);
    const cheapest = product.variants.filter((v) => v.price === min && v.compareAtPrice !== undefined && v.compareAtPrice > v.price);
    const sku = skus[base.handle];
    return {
      product,
      hidden: Boolean(override?.hidden),
      featured: Boolean(product.featured),
      soldOut: !isAvailable(product),
      unavailable: product.variants.filter((v) => !v.available).length,
      changed: changedVariantCount(override),
      materialMissing: !override?.hidden && !product.material,
      artNr: sku.artNr,
      ean: sku.spec?.gtin,
      artNrDuplicate: sku.duplicateOf.map((h) => titleOf.get(h) ?? h),
      min,
      max,
      compare: cheapest.length ? Math.min(...cheapest.map((v) => v.compareAtPrice ?? 0)) : undefined,
      collections: product.collections.map((c) => collectionTitle.get(c) ?? c),
    };
  });
}

export function needsWork(r: Row) {
  return r.materialMissing || !r.artNr || r.artNrDuplicate.length > 0;
}

export function matchesFilter(row: Row, filter: FilterKey) {
  switch (filter) {
    case "ausgeblendet":
      return row.hidden;
    case "bestseller":
      return row.featured;
    case "ausverkauft":
      return row.soldOut;
    case "angepasst":
      return row.changed > 0;
    case "zu-erledigen":
      return needsWork(row);
    case "material-fehlt":
      return row.materialMissing;
    case "artnr-fehlt":
      return !row.artNr;
    case "artnr-doppelt":
      return row.artNrDuplicate.length > 0;
    default:
      return true;
  }
}

export function matchesSearch(row: Row, q: string) {
  const needle = q.toLowerCase();
  return [row.product.title, row.product.handle, row.artNr ?? "", row.ean ?? "", ...row.collections].join(" ").toLowerCase().includes(needle);
}

/** Nach Kollektion gruppieren (Reihenfolge wie im Shop); Produkte ohne bekannte Kollektion kommen ans Ende */
export function groupRows(rows: Row[]) {
  return [
    ...catalog.collections.map((c) => ({ key: c.handle, title: c.title, rows: rows.filter((r) => r.product.collections[0] === c.handle) })),
    { key: "__ohne", title: "Ohne Kollektion", rows: rows.filter((r) => !collectionTitle.has(r.product.collections[0] ?? "")) },
  ].filter((g) => g.rows.length);
}

/** Link zu einem Produkt, der Filter und Suche der Liste mitnimmt (fürs Blättern) */
export function productHref(handle: string, filter: string, q: string) {
  const params = new URLSearchParams();
  if (filter) params.set("liste", filter);
  if (q) params.set("suche", q);
  const s = params.toString();
  return `/admin/produkte/${handle}${s ? `?${s}` : ""}`;
}

/** Link zurück zur Liste mit derselben Auswahl */
export function listHref(filter: string, q: string) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (q) params.set("q", q);
  const s = params.toString();
  return `/admin/produkte${s ? `?${s}` : ""}`;
}
