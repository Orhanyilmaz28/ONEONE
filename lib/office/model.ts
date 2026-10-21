import type { DealerOrder } from "../dealer-orders";
import { type DealerInvoice, invoiceTotals } from "../dealer-invoice";
import type { Dealer } from "../dealer-store";
import { DEPOSIT_PER_CAN, cansOf } from "../format";
import type { OrderMeta } from "../orders";
import { SORT_NAMES, trayCans } from "../pack-contents";
import { PRODUCT_SPECS } from "../product-specs";
import { decodeMixSnapshot } from "../mix-snapshot";
import type { Product } from "../types";

/**
 * Gemeinsame Sicht der Büroverwaltung auf Privat- (Stripe) und Händlerbestellungen.
 * Nur Lesen und Umrechnen – gespeicherte Bestellungen werden nie verändert.
 * Fehlt eine Angabe, bleibt das Feld leer (nie geraten). Ohne Server-Abhängigkeiten (testbar).
 */
export type Channel = "privat" | "haendler";
export type PaymentStatus = "bezahlt" | "offen" | "teilweise_erstattet" | "erstattet";
export type Processing = "offen" | "in_bearbeitung" | "versendet" | "abgeschlossen" | "storniert";
export type ShippingStatus = "nicht_versendet" | "versendet" | "storniert";

export const CHANNEL_LABEL: Record<Channel, string> = { privat: "Privatkunde", haendler: "Händler" };
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { bezahlt: "Bezahlt", offen: "Unbezahlt", teilweise_erstattet: "Teilweise erstattet", erstattet: "Erstattet" };
export const PROCESSING_LABEL: Record<Processing, string> = { offen: "Offen", in_bearbeitung: "In Bearbeitung", versendet: "Versendet", abgeschlossen: "Abgeschlossen", storniert: "Storniert" };
export const SHIPPING_LABEL: Record<ShippingStatus, string> = { nicht_versendet: "Nicht versendet", versendet: "Versendet", storniert: "Storniert" };

export type OfficeAddress = { name: string; company: string; line1: string; line2: string; zip: string; city: string; country: string };

export type OfficeLine = {
  /** Artikelnummer aus dem Artikelpass (leer, wenn keiner hinterlegt ist) */
  sku: string;
  handle?: string;
  product: string;
  sort: string;
  quantity: number;
  /** Verpackungseinheit, z. B. „24er Tray“ (leer, wenn unbekannt) */
  unit: string;
  /** Dosen bzw. Flaschen je Verpackungseinheit (null = unbekannt) */
  unitsPerPack: number | null;
  /** Einzelpreis je Verpackungseinheit in Cent (Preisart siehe Bestellung) */
  unitPrice: number | null;
  /** Rabatt auf dieser Position in Cent */
  discount: number;
  /** Positionssumme in Cent (nach Rabatt) */
  total: number;
  /** Nur bei Archivkopien: gespeicherter Mixpaket-Inhalt zum Zeitpunkt des Drucks (statt der heutigen Produktdaten) */
  mixContents?: string;
  /** Mixpaket-Zusammensetzung zum Kaufzeitpunkt (aus den Stripe-Metadaten `mix`, falls vorhanden) – gilt vor den heutigen Produktdaten */
  mixSnapshot?: [string, number][];
};

export type OfficeOrder = {
  /** Eindeutiger Schlüssel: „s:<Stripe-Session>“ oder „h:<Händlerbestellung>“ */
  key: string;
  channel: Channel;
  number: string;
  createdAt: number;
  customerName: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  vatId: string;
  billing: OfficeAddress | null;
  delivery: OfficeAddress | null;
  lines: OfficeLine[];
  /** Privat: Preise inkl. USt · Händler: Preise zzgl. USt */
  priceBasis: "brutto" | "netto";
  /** Warenwert vor Rabatt (ohne Pfand und Versand), in der Preisart der Bestellung */
  goods: number;
  discount: number;
  deposit: number;
  /** Dosen/Flaschen mit Pfand (null = unbekannt) */
  depositUnits: number | null;
  /** null = Versand nach Absprache (Spedition) */
  shipping: number | null;
  net: number;
  vat: number;
  /** Herkunft der USt: aus Stripe, aus der Rechnung/Bestellung oder aus dem Bruttopreis berechnet (19 % enthalten) */
  vatSource: "stripe" | "rechnung" | "bestellung" | "berechnet";
  gross: number;
  refunded: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  processing: Processing;
  shippingStatus: ShippingStatus;
  tracking: string;
  carrier: string;
  customerNote: string;
  internalNote: string;
  invoiceNumber: string;
  /** Versanddatum, nur wenn es tatsächlich erfasst wurde (Millisekunden) */
  shippedAt?: number;
  /** Wann zuletzt in einen Excel-Export aufgenommen (ISO) */
  exportedAt?: string;
  /** Hinweise zu fehlenden oder unsicheren Angaben */
  warnings: string[];
  /** Büro-Bearbeitungsstand (Phase 3C) – undefined = nicht geladen, null = noch nichts bearbeitet */
  office?: import("./workflow").WfRecord | null;
};

export const VAT_RATE = 19;

/** Schlüssel ↔ URL-Teil (ohne Doppelpunkt, damit Links sauber bleiben) */
export const keyToSlug = (key: string) => key.replace(/^s:/, "s-").replace(/^h:/, "h-");
export function slugToKey(slug: string): string | null {
  if (/^s-cs_[A-Za-z0-9_]{6,200}$/.test(slug)) return `s:${slug.slice(2)}`;
  if (/^h-[0-9a-f]{8,64}$/.test(slug)) return `h:${slug.slice(2)}`;
  return null;
}

/** Link zur Originalbestellung im Dashboard (nur für Administrator:innen sichtbar) */
export function originalUrl(o: Pick<OfficeOrder, "key">) {
  return o.key.startsWith("s:") ? `/admin/bestellungen/${encodeURIComponent(o.key.slice(2))}` : `/admin/haendler/bestellungen#${encodeURIComponent(o.key.slice(2))}`;
}
export const officeUrl = (o: Pick<OfficeOrder, "key">) => `/admin/buero/bestellungen/${keyToSlug(o.key)}`;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const sortName = (handle: string | undefined, fallback: string) => (handle && SORT_NAMES[handle]) || fallback;
const skuOf = (handle?: string) => (handle ? (PRODUCT_SPECS[handle]?.artNr ?? "") : "");

/* ───────────── Privatbestellungen (Stripe) ───────────── */

/** Die Felder einer Stripe-Checkout-Session, die hier gebraucht werden (bewusst schmal, damit Tests ohne Stripe laufen) */
export type StripeAddress = { line1?: string | null; line2?: string | null; postal_code?: string | null; city?: string | null; country?: string | null } | null | undefined;
export type StripeLineLike = {
  description?: string | null;
  quantity?: number | null;
  amount_total: number;
  amount_subtotal?: number;
  amount_discount?: number;
  price?: { unit_amount?: number | null } | null;
};
export type StripeSessionLike = {
  id: string;
  created: number;
  amount_total?: number | null;
  amount_subtotal?: number | null;
  payment_status: string;
  metadata?: Record<string, string> | null;
  customer_details?: { name?: string | null; email?: string | null; phone?: string | null; address?: StripeAddress; business_name?: string | null; tax_ids?: { value?: string | null }[] | null } | null;
  collected_information?: { shipping_details?: { name?: string | null; address?: StripeAddress } | null } | null;
  shipping_cost?: { amount_total?: number | null } | null;
  total_details?: { amount_discount?: number | null; amount_shipping?: number | null; amount_tax?: number | null } | null;
  payment_intent?: string | { latest_charge?: string | { amount_refunded?: number; refunded?: boolean; payment_method_details?: { type?: string } | null } | null } | null;
};

const METHOD_LABEL: Record<string, string> = {
  card: "Karte",
  paypal: "PayPal",
  klarna: "Klarna",
  sepa_debit: "SEPA-Lastschrift",
  sofort: "Sofort",
  giropay: "giropay",
  link: "Link",
  eps: "eps",
  ideal: "iDEAL",
  bancontact: "Bancontact",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  revolut_pay: "Revolut Pay",
  amazon_pay: "Amazon Pay",
};

function addr(name: string | null | undefined, a: StripeAddress, company = ""): OfficeAddress | null {
  if (!a) return null;
  return { name: s(name), company: s(company), line1: s(a.line1), line2: s(a.line2), zip: s(a.postal_code), city: s(a.city), country: s(a.country) };
}

export const isDepositLine = (l: StripeLineLike) => s(l.description) === "Einwegpfand";

export function fromStripe(session: StripeSessionLike, lines: StripeLineLike[], meta: OrderMeta | undefined, products: Map<string, Product>, number: string): OfficeOrder {
  const warnings: string[] = [];
  const cd = session.customer_details ?? null;
  const ship = session.collected_information?.shipping_details ?? null;
  const items = (session.metadata?.items ?? "")
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [handle, qty] = part.split(":");
      return { handle, qty: Number(qty) || 0 };
    });
  const byTitle = new Map([...products.values()].map((p) => [p.title, p]));
  // Mixpaket-Inhalt zum Kaufzeitpunkt (nur, wenn der Checkout ihn gespeichert hat)
  const mixAtPurchase = decodeMixSnapshot(session.metadata?.mix);

  const goodsLines = lines.filter((l) => !isDepositLine(l));
  const depositLines = lines.filter(isDepositLine);
  const officeLines: OfficeLine[] = goodsLines.map((l, i) => {
    const qty = l.quantity ?? 0;
    const title = s(l.description) || "Artikel";
    // Reihenfolge der Positionen = Reihenfolge in den Metadaten; zur Sicherheit Menge vergleichen, sonst über den Namen
    const meta = items[i];
    const product = (meta && meta.qty === qty ? products.get(meta.handle) : undefined) ?? byTitle.get(title);
    const handle = product?.handle ?? (meta && meta.qty === qty ? meta.handle : undefined);
    const unitPrice = l.price?.unit_amount ?? null;
    let variant = product?.variants.length === 1 ? product.variants[0] : undefined;
    if (!variant && product && unitPrice !== null) {
      const same = product.variants.filter((v) => v.price === unitPrice);
      if (same.length === 1) variant = same[0];
    }
    if (!variant) warnings.push(`Verpackungseinheit von „${title}“ nicht eindeutig`);
    return {
      sku: skuOf(handle),
      handle,
      product: product?.title ?? title,
      sort: sortName(handle, product?.title ?? title),
      quantity: qty,
      unit: variant?.title ?? "",
      unitsPerPack: variant ? cansOf(variant) : null,
      unitPrice,
      discount: l.amount_discount ?? 0,
      total: l.amount_total,
      ...(handle && mixAtPurchase.has(handle) ? { mixSnapshot: mixAtPurchase.get(handle) } : {}),
    };
  });

  const deposit = depositLines.reduce((n, l) => n + (l.amount_subtotal ?? l.amount_total), 0);
  const depositUnits = depositLines.reduce((n, l) => n + (l.quantity ?? 0), 0);
  const subtotal = session.amount_subtotal ?? lines.reduce((n, l) => n + (l.amount_subtotal ?? l.amount_total), 0);
  const gross = session.amount_total ?? 0;
  const stripeTax = session.total_details?.amount_tax ?? 0;
  const vat = stripeTax > 0 ? stripeTax : Math.round(gross - gross / (1 + VAT_RATE / 100));

  const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const refunded = charge?.amount_refunded ?? 0;
  const methodType = charge?.payment_method_details?.type ?? "";
  if (!lines.length) warnings.push("Artikelpositionen konnten nicht geladen werden");

  const status = meta?.status ?? "offen";
  const processing: Processing = status === "storniert" ? "storniert" : status === "versendet" ? "versendet" : status === "erledigt" ? "abgeschlossen" : "offen";
  let paymentStatus: PaymentStatus = session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "bezahlt" : "offen";
  if (refunded > 0) paymentStatus = charge?.refunded || refunded >= gross ? "erstattet" : "teilweise_erstattet";

  const company = s(cd?.business_name);
  return {
    key: `s:${session.id}`,
    channel: "privat",
    number,
    createdAt: session.created * 1000,
    customerName: s(cd?.name) || s(ship?.name),
    company,
    contact: "",
    email: s(cd?.email),
    phone: s(cd?.phone),
    vatId: s(cd?.tax_ids?.[0]?.value),
    billing: addr(cd?.name, cd?.address, company),
    delivery: ship ? addr(ship.name, ship.address) : null,
    lines: officeLines,
    priceBasis: "brutto",
    goods: subtotal - deposit,
    discount: session.total_details?.amount_discount ?? 0,
    deposit,
    depositUnits: depositLines.length ? depositUnits : lines.length ? 0 : null,
    shipping: session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping ?? 0,
    net: gross - vat,
    vat,
    vatSource: stripeTax > 0 ? "stripe" : "berechnet",
    gross,
    refunded,
    paymentMethod: methodType ? (METHOD_LABEL[methodType] ?? methodType) : "",
    paymentStatus,
    processing,
    shippingStatus: status === "storniert" ? "storniert" : status === "versendet" || status === "erledigt" ? "versendet" : "nicht_versendet",
    tracking: s(meta?.tracking),
    carrier: s(meta?.carrier),
    ...(meta?.shippedAt && Number.isFinite(Date.parse(meta.shippedAt)) ? { shippedAt: Date.parse(meta.shippedAt) } : {}),
    customerNote: "",
    internalNote: s(meta?.note),
    invoiceNumber: "",
    warnings,
  };
}

/* ───────────── Händlerbestellungen ───────────── */

function invoiceSums(inv: DealerInvoice) {
  const t = invoiceTotals(inv);
  return { goods: t.goodsNet, discount: inv.discountNet, deposit: t.depositNet, depositUnits: t.depositUnits, shipping: inv.shippingNet, net: t.net, vat: t.vat, gross: t.gross };
}

function shippedOf(o: DealerOrder): { shippedAt?: number } {
  if (o.status !== "versendet") return {};
  const at = [...(o.history ?? [])].reverse().find((h) => h.status === "versendet")?.at;
  const t = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(t) ? { shippedAt: t } : {};
}

export function fromDealer(o: DealerOrder, dealer: Dealer | undefined, products: Map<string, Product>): OfficeOrder {
  const warnings: string[] = [];
  const c = o.calc;
  const lines: OfficeLine[] = (c?.lines ?? []).map((l) => {
    const perTray = l.trays > 0 ? Math.round(l.units / l.trays) : null;
    const product = products.get(l.handle);
    return {
      sku: skuOf(l.handle),
      handle: l.handle,
      product: product?.title ?? l.title,
      sort: sortName(l.handle, l.title),
      quantity: l.trays,
      unit: perTray ? `Tray (${perTray} ${l.handle.startsWith("wasser") ? "Flaschen" : "Dosen"})` : "Tray",
      unitsPerPack: perTray,
      unitPrice: l.perTray,
      discount: 0,
      total: l.total,
    };
  });
  const sums = o.invoice
    ? invoiceSums(o.invoice)
    : { goods: c.goodsNet, discount: 0, deposit: c.depositNet, depositUnits: c.units, shipping: c.shippingNet, net: c.net, vat: c.vat, gross: c.gross };
  if (sums.shipping === null) warnings.push("Versandkosten nach Absprache (Spedition) – im Gesamtbetrag nicht enthalten");
  if (!o.invoice) warnings.push("Noch keine Rechnung – Beträge laut Bestellung");
  const d = o.delivery;
  const paid = Boolean(o.invoice?.paid);
  const processing: Processing = o.status === "storniert" ? "storniert" : o.status === "versendet" ? "versendet" : o.status === "bestätigt" ? "in_bearbeitung" : "offen";
  const note = [o.reference ? `Eigene Bestellnr.: ${o.reference}` : "", o.wishDate ? `Wunschtermin: ${o.wishDate}` : "", s(o.note)].filter(Boolean).join(" · ");
  const billTo = o.invoice?.billTo;
  return {
    key: `h:${o.id}`,
    channel: "haendler",
    number: o.number,
    createdAt: Date.parse(o.createdAt),
    customerName: s(d?.contact) || s(dealer?.contact),
    company: s(d?.company) || s(dealer?.company),
    contact: s(d?.contact) || s(dealer?.contact),
    email: s(o.dealerEmail) || s(dealer?.email),
    phone: s(dealer?.phone),
    vatId: s(billTo?.vatId) || s(dealer?.vatId),
    billing: billTo
      ? { name: s(billTo.contact), company: s(billTo.company), line1: s(billTo.street), line2: "", zip: s(billTo.zip), city: s(billTo.city), country: "" }
      : dealer
        ? { name: s(dealer.contact), company: s(dealer.company), line1: s(dealer.street), line2: "", zip: s(dealer.zip), city: s(dealer.city), country: "" }
        : null,
    delivery: d ? { name: s(d.contact), company: s(d.company), line1: s(d.street), line2: "", zip: s(d.zip), city: s(d.city), country: "" } : null,
    lines,
    priceBasis: "netto",
    goods: sums.goods,
    discount: sums.discount,
    deposit: sums.deposit,
    depositUnits: sums.depositUnits,
    shipping: sums.shipping,
    net: sums.net,
    vat: sums.vat,
    vatSource: o.invoice ? "rechnung" : "bestellung",
    gross: sums.gross,
    refunded: 0,
    paymentMethod: "Rechnung",
    paymentStatus: paid ? "bezahlt" : "offen",
    processing,
    shippingStatus: o.status === "storniert" ? "storniert" : o.status === "versendet" ? "versendet" : "nicht_versendet",
    tracking: "",
    carrier: "",
    ...shippedOf(o),
    customerNote: note,
    internalNote: "",
    invoiceNumber: o.invoice?.number ?? "",
    warnings,
  };
}

/* ───────────── Mengen für die Artikel-Sammelliste ───────────── */

export type PackInfo = { perTray: number; traysPerPallet: number | null; unitName: "Dosen" | "Flaschen" };

/** Packungsdaten je Sorte: Dosen/Flaschen je Tray und Trays je Palette (aus den Artikelpässen; fehlt der Pass, keine Palettenangabe) */
export function packInfo(handle: string): PackInfo {
  const perTray = trayCans(handle);
  const units = PRODUCT_SPECS[handle]?.units;
  return { perTray, traysPerPallet: units ? Math.round(units / perTray) : null, unitName: handle.startsWith("wasser") ? "Flaschen" : "Dosen" };
}

/** Dosen bzw. Flaschen einer Position, Mixpakete in ihre Sorten zerlegt. null = Menge unbekannt */
export function unitsBySort(line: OfficeLine, products: Map<string, Product>): { handle: string; sort: string; units: number }[] | null {
  const product = line.handle ? products.get(line.handle) : undefined;
  const contents = line.mixSnapshot?.length ? line.mixSnapshot : product?.contents;
  if (contents?.length) {
    return contents.map(([h, trays]) => ({ handle: h, sort: sortName(h, products.get(h)?.title ?? h), units: trays * trayCans(h) * line.quantity }));
  }
  if (line.unitsPerPack === null || !line.handle) return null;
  return [{ handle: line.handle, sort: line.sort, units: line.unitsPerPack * line.quantity }];
}

/** Ganze Trays, Rest-Dosen und Paletten (als Dezimalzahl) aus einer Stückzahl */
export function splitUnits(units: number, info: PackInfo) {
  const trays = Math.floor(units / info.perTray);
  return { trays, rest: units - trays * info.perTray, pallets: info.traysPerPallet ? units / info.perTray / info.traysPerPallet : null };
}

/** Pfand-Kontrolle: Pfand je Dose × Anzahl (für Prüfungen in Tests und Hinweisen) */
export const expectedDeposit = (units: number) => units * DEPOSIT_PER_CAN;
