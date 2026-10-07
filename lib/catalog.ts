import data from "@/data/products.json";
import { KEYS, getJSON } from "./store";
import type { Catalog, Product } from "./types";

/** Grundkatalog aus data/products.json (Marke, Kollektionen, Produkte ohne Dashboard-Änderungen) – für Produkte immer getProducts()/getBaseProducts() nutzen */
export const catalog = data as Catalog;

/** Im Dashboard änderbare Werte je Produkt (alles optional) */
export type ProductOverride = {
  /** Produkt im Shop ausblenden */
  hidden?: boolean;
  /** Als Bestseller auf der Startseite zeigen */
  featured?: boolean;
  variants?: Record<string, { price?: number; compareAtPrice?: number | null; available?: boolean }>;
  /** Zutaten, Allergene & Nährwerte („“ = Angabe aus dem Katalog entfernen). Der Feldname „material“ stammt aus dem Textil-Shop. */
  material?: string;
};
export type ProductOverrides = Record<string, ProductOverride>;

export async function getOverrides(): Promise<ProductOverrides> {
  return getJSON<ProductOverrides>(KEYS.products, {});
}

/**
 * Im Dashboard angelegte oder inhaltlich bearbeitete Produkte (Texte, Bilder, Varianten).
 * Ein Eintrag ersetzt das gleichnamige Katalogprodukt; `{ deleted: true }` entfernt es aus dem Shop.
 */
export type DeletedProduct = { deleted: true; title: string; deletedAt: string };
export type CustomProducts = Record<string, Product | DeletedProduct>;

export function isDeleted(entry: Product | DeletedProduct | undefined): entry is DeletedProduct {
  return Boolean(entry && "deleted" in entry && entry.deleted);
}

export async function getCustomProducts(): Promise<CustomProducts> {
  return getJSON<CustomProducts>(KEYS.custom, {});
}

/** Grunddaten aller Produkte (Katalog + Dashboard), ohne Preis-Änderungen. Neue Produkte stehen vorne. */
export function mergeBase(custom: CustomProducts): Product[] {
  const fromCatalog = catalog.products.flatMap((p) => {
    const entry = custom[p.handle];
    if (isDeleted(entry)) return [];
    return [entry ?? p];
  });
  const known = new Set(catalog.products.map((p) => p.handle));
  const added = Object.entries(custom)
    .filter(([handle, entry]) => !known.has(handle) && !isDeleted(entry))
    .map(([, entry]) => entry as Product)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...added, ...fromCatalog];
}

export async function getBaseProducts(): Promise<Product[]> {
  return mergeBase(await getCustomProducts());
}

/** Wendet Dashboard-Änderungen auf ein Produkt an */
export function applyOverride(product: Product, override?: ProductOverride): Product {
  if (!override) return product;
  return {
    ...product,
    featured: override.featured ?? product.featured,
    material: override.material !== undefined ? override.material || undefined : product.material,
    variants: product.variants.map((v) => {
      const o = override.variants?.[v.id];
      if (!o) return v;
      const compareAtPrice = o.compareAtPrice === null ? undefined : (o.compareAtPrice ?? v.compareAtPrice);
      return { ...v, price: o.price ?? v.price, compareAtPrice, available: o.available ?? v.available };
    }),
  };
}

/** Alle Produkte mit Dashboard-Änderungen; ausgeblendete nur mit includeHidden */
export async function getProducts({ includeHidden = false } = {}): Promise<Product[]> {
  const [overrides, base] = await Promise.all([getOverrides(), getBaseProducts()]);
  return base
    .filter((p) => includeHidden || !overrides[p.handle]?.hidden)
    .map((p) => applyOverride(p, overrides[p.handle]));
}

export async function getProduct(handle: string): Promise<Product | undefined> {
  return (await getProducts()).find((p) => p.handle === handle);
}

export function getCollection(handle: string) {
  return catalog.collections.find((c) => c.handle === handle);
}

export async function getProductsInCollection(handle: string): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.collections.includes(handle));
}

export async function getFeatured(limit = 8): Promise<Product[]> {
  const products = await getProducts();
  const featured = products.filter((p) => p.featured);
  return (featured.length ? featured : products).slice(0, limit);
}

/** Variante samt Produkt finden – mit aktuellen Preisen (für den Checkout) */
export async function findVariant(variantId: string) {
  for (const product of await getProducts()) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) {
      return { product, variant };
    }
  }
  return undefined;
}

/** Grunddaten eines Produkts (ohne Preis-Änderungen), z. B. für Produkttitel in Bewertungen */
export async function getBaseProduct(handle: string): Promise<Product | undefined> {
  return (await getBaseProducts()).find((p) => p.handle === handle);
}

export function priceRange(product: Product) {
  const prices = product.variants.map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function isOnSale(product: Product) {
  return product.variants.some((v) => v.compareAtPrice !== undefined && v.compareAtPrice > v.price);
}

export function isAvailable(product: Product) {
  return product.variants.some((v) => v.available);
}

export async function getRelated(product: Product, limit = 4): Promise<Product[]> {
  const scored = (await getProducts())
    .filter((p) => p.handle !== product.handle)
    .map((p) => ({
      p,
      score: p.collections.filter((c) => product.collections.includes(c)).length * 2 + p.tags.filter((t) => product.tags.includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}
