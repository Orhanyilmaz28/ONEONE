import { type OfficeOrder, unitsBySort } from "./model";
import type { Product } from "../types";

/**
 * Filter der Büroverwaltung (Bestellübersicht und Excel-Export) – alle frei kombinierbar.
 * Ohne Server-Abhängigkeiten (testbar).
 */
export const CHANNELS = [
  { key: "alle", label: "Alle Kunden" },
  { key: "privat", label: "Nur Privatkunden" },
  { key: "haendler", label: "Nur Händler" },
] as const;
export const PAYMENTS = [
  { key: "", label: "Alle Zahlungen" },
  { key: "bezahlt", label: "Bezahlt" },
  { key: "unbezahlt", label: "Unbezahlt" },
  { key: "erstattet", label: "Ganz oder teilweise erstattet" },
] as const;
export const STATUSES = [
  { key: "", label: "Alle Status" },
  { key: "offen", label: "Offen" },
  { key: "in_bearbeitung", label: "In Bearbeitung" },
  { key: "freigegeben", label: "Für Versand freigegeben" },
  { key: "versendet", label: "Versendet" },
  { key: "storniert", label: "Storniert" },
  { key: "nicht_storniert", label: "Alle außer storniert" },
] as const;
export const EXPORTED = [
  { key: "", label: "Exportiert und nicht exportiert" },
  { key: "ja", label: "Bereits exportiert" },
  { key: "nein", label: "Noch nicht exportiert" },
] as const;

type KeyOf<T extends readonly { key: string }[]> = T[number]["key"];
export type Filters = {
  channel: KeyOf<typeof CHANNELS>;
  payment: KeyOf<typeof PAYMENTS>;
  status: KeyOf<typeof STATUSES>;
  exported: KeyOf<typeof EXPORTED>;
  /** Kunde: Name, Firma oder E-Mail (Teil genügt) */
  customer: string;
  /** Produkt-Kürzel (genau) */
  product: string;
  /** Sorten-Kürzel – findet auch Mixpakete, die diese Sorte enthalten */
  sort: string;
  /** Freie Suche: Bestellnummer, Name, Firma, E-Mail, Ort, PLZ, Sendungsnummer, Rechnungsnummer */
  q: string;
};

export const NO_FILTERS: Filters = { channel: "alle", payment: "", status: "", exported: "", customer: "", product: "", sort: "", q: "" };

const pick = <T extends readonly { key: string }[]>(list: T, v: unknown, fallback: KeyOf<T>): KeyOf<T> => (list.some((x) => x.key === v) ? (v as KeyOf<T>) : fallback);
const text = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const handle = (v: unknown) => (typeof v === "string" && /^[a-z0-9-]{1,80}$/.test(v) ? v : "");

export function parseFilters(p: Record<string, unknown>): Filters {
  return {
    channel: pick(CHANNELS, p.typ, "alle"),
    payment: pick(PAYMENTS, p.zahlung, ""),
    status: pick(STATUSES, p.status, ""),
    exported: pick(EXPORTED, p.exportiert, ""),
    customer: text(p.kunde),
    product: handle(p.produkt),
    sort: handle(p.sorte),
    q: text(p.q),
  };
}

/** Filter → URL-Parameter (nur gesetzte Werte) */
export function filterParams(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.channel !== "alle") out.typ = f.channel;
  if (f.payment) out.zahlung = f.payment;
  if (f.status) out.status = f.status;
  if (f.exported) out.exportiert = f.exported;
  if (f.customer) out.kunde = f.customer;
  if (f.product) out.produkt = f.product;
  if (f.sort) out.sorte = f.sort;
  if (f.q) out.q = f.q;
  return out;
}

const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const compact = (v: string) => norm(v).replace(/[\s-]/g, "");

function haystack(o: OfficeOrder) {
  return norm(
    [o.customerName, o.company, o.contact, o.email, o.delivery?.name, o.delivery?.company, o.delivery?.city, o.delivery?.zip, o.billing?.city, o.billing?.zip, o.tracking, o.invoiceNumber]
      .filter(Boolean)
      .join(" "),
  );
}

export function matchesSearch(o: OfficeOrder, q: string) {
  if (!q) return true;
  const needle = norm(q);
  if (haystack(o).includes(needle)) return true;
  const c = compact(q);
  return c.length > 0 && compact(o.number).includes(c);
}

/** Erfüllt die Bestellung alle gesetzten Filter? */
export function matchesFilters(o: OfficeOrder, f: Filters, products: Map<string, Product>): boolean {
  if (f.channel !== "alle" && o.channel !== f.channel) return false;
  if (f.payment === "bezahlt" && o.paymentStatus !== "bezahlt" && o.paymentStatus !== "teilweise_erstattet") return false;
  if (f.payment === "unbezahlt" && o.paymentStatus !== "offen") return false;
  if (f.payment === "erstattet" && o.paymentStatus !== "erstattet" && o.paymentStatus !== "teilweise_erstattet") return false;
  // „Für Versand freigegeben“ wird noch nicht erfasst (Phase 3C) – deshalb passt keine Bestellung
  if (f.status === "freigegeben") return false;
  if (f.status === "nicht_storniert" && o.processing === "storniert") return false;
  if (f.status === "versendet" && o.shippingStatus !== "versendet") return false;
  if (f.status && f.status !== "versendet" && f.status !== "nicht_storniert" && o.processing !== f.status) return false;
  if (f.exported === "ja" && !o.exportedAt) return false;
  if (f.exported === "nein" && o.exportedAt) return false;
  if (f.customer) {
    const n = norm(f.customer);
    if (![o.customerName, o.company, o.contact, o.email].some((v) => norm(v).includes(n))) return false;
  }
  if (f.product && !o.lines.some((l) => l.handle === f.product)) return false;
  if (f.sort && !o.lines.some((l) => unitsBySort(l, products)?.some((u) => u.handle === f.sort) || l.handle === f.sort)) return false;
  return matchesSearch(o, f.q);
}

export function applyFilters(orders: OfficeOrder[], f: Filters, products: Map<string, Product>) {
  return orders.filter((o) => matchesFilters(o, f, products));
}

/** Lesbare Beschreibung der Filter (Vorschau, Zusammenfassung). Kundennamen werden nur hier gezeigt, nie protokolliert. */
export function describeFilters(f: Filters, products: Map<string, Product>): string[] {
  const out: string[] = [];
  out.push(CHANNELS.find((c) => c.key === f.channel)?.label ?? "Alle Kunden");
  if (f.payment) out.push(PAYMENTS.find((x) => x.key === f.payment)?.label ?? f.payment);
  if (f.status) out.push(STATUSES.find((x) => x.key === f.status)?.label ?? f.status);
  if (f.exported) out.push(EXPORTED.find((x) => x.key === f.exported)?.label ?? f.exported);
  if (f.customer) out.push(`Kunde: „${f.customer}“`);
  if (f.product) out.push(`Produkt: ${products.get(f.product)?.title ?? f.product}`);
  if (f.sort) out.push(`Sorte: ${products.get(f.sort)?.title ?? f.sort}`);
  if (f.q) out.push(`Suche: „${f.q}“`);
  return out;
}

/** Für das Protokoll: welche Filter aktiv waren – ohne Kundennamen oder Suchtexte */
export function filterSummaryForLog(f: Filters): string {
  return [f.channel, f.payment, f.status, f.exported && `exp:${f.exported}`, f.customer && "Kundenfilter", f.product && `p:${f.product}`, f.sort && `s:${f.sort}`, f.q && "Suche"].filter(Boolean).join(",");
}
