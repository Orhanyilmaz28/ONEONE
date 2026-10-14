import { DEPOSIT_PER_CAN } from "./format";

/**
 * Händler-Rechnungen – Typen und Rechnung ohne Server-Abhängigkeiten (Editor im Dashboard rechnet live mit).
 * Pflichtangaben nach § 14 UStG: Name/Anschrift beider Seiten, USt-IdNr. des Verkäufers, Rechnungsdatum,
 * fortlaufende Nummer, Menge und Bezeichnung, Leistungsdatum, Entgelt nach Steuersatz, Steuersatz und -betrag.
 */
export type InvoiceLine = {
  text: string;
  qty: number;
  unit: string;
  /** Einzelpreis netto in Cent */
  price: number;
  /** Pfand-Stück je Einheit (z. B. 24 Dosen je Tray) */
  deposit: number;
};

export type InvoiceParty = { company: string; contact: string; street: string; zip: string; city: string; vatId: string };

export type InvoiceSeller = {
  name: string;
  owner: string;
  street: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  vatId: string;
  register: string;
  iban: string;
  bic: string;
  bank: string;
};

export type DealerInvoice = {
  /** z. B. „RE-2026-0001“ */
  number: string;
  /** Rechnungsdatum JJJJ-MM-TT */
  date: string;
  /** Leistungs-/Lieferdatum JJJJ-MM-TT */
  serviceDate: string;
  /** Zahlungsziel in Tagen */
  dueDays: number;
  lines: InvoiceLine[];
  shippingNet: number;
  shippingText: string;
  discountNet: number;
  discountText: string;
  note: string;
  vatRate: number;
  billTo: InvoiceParty;
  seller: InvoiceSeller;
  /** für den Händler sichtbar */
  released: boolean;
  releasedAt?: string;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  /** frühere, durch Korrektur ersetzte Rechnungen */
  replaced?: { number: string; gross: number; at: string }[];
};

export function invoiceTotals(inv: Pick<DealerInvoice, "lines" | "shippingNet" | "discountNet" | "vatRate">) {
  const goodsNet = inv.lines.reduce((n, l) => n + Math.round(l.qty * l.price), 0);
  const depositUnits = inv.lines.reduce((n, l) => n + l.qty * l.deposit, 0);
  const depositNet = depositUnits * DEPOSIT_PER_CAN;
  const net = goodsNet + depositNet + inv.shippingNet - inv.discountNet;
  const vat = Math.round((net * inv.vatRate) / 100);
  return { goodsNet, depositUnits, depositNet, net, vat, gross: net + vat };
}

/** Fälligkeitsdatum (JJJJ-MM-TT) */
export function dueDate(inv: Pick<DealerInvoice, "date" | "dueDays">) {
  const d = new Date(`${inv.date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + inv.dueDays);
  return d.toISOString().slice(0, 10);
}

/** Der Händler sieht die Rechnung, sobald sie freigegeben oder als bezahlt markiert ist */
export const invoiceVisible = (inv?: DealerInvoice) => Boolean(inv && (inv.released || inv.paid));

export const formatDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** Inhalt, der bei einer Änderung nach der Freigabe eine Korrektur (neue Nummer) auslöst */
export const invoiceContent = (inv: DealerInvoice) =>
  JSON.stringify([inv.date, inv.serviceDate, inv.dueDays, inv.lines, inv.shippingNet, inv.shippingText, inv.discountNet, inv.discountText, inv.note, inv.billTo]);
