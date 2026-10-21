import { type OfficeOrder, unitsBySort } from "./model";
import type { Product } from "../types";
import { OFFICE_STATUS, OFFICE_STATUS_LABEL, type OfficeStatus, attention, officeStatus } from "./workflow";

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
  { key: "nicht_versendet", label: "Noch nicht versendet" },
  { key: "storniert", label: "Storniert" },
  { key: "nicht_storniert", label: "Alle außer storniert" },
] as const;
export const EXPORTED = [
  { key: "", label: "Egal ob exportiert" },
  { key: "ja", label: "Bereits exportiert" },
  { key: "nein", label: "Noch nicht exportiert" },
] as const;

/** Bürostatus (Phase 3C) */
export const OFFICE_FILTER = [{ key: "", label: "Alle Bürostatus" }, ...OFFICE_STATUS.map((k) => ({ key: k, label: OFFICE_STATUS_LABEL[k] }))] as const;

/** Produktgruppen (Kollektionen aus dem Katalog) */
export const GROUP_LABEL: Record<string, string> = { energy: "Energy", "ice-coffee": "Ice Coffee", "ice-tea": "X-Tea", mineralwasser: "Mineralwasser", mixpakete: "Mixpakete" };

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
  /** Produktgruppe (Kollektion, z. B. „energy“) */
  group: string;
  /** Nur versandbereite Bestellungen: nicht storniert, Privatbestellungen nur bezahlt (Händler auf Rechnung immer) */
  ready: boolean;
  /** Freie Suche: Bestellnummer, Name, Firma, E-Mail, Ort, PLZ, Sendungsnummer, Rechnungsnummer */
  q: string;
  /** Bürostatus (leer = alle) */
  office: OfficeStatus | "";
  /** Nur Bestellungen, die Aufmerksamkeit brauchen */
  attention: boolean;
};

export const NO_FILTERS: Filters = { channel: "alle", payment: "", status: "", exported: "", customer: "", product: "", sort: "", group: "", ready: false, q: "", office: "", attention: false };

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
    group: handle(p.gruppe),
    ready: p.versandbereit === "1",
    q: text(p.q),
    office: (OFFICE_STATUS as readonly string[]).includes(p.buero as string) ? (p.buero as OfficeStatus) : "",
    attention: p.aufmerksamkeit === "1",
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
  if (f.group) out.gruppe = f.group;
  if (f.ready) out.versandbereit = "1";
  if (f.q) out.q = f.q;
  if (f.office) out.buero = f.office;
  if (f.attention) out.aufmerksamkeit = "1";
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
  // „Für Versand freigegeben“ = Bürostatus Freigegeben oder An Logistik weitergegeben (Phase 3C)
  if (f.status === "freigegeben" && !["freigegeben", "logistik"].includes(officeStatus(o, o.office))) return false;
  if (f.office && officeStatus(o, o.office) !== f.office) return false;
  if (f.attention && !attention(o, o.office, products).length) return false;
  if (f.status === "nicht_storniert" && o.processing === "storniert") return false;
  if (f.status === "versendet" && o.shippingStatus !== "versendet") return false;
  if (f.status === "nicht_versendet" && o.shippingStatus !== "nicht_versendet") return false;
  if (f.status && !["versendet", "nicht_versendet", "nicht_storniert", "freigegeben"].includes(f.status) && o.processing !== f.status) return false;
  if (f.ready && !isShipReady(o)) return false;
  if (f.exported === "ja" && !o.exportedAt) return false;
  if (f.exported === "nein" && o.exportedAt) return false;
  if (f.customer) {
    const n = norm(f.customer);
    if (![o.customerName, o.company, o.contact, o.email].some((v) => norm(v).includes(n))) return false;
  }
  if (f.product && !o.lines.some((l) => l.handle === f.product)) return false;
  if (f.sort && !o.lines.some((l) => unitsBySort(l, products)?.some((u) => u.handle === f.sort) || l.handle === f.sort)) return false;
  if (f.group && !o.lines.some((l) => inGroup(l.handle, f.group, products))) return false;
  return matchesSearch(o, f.q);
}

/** Gehört das Produkt (oder bei Mixpaketen eine enthaltene Sorte) zur Produktgruppe? */
export function inGroup(handle: string | undefined, group: string, products: Map<string, Product>): boolean {
  const p = handle ? products.get(handle) : undefined;
  if (!p) return false;
  if (p.collections?.includes(group)) return true;
  return Boolean(p.contents?.some(([h]) => products.get(h)?.collections?.includes(group)));
}

/**
 * Versandbereit: nicht storniert, nicht schon versendet. Privatbestellungen nur, wenn bezahlt (auch teilweise erstattet),
 * Händlerbestellungen auf Rechnung immer (Zahlung erst nach Lieferung).
 */
export function isShipReady(o: OfficeOrder) {
  if (o.processing === "storniert" || o.shippingStatus === "storniert") return false;
  if (o.channel === "privat" && o.paymentStatus !== "bezahlt" && o.paymentStatus !== "teilweise_erstattet") return false;
  return true;
}

/** Zählt diese Position (bzw. Sorte) bei aktivem Produkt-, Sorten- oder Gruppenfilter mit? (für die Artikel-Sammelliste) */
export function lineFilter(f: Pick<Filters, "product" | "sort" | "group">, products: Map<string, Product>) {
  if (!f.product && !f.sort && !f.group) return undefined;
  return (lineHandle: string | undefined, sortHandle: string) => {
    if (f.product && lineHandle !== f.product) return false;
    if (f.sort && sortHandle !== f.sort) return false;
    if (f.group && !products.get(sortHandle)?.collections?.includes(f.group)) return false;
    return true;
  };
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
  if (f.group) out.push(`Produktgruppe: ${GROUP_LABEL[f.group] ?? f.group}`);
  if (f.ready) out.push("Nur versandbereite (ohne Stornos und unbezahlte Privatbestellungen)");
  if (f.q) out.push(`Suche: „${f.q}“`);
  if (f.office) out.push(`Bürostatus: ${OFFICE_STATUS_LABEL[f.office]}`);
  if (f.attention) out.push("Nur Bestellungen, die Aufmerksamkeit brauchen");
  return out;
}

/** Für das Protokoll: welche Filter aktiv waren – ohne Kundennamen oder Suchtexte */
export function filterSummaryForLog(f: Filters): string {
  return [f.channel, f.payment, f.status, f.exported && `exp:${f.exported}`, f.customer && "Kundenfilter", f.product && `p:${f.product}`, f.sort && `s:${f.sort}`, f.group && `g:${f.group}`, f.ready && "versandbereit", f.q && "Suche", f.office && `b:${f.office}`, f.attention && "aufmerksamkeit"].filter(Boolean).join(",");
}
