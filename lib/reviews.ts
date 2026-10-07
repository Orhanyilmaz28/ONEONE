import reviewsData from "@/data/reviews.json";
import salesData from "@/data/sales.json";

/**
 * Bewertungen – dieser Teil ist auch im Browser nutzbar (keine Datenbank-Zugriffe).
 *
 * Es gibt zwei Quellen:
 * 1. Feste Bewertungen aus data/reviews.json (z. B. aus dem bisherigen Shop) – nicht im Dashboard änderbar.
 * 2. Bewertungen aus dem Shop-Formular, die im Dashboard freigegeben wurden (lib/review-store.ts, nur auf dem Server).
 * Beide werden für die Anzeige mit `mergeReviews` zusammengeführt.
 */

export type Review = {
  id: string;
  product: string;
  name: string;
  rating: number;
  title?: string;
  text: string;
  /** Datum der Bewertung (ISO), falls bekannt */
  date?: string;
  /** Herkunft: "exstase" (eigener Shop) oder "kompanion" (aus dem bisherigen Shop übernommen) */
  source?: "exstase" | "kompanion";
  /** true = Kauf anhand der Bestellung geprüft */
  verified?: boolean;
  color?: string;
  size?: string;
};

export type RatingSummary = { count: number; average: number };

/** Grenzen für das Bewertungsformular – gelten im Formular und auf dem Server */
export const REVIEW_LIMITS = {
  name: 60,
  email: 254,
  title: 80,
  textMin: 10,
  text: 1500,
  order: 40,
} as const;

const ALL = (reviewsData as Review[]).filter((r) => r.rating >= 1 && r.rating <= 5 && r.text);
const SALES = salesData as { customers: number | null; products: Record<string, number | null> };

/** Feste Bewertungen aus data/reviews.json (ohne freigegebene Shop-Bewertungen) */
export function getAllReviews() {
  return ALL;
}

/** Feste Bewertungen eines Produkts (ohne freigegebene Shop-Bewertungen) */
export function getReviews(handle: string) {
  return ALL.filter((r) => r.product === handle);
}

export function summarize(list: Review[]) {
  const count = list.length;
  const average = count ? list.reduce((n, r) => n + r.rating, 0) / count : 0;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: list.filter((r) => r.rating === stars).length }));
  return { count, average, distribution };
}

/** Bewertungsschnitt nur aus den festen Bewertungen – im Shop besser `useRating` (lib/shop-data) nutzen */
export function getRating(handle: string): RatingSummary {
  const { count, average } = summarize(getReviews(handle));
  return { count, average };
}

/**
 * Feste und freigegebene Bewertungen zusammenführen:
 * neueste (mit Datum) zuerst, Bewertungen ohne Datum danach in ihrer bisherigen Reihenfolge.
 * Doppelte IDs werden nur einmal gezeigt.
 */
export function mergeReviews(...lists: Review[][]): Review[] {
  const seen = new Set<string>();
  const unique: Review[] = [];
  for (const list of lists) {
    for (const r of list) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      unique.push(r);
    }
  }
  const time = (r: Review) => (r.date ? Date.parse(r.date) || 0 : 0);
  // stabile Sortierung: gleiche Zeit (z. B. kein Datum) behält die Reihenfolge
  return unique
    .map((r, i) => ({ r, i, t: time(r) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.r);
}

/** Bewertungsschnitt je Produkt (nur Produkte mit mindestens einer Bewertung) */
export function ratingsByProduct(list: Review[]): Record<string, RatingSummary> {
  const sums: Record<string, { count: number; total: number }> = {};
  for (const r of list) {
    const s = (sums[r.product] ??= { count: 0, total: 0 });
    s.count += 1;
    s.total += r.rating;
  }
  return Object.fromEntries(Object.entries(sums).map(([handle, s]) => [handle, { count: s.count, average: s.total / s.count }]));
}

/** Echte Verkaufszahl eines Produkts (oder null, wenn nicht gepflegt) */
export function getSold(handle: string): number | null {
  const n = SALES.products[handle];
  return typeof n === "number" && n > 0 ? n : null;
}

export function getCustomers(): number | null {
  return typeof SALES.customers === "number" && SALES.customers > 0 ? SALES.customers : null;
}

export const REVIEW_SOURCE_LABEL: Record<string, string> = {
  kompanion: "Bewertung aus unserem bisherigen Shop",
  exstase: "EXSTASE-Kund:in",
};
