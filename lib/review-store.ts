import { randomBytes } from "node:crypto";
import { getBaseProducts } from "./catalog";
import { type RatingSummary, type Review, getAllReviews, mergeReviews, ratingsByProduct } from "./reviews";
import { KEYS, getJSON, updateJSON } from "./store";

/**
 * Bewertungen aus dem Shop-Formular (nur auf dem Server verwenden).
 *
 * Ablauf: Kund:in schreibt eine Bewertung → sie wird mit Status „pending“ gespeichert →
 * im Dashboard unter „Bewertungen“ veröffentlichen oder ablehnen → nur veröffentlichte
 * erscheinen im Shop (ohne E-Mail-Adresse und Bestellnummer).
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export type StoredReview = {
  id: string;
  product: string;
  rating: number;
  name: string;
  /** nur für das Dashboard – wird nie im Shop angezeigt */
  email: string;
  title: string;
  text: string;
  /** Bestellnummer (optional) – nur für das Dashboard */
  order: string;
  createdAt: string;
  status: ReviewStatus;
  /** „Kauf geprüft“ – zeigt im Shop „Verifizierter Kauf“ */
  verified?: boolean;
  /** Zeitpunkt der letzten Freigabe/Ablehnung */
  moderatedAt?: string;
};

export type NewReview = Pick<StoredReview, "product" | "rating" | "name" | "email" | "title" | "text" | "order">;

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Neu",
  approved: "Veröffentlicht",
  rejected: "Abgelehnt",
};

/** Höchstens so viele ungeprüfte Bewertungen speichern (Schutz vor Spam-Fluten) */
export const MAX_PENDING = 500;
/** Abgelehnte Bewertungen: nur die neuesten behalten, ältere werden automatisch entfernt */
const MAX_REJECTED = 200;
/** Gleiche E-Mail-Adresse: höchstens so viele Bewertungen gleichzeitig in Prüfung */
const MAX_PENDING_PER_EMAIL = 5;

/** Zu viele Bewertungen warten auf Prüfung */
export class ReviewLimitError extends Error {
  constructor(message = "Gerade warten sehr viele Bewertungen auf Prüfung. Bitte versuche es in ein paar Tagen noch einmal.") {
    super(message);
  }
}

function isStatus(value: unknown): value is ReviewStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

/** Gespeicherte Einträge vorsichtig prüfen (alte oder kaputte Daten dürfen den Shop nie stören) */
function isStoredReview(value: unknown): value is StoredReview {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.product === "string" &&
    typeof r.name === "string" &&
    typeof r.text === "string" &&
    typeof r.createdAt === "string" &&
    Number.isInteger(r.rating) &&
    (r.rating as number) >= 1 &&
    (r.rating as number) <= 5 &&
    isStatus(r.status)
  );
}

function newestFirst(a: StoredReview, b: StoredReview) {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}

/** Rohdaten aus dem Speicher → gültige Einträge (Reihenfolge wie gespeichert) */
function clean(raw: unknown): StoredReview[] {
  return Array.isArray(raw) ? raw.filter(isStoredReview).map((r) => ({ ...r, email: r.email ?? "", title: r.title ?? "", order: r.order ?? "" })) : [];
}

/** Alle gespeicherten Bewertungen, neueste zuerst (für das Dashboard) */
export async function getStoredReviews(): Promise<StoredReview[]> {
  return clean(await getJSON<unknown>(KEYS.reviews, [])).sort(newestFirst);
}

/** Abgelehnte über dem Limit entfernen (älteste zuerst) */
function prune(list: StoredReview[]): StoredReview[] {
  const rejected = list.filter((r) => r.status === "rejected").sort(newestFirst);
  if (rejected.length <= MAX_REJECTED) return list;
  const drop = new Set(rejected.slice(MAX_REJECTED).map((r) => r.id));
  return list.filter((r) => !drop.has(r.id));
}

/**
 * Neue Bewertung speichern (Status „pending“).
 * Doppelt abgeschickte Bewertungen (gleiche E-Mail, gleiches Produkt, gleicher Text) werden nur einmal gespeichert.
 * Wirft StoreUnavailableError (kein Speicher) oder ReviewLimitError (zu viele in Prüfung).
 */
export async function addReview(input: NewReview): Promise<{ review: StoredReview; duplicate: boolean }> {
  const review: StoredReview = {
    ...input,
    id: `tt-${randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  let existing: StoredReview | undefined;
  await updateJSON<unknown>(KEYS.reviews, [], (raw) => {
    const list = clean(raw);
    const email = input.email.toLowerCase();
    existing = list.find((r) => r.product === input.product && r.email.toLowerCase() === email && r.text === input.text);
    if (existing) return list;
    const pending = list.filter((r) => r.status === "pending");
    if (pending.length >= MAX_PENDING) throw new ReviewLimitError();
    if (pending.filter((r) => r.email.toLowerCase() === email).length >= MAX_PENDING_PER_EMAIL) {
      throw new ReviewLimitError("Du hast uns schon mehrere Bewertungen geschickt, die noch geprüft werden. Bitte warte, bis wir sie freigegeben haben.");
    }
    return prune([...list, review]);
  });
  return existing ? { review: existing, duplicate: true } : { review, duplicate: false };
}

/** Eine Bewertung ändern; liefert vorher/nachher oder undefined, wenn es sie nicht (mehr) gibt */
async function patchReview(id: string, change: (r: StoredReview) => StoredReview): Promise<{ before: StoredReview; after: StoredReview } | undefined> {
  let result: { before: StoredReview; after: StoredReview } | undefined;
  await updateJSON<unknown>(KEYS.reviews, [], (raw) => {
    const list = clean(raw);
    const before = list.find((r) => r.id === id);
    if (!before) return list;
    const after = change(before);
    result = { before, after };
    return prune(list.map((r) => (r.id === id ? after : r)));
  });
  return result;
}

/** Status setzen (Veröffentlichen / Ablehnen / zurück zu „Neu“) */
export function setReviewStatus(id: string, status: ReviewStatus) {
  return patchReview(id, (r) => ({ ...r, status, moderatedAt: new Date().toISOString() }));
}

/** „Kauf geprüft“ an- oder abhaken */
export function setReviewVerified(id: string, verified: boolean) {
  return patchReview(id, (r) => ({ ...r, verified }));
}

/** Bewertung endgültig löschen; liefert die gelöschte Bewertung (oder undefined) */
export async function deleteReview(id: string): Promise<StoredReview | undefined> {
  let removed: StoredReview | undefined;
  await updateJSON<unknown>(KEYS.reviews, [], (raw) => {
    const list = clean(raw);
    removed = list.find((r) => r.id === id);
    return removed ? list.filter((r) => r.id !== id) : list;
  });
  return removed;
}

/* ───────── Öffentliche Anzeige im Shop ───────── */

/** Gespeicherte Bewertung → öffentliche Form (ohne E-Mail und Bestellnummer!) */
export function toPublicReview(r: StoredReview): Review {
  return {
    id: r.id,
    product: r.product,
    name: r.name,
    rating: r.rating,
    title: r.title || undefined,
    text: r.text,
    date: r.createdAt,
    source: "exstase",
    verified: r.verified === true,
  };
}

/** Nur veröffentlichte Bewertungen aus dem Speicher (für den Shop) */
export async function getApprovedReviews(handle?: string): Promise<Review[]> {
  const [stored, products] = await Promise.all([getJSON<unknown>(KEYS.reviews, []).then(clean), getBaseProducts()]);
  const exists = new Set(products.map((p) => p.handle));
  return stored
    .filter((r) => r.status === "approved" && (!handle || r.product === handle) && exists.has(r.product))
    .sort(newestFirst)
    .map(toPublicReview);
}

/** Alle Bewertungen, die im Shop sichtbar sind (feste + veröffentlichte), optional nur für ein Produkt */
export async function getPublicReviews(handle?: string): Promise<Review[]> {
  const fixed = handle ? getAllReviews().filter((r) => r.product === handle) : getAllReviews();
  return mergeReviews(await getApprovedReviews(handle), fixed);
}

/** Bewertungsschnitt je Produkt aus allen sichtbaren Bewertungen (für Sterne auf Produktkarten) */
export async function getPublicRatings(): Promise<Record<string, RatingSummary>> {
  return ratingsByProduct(await getPublicReviews());
}
