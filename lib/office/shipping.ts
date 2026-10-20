import type { Product } from "../types";
import { CHANNEL_LABEL, type OfficeAddress, type OfficeLine, type OfficeOrder, SHIPPING_LABEL, unitsBySort } from "./model";

/**
 * Gemeinsame Versand-Daten für Versandliste (Bildschirm, Excel, PDF) und Lieferschein – eine Berechnung für alle Ausgaben.
 * Bewusst ohne Preise, Provisionen oder interne Finanzdaten. Ohne Server-Abhängigkeiten (testbar).
 */
const int = (n: number) => n.toLocaleString("de-DE");

/** Lieferadresse einer Bestellung (Rechnungsadresse, wenn keine eigene Lieferadresse angegeben ist) */
export const shipTo = (o: OfficeOrder) => o.delivery ?? o.billing;

/**
 * Straße und Hausnummer trennen („Hauptstraße 12a“ → „Hauptstraße“ + „12a“).
 * Erkennt die Hausnummer nur am Ende; sonst bleibt alles in „Straße“ (nichts wird geraten).
 */
export function splitStreet(line: string): { street: string; houseNo: string } {
  const t = (line ?? "").trim();
  const m = /^(.*\S)\s+(\d+(?:\s?[a-zA-Z])?(?:\s?[-–/]\s?\d+(?:\s?[a-zA-Z])?)?)$/.exec(t);
  return m ? { street: m[1], houseNo: m[2].replace(/\s+/g, "") } : { street: t, houseNo: "" };
}

const DOMESTIC = ["DE", "Deutschland", "Germany"];

/** Adresse als Zeilen (ohne leere Zeilen; Land nur, wenn nicht Deutschland) */
export function addressLines(a: OfficeAddress | null, fallbackName = ""): string[] {
  if (!a) return fallbackName ? [fallbackName] : [];
  const country = a.country && !DOMESTIC.includes(a.country) ? a.country : "";
  return [a.company, a.name || (a.company ? "" : fallbackName), a.line1, a.line2, [a.zip, a.city].filter(Boolean).join(" "), country].filter((x) => x?.trim());
}

/** Inhalt einer Position in Dosen/Flaschen, z. B. „48 Dosen“ oder bei Mixpaketen (laut Produktdaten) „24 Classic, 24 Tropical“ */
export function lineContents(l: OfficeLine, products: Map<string, Product>): string {
  const parts = unitsBySort(l, products);
  if (!parts) return "";
  const unit = l.handle?.startsWith("wasser") ? "Flaschen" : "Dosen";
  if (parts.length === 1 && parts[0].handle === l.handle) return `${int(parts[0].units)} ${unit}`;
  return parts.map((p) => `${int(p.units)} ${p.sort}`).join(", ");
}

/** Summe der Dosen und Flaschen einer Bestellung, getrennt gezählt (null, wenn eine Position unbekannt ist) */
export function orderUnits(o: OfficeOrder, products: Map<string, Product>): { cans: number; bottles: number } | null {
  const sum = { cans: 0, bottles: 0 };
  for (const l of o.lines) {
    const parts = unitsBySort(l, products);
    if (!parts) return null;
    for (const p of parts) {
      if (p.handle?.startsWith("wasser")) sum.bottles += p.units;
      else sum.cans += p.units;
    }
  }
  return sum;
}

/** „120 Dosen, 36 Flaschen“ – nur vorhandene Arten */
export function unitsLabel(u: { cans: number; bottles: number }): string {
  const out = [u.cans ? `${int(u.cans)} Dosen` : "", u.bottles ? `${int(u.bottles)} Flaschen` : ""].filter(Boolean);
  return out.length ? out.join(", ") : "0 Dosen";
}

/** Eine Zeile der Versandliste = eine Artikelposition mit zugehöriger Lieferadresse */
export type ShippingRow = {
  key: string;
  number: string;
  createdAt: number;
  channel: string;
  recipient: string;
  company: string;
  street: string;
  houseNo: string;
  extra: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
  sku: string;
  product: string;
  sort: string;
  quantity: number;
  unit: string;
  contents: string;
  note: string;
  status: string;
  /** erste Position der Bestellung (für Trennlinien und Gruppierung) */
  first: boolean;
  /** Anzahl Positionen der Bestellung */
  positions: number;
};

export function shippingRows(orders: OfficeOrder[], products: Map<string, Product>): ShippingRow[] {
  return orders.flatMap((o) => {
    const a = shipTo(o);
    const { street, houseNo } = splitStreet(a?.line1 ?? "");
    const base = {
      key: o.key,
      number: o.number,
      createdAt: o.createdAt,
      channel: CHANNEL_LABEL[o.channel],
      recipient: a?.name || o.customerName,
      company: a?.company || o.company,
      street,
      houseNo,
      extra: a?.line2 ?? "",
      zip: a?.zip ?? "",
      city: a?.city ?? "",
      country: a?.country ?? "",
      phone: o.phone,
      note: o.customerNote,
      status: SHIPPING_LABEL[o.shippingStatus],
      positions: o.lines.length,
    };
    if (!o.lines.length) return [{ ...base, sku: "", product: "Keine Positionen gespeichert", sort: "", quantity: 0, unit: "", contents: "", first: true }];
    return o.lines.map((l, i) => ({ ...base, sku: l.sku, product: l.product, sort: l.sort, quantity: l.quantity, unit: l.unit, contents: lineContents(l, products), first: i === 0 }));
  });
}
