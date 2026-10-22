import { orderTax, vatRateFor } from "../cart-tax";
import { DEPOSIT_PER_CAN } from "../format";
import { KEYS, getManyJSONStrict, updateJSON } from "../store";
import type { Product } from "../types";
import { type SellerSnapshot, sellerSnapshot } from "./delivery-notes";
import type { OfficeAddress, OfficeOrder } from "./model";
import { addressLines } from "./shipping";
import { berlinParts } from "./time";

/**
 * Eigene Rechnungen für Privatbestellungen (Stripe). Stripe übernimmt nur die Zahlung; die Rechnung erstellt der Shop.
 *
 * Regeln:
 * - Eigene, fortlaufende Nummernfolge je Jahr („RE-2026-00001“), nie doppelt vergeben.
 * - Beim ersten Herunterladen oder Drucken wird die Rechnung festgeschrieben: Nummer, Datum, Positionen, Beträge und
 *   Absender werden gespeichert. Jeder spätere Abruf druckt genau diese gespeicherte Fassung (keine stillen Änderungen).
 * - Bruttopreise; MwSt. je Position gerundet und je Steuersatz ausgewiesen. Pfand und Versand folgen dem Satz der Ware.
 * - Keine Rechnung für stornierte oder unbezahlte Bestellungen und keine, wenn die Beträge nicht zur Zahlung passen.
 * Speicher: je Bestellung `tt:office-re:<Bestellschlüssel>`, Zähler je Jahr in `tt:office-re-seq`.
 */
export type InvoicePosition = {
  pos: number;
  sku: string;
  text: string;
  /** Zweite Zeile (z. B. Packungsinhalt, Rabatt) */
  detail: string;
  quantity: number;
  /** Einzelpreis brutto in Cent (null = nicht einheitlich, z. B. Rabatt auf ganze Cent verteilt) */
  unitGross: number | null;
  rate: number;
  gross: number;
};

export type InvoiceBasis = {
  orderNumber: string;
  orderDate: number;
  /** Lieferdatum (Versand) – sonst gilt der Monat der Bestellung als Leistungszeitraum */
  shippedAt?: number;
  recipient: string[];
  vatId: string;
  paymentMethod: string;
  positions: InvoicePosition[];
  byRate: { rate: number; gross: number; net: number; vat: number }[];
  gross: number;
  vat: number;
  seller: SellerSnapshot;
};

export type InvoiceAction = "heruntergeladen" | "gedruckt" | "per E-Mail";
export type InvoiceEvent = { at: string; by: string; action: "erstellt" | InvoiceAction };
export type StoredInvoice = { number: string; order: string; createdAt: string; createdBy: string; basis: InvoiceBasis; events: InvoiceEvent[] };

export const invoiceKey = (orderKey: string) => `tt:office-re:${orderKey}`;
export const formatInvoiceNumber = (year: number, seq: number) => `RE-${year}-${String(seq).padStart(5, "0")}`;
const MAX_EVENTS = 50;

/** Warum für diese Bestellung (noch) keine Rechnung erstellt werden kann – leer = alles in Ordnung */
export function invoiceBlockers(o: OfficeOrder, company: { name?: string; street?: string; city?: string; vatId?: string }): string[] {
  const out: string[] = [];
  if (o.channel !== "privat") out.push("Händlerbestellungen bekommen ihre Rechnung im Händlerbereich.");
  if (o.processing === "storniert") out.push("Die Bestellung ist storniert.");
  if (o.paymentStatus === "offen") out.push("Die Bestellung ist noch nicht bezahlt.");
  if (!o.lines.length) out.push("Keine Artikelpositionen gespeichert.");
  if (!o.billing && !o.delivery && !o.customerName) out.push("Name und Anschrift des Kunden fehlen.");
  const sum = o.lines.reduce((n, l) => n + l.total, 0) + o.deposit + (o.shipping ?? 0);
  if (o.lines.length && sum !== o.gross) out.push(`Die Positionen (${(sum / 100).toFixed(2)} €) passen nicht zum bezahlten Betrag (${(o.gross / 100).toFixed(2)} €).`);
  // Leer oder Platzhalter wie „[USt-IdNr.]“ zählt als fehlend (das PDF druckt Platzhalter nicht)
  const has = (v?: string) => {
    const t = v?.trim() ?? "";
    return Boolean(t) && !/^\[.*\]$/.test(t);
  };
  const missing = [!has(company.name) && "Firmenname", !has(company.street) && "Straße", !has(company.city) && "PLZ und Ort", !has(company.vatId) && "USt-IdNr."].filter(Boolean);
  if (missing.length) out.push(`Firmendaten unvollständig: ${missing.join(", ")} (Einstellungen → Firmendaten).`);
  return out;
}

const euro = (c: number) => `${(c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Rechnungsinhalt aus der Bestellung (rein, ohne Speicher) */
export function invoiceBasis(o: OfficeOrder, products: Map<string, Product>, seller: SellerSnapshot): InvoiceBasis {
  const address: OfficeAddress | null = o.billing ?? o.delivery;
  const recipient = addressLines(address, o.customerName);
  if (!recipient.length) recipient.push(o.customerName || "—");
  const goods = o.lines.map((l) => {
    const product = l.handle ? products.get(l.handle) : undefined;
    return { line: l, rate: vatRateFor(product), cans: l.unitsPerPack !== null ? l.unitsPerPack * l.quantity : null };
  });
  const tax = orderTax(
    goods.map((g) => ({ gross: g.line.total, rate: g.rate, cans: g.cans })),
    o.deposit,
    o.shipping ?? 0,
  );
  const positions: InvoicePosition[] = goods.map((g, i) => {
    const l = g.line;
    const even = l.quantity > 0 && l.total % l.quantity === 0;
    const pack = [l.unit, g.cans && l.unitsPerPack ? `je ${l.unitsPerPack} ${l.handle?.startsWith("wasser") ? "Flaschen" : "Dosen"}` : ""].filter(Boolean).join(" ");
    return {
      pos: i + 1,
      sku: l.sku,
      text: l.product,
      detail: [pack, l.discount > 0 || o.discount > 0 ? "Preis inkl. Rabatt" : ""].filter(Boolean).join(" · "),
      quantity: l.quantity,
      unitGross: even ? l.total / l.quantity : null,
      rate: g.rate,
      gross: l.total,
    };
  });
  let n = positions.length;
  for (const p of tax.positions) {
    if (p.kind === "ware") continue;
    const multi = tax.byRate.length > 1;
    if (p.kind === "pfand") {
      const units = Math.round(p.gross / DEPOSIT_PER_CAN);
      const exact = units * DEPOSIT_PER_CAN === p.gross;
      positions.push({ pos: ++n, sku: "", text: "Einwegpfand", detail: `${euro(DEPOSIT_PER_CAN)} je Dose/Flasche${multi ? ` (Anteil ${p.rate} %)` : ""}`, quantity: exact ? units : 1, unitGross: exact ? DEPOSIT_PER_CAN : p.gross, rate: p.rate, gross: p.gross });
    } else {
      positions.push({ pos: ++n, sku: "", text: "Versand", detail: `Standardversand${multi ? ` (Anteil ${p.rate} %)` : ""}`, quantity: 1, unitGross: p.gross, rate: p.rate, gross: p.gross });
    }
  }
  return {
    orderNumber: o.number,
    orderDate: o.createdAt,
    ...(o.shippedAt ? { shippedAt: o.shippedAt } : {}),
    recipient,
    vatId: o.vatId,
    paymentMethod: o.paymentMethod,
    positions,
    byRate: tax.byRate,
    gross: tax.gross,
    vat: tax.vat,
    seller: sellerSnapshot(seller),
  };
}

const withEvent = (inv: StoredInvoice, e: InvoiceEvent): StoredInvoice => {
  const events = [...inv.events, e];
  return { ...inv, events: events.length > MAX_EVENTS ? [events[0], ...events.slice(-(MAX_EVENTS - 1))] : events };
};

/* ───────────── Speicher ───────────── */

export async function readInvoice(orderKey: string): Promise<StoredInvoice | null> {
  return (await getManyJSONStrict<StoredInvoice>([invoiceKey(orderKey)]))[0] ?? null;
}

/** Nächste Rechnungsnummer des Jahres atomar reservieren */
async function reserveNumber(year: number): Promise<number> {
  let next = 0;
  await updateJSON<Record<string, number>>(KEYS.officeInvoiceSeq, {}, (cur) => {
    next = (cur?.[String(year)] ?? 0) + 1;
    return { ...(cur ?? {}), [String(year)]: next };
  });
  return next;
}

/**
 * Rechnung festschreiben (beim ersten Mal) bzw. den Abruf vermerken. Gibt die gespeicherte Fassung zurück.
 * Erstellen zwei Personen im selben Augenblick die erste Rechnung derselben Bestellung, bleibt höchstens eine Nummer
 * ungenutzt – doppelt vergeben wird keine, und die Bestellung behält die zuerst gespeicherte Rechnung.
 */
export async function issueInvoice(o: OfficeOrder, products: Map<string, Product>, seller: SellerSnapshot, by: string, action: InvoiceAction | null, now = Date.now()): Promise<StoredInvoice> {
  const existing = await readInvoice(o.key);
  const at = new Date(now).toISOString();
  const number = existing ? null : formatInvoiceNumber(berlinParts(now).y, await reserveNumber(berlinParts(now).y));
  let result: StoredInvoice | null = null;
  await updateJSON<StoredInvoice | null>(invoiceKey(o.key), null, (cur) => {
    if (cur) {
      result = action ? withEvent(cur, { at, by, action }) : cur;
    } else {
      if (!number) throw new Error("Keine Rechnungsnummer vergeben");
      result = { number, order: o.number, createdAt: at, createdBy: by, basis: invoiceBasis(o, products, seller), events: [{ at, by, action: "erstellt" }, ...(action ? [{ at, by, action }] : [])] };
    }
    return result;
  });
  if (!result) throw new Error("Rechnung konnte nicht gespeichert werden");
  return result;
}

/** Einen Vorgang an einer schon ausgestellten Rechnung vermerken (z. B. erst nach erfolgreichem E-Mail-Versand) */
export async function noteInvoiceEvent(orderKey: string, action: InvoiceAction, by: string, now = Date.now()): Promise<void> {
  await updateJSON<StoredInvoice | null>(invoiceKey(orderKey), null, (cur) => (cur ? withEvent(cur, { at: new Date(now).toISOString(), by, action }) : cur));
}
