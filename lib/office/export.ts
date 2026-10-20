import { revenueGross, revenueNet, daysOf } from "./kpis";
import {
  CHANNEL_LABEL,
  type OfficeAddress,
  type OfficeOrder,
  PAYMENT_LABEL,
  PROCESSING_LABEL,
  SHIPPING_LABEL,
  officeUrl,
  packInfo,
  splitUnits,
  unitsBySort,
} from "./model";
import { type Range, berlinParts } from "./time";
import type { Column, Row, Sheet } from "./xlsx";
import type { Product } from "../types";

/**
 * Excel-Exporte der Büroverwaltung: welche Blätter, welche Spalten. Ohne Server-Abhängigkeiten (testbar).
 * Es werden immer ALLE passenden Bestellungen exportiert – nicht nur eine Seite der Übersicht.
 */
export const EXPORT_TYPES = [
  { key: "voll", label: "Vollständiger Büroexport", sheets: ["Bestellungen", "Artikelpositionen", "Versandliste", "Artikel-Sammelliste", "Zusammenfassung"] },
  { key: "einfach", label: "Einfache Bestellliste", sheets: ["Bestellliste"] },
  { key: "versand", label: "Versandliste", sheets: ["Versandliste"] },
  { key: "sammel", label: "Artikel-Sammelliste", sheets: ["Artikel-Sammelliste"] },
  { key: "tag", label: "Tagesbericht", sheets: ["Tagesbericht", "Bestellliste"] },
  { key: "haendler", label: "Händlerbestellungen", sheets: ["Bestellungen", "Artikelpositionen", "Versandliste", "Artikel-Sammelliste", "Zusammenfassung"] },
  { key: "privat", label: "Privatkundenbestellungen", sheets: ["Bestellungen", "Artikelpositionen", "Versandliste", "Artikel-Sammelliste", "Zusammenfassung"] },
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number]["key"];
export const isExportType = (v: unknown): v is ExportType => EXPORT_TYPES.some((t) => t.key === v);
export const exportLabel = (t: ExportType) => EXPORT_TYPES.find((x) => x.key === t)?.label ?? t;

export type ExportContext = { range: Range; filters: string[]; createdBy: string; now: number; siteUrl: string; products: Map<string, Product> };

const addrCells = (a: OfficeAddress | null) => (a ? [a.name, a.company, a.line1, a.line2, a.zip, a.city, a.country] : ["", "", "", "", "", "", ""]);
const addrCols = (prefix: string): Column[] => [
  { header: `${prefix} Name` },
  { header: `${prefix} Firma` },
  { header: `${prefix} Straße` },
  { header: `${prefix} Zusatz` },
  { header: `${prefix} PLZ`, type: "code", width: 9 },
  { header: `${prefix} Ort` },
  { header: `${prefix} Land`, width: 7 },
];
const priceBasis = (o: OfficeOrder) => (o.priceBasis === "brutto" ? "brutto (inkl. USt)" : "netto (zzgl. USt)");
const vatSourceLabel = { stripe: "Stripe", rechnung: "Rechnung", bestellung: "Bestellung", berechnet: "berechnet (19 % enthalten)" } as const;

/* ───────────── Blätter ───────────── */

export function ordersSheet(orders: OfficeOrder[], ctx: ExportContext): Sheet {
  const columns: Column[] = [
    { header: "Bestellnummer", type: "code", width: 14 },
    { header: "Datum/Uhrzeit", type: "datetime" },
    { header: "Kundenart", width: 12 },
    { header: "Kundenname" },
    { header: "Firma" },
    { header: "Ansprechpartner" },
    { header: "E-Mail" },
    { header: "Telefon", type: "code" },
    { header: "USt-IdNr.", type: "code" },
    ...addrCols("Rechnung"),
    ...addrCols("Lieferung"),
    { header: "Positionen", type: "int" },
    { header: "Preisangabe", width: 18 },
    { header: "Warenwert", type: "money" },
    { header: "Rabatt", type: "money" },
    { header: "Pfand", type: "money" },
    { header: "Pfand-Stück", type: "int" },
    { header: "Versandkosten", type: "money" },
    { header: "Netto", type: "money" },
    { header: "USt", type: "money" },
    { header: "USt-Quelle", width: 16 },
    { header: "Gesamtbetrag brutto", type: "money" },
    { header: "Erstattet", type: "money" },
    { header: "Zahlungsart" },
    { header: "Zahlungsstatus" },
    { header: "Bearbeitungsstatus" },
    { header: "Versandstatus" },
    { header: "Versanddienst" },
    { header: "Sendungsnummer", type: "code" },
    { header: "Rechnungsnummer", type: "code" },
    { header: "Kundenhinweise", width: 40 },
    { header: "Interne Bemerkungen", width: 40 },
    { header: "Zuletzt exportiert", type: "datetime" },
    { header: "Hinweise", width: 40 },
    { header: "Link zur Bestellung", width: 50 },
  ];
  const rows: Row[] = orders.map((o) => [
    o.number,
    o.createdAt,
    CHANNEL_LABEL[o.channel],
    o.customerName,
    o.company,
    o.contact,
    o.email,
    o.phone,
    o.vatId,
    ...addrCells(o.billing),
    ...addrCells(o.delivery),
    o.lines.length,
    priceBasis(o),
    o.goods,
    o.discount,
    o.deposit,
    o.depositUnits,
    o.shipping === null ? "nach Absprache" : o.shipping,
    o.net,
    o.vat,
    vatSourceLabel[o.vatSource],
    o.gross,
    o.refunded,
    o.paymentMethod,
    PAYMENT_LABEL[o.paymentStatus],
    PROCESSING_LABEL[o.processing],
    SHIPPING_LABEL[o.shippingStatus],
    o.carrier,
    o.tracking,
    o.invoiceNumber,
    o.customerNote,
    o.internalNote,
    o.exportedAt ? Date.parse(o.exportedAt) : null,
    o.warnings.join(" · "),
    `${ctx.siteUrl}${officeUrl(o)}`,
  ]);
  return { name: "Bestellungen", columns, rows };
}

export function linesSheet(orders: OfficeOrder[]): Sheet {
  const columns: Column[] = [
    { header: "Bestellnummer", type: "code", width: 14 },
    { header: "Datum/Uhrzeit", type: "datetime" },
    { header: "Kundenart", width: 12 },
    { header: "Kunde / Firma" },
    { header: "SKU", type: "code" },
    { header: "Produkt" },
    { header: "Sorte" },
    { header: "Menge", type: "int" },
    { header: "Verpackungseinheit" },
    { header: "Dosen/Flaschen je Einheit", type: "int" },
    { header: "Dosen/Flaschen gesamt", type: "int" },
    { header: "Einzelpreis", type: "money" },
    { header: "Preisangabe", width: 18 },
    { header: "Rabatt", type: "money" },
    { header: "Positionssumme", type: "money" },
    { header: "Bearbeitungsstatus" },
  ];
  const rows: Row[] = orders.flatMap((o) =>
    o.lines.map((l) => [
      o.number,
      o.createdAt,
      CHANNEL_LABEL[o.channel],
      o.company || o.customerName,
      l.sku,
      l.product,
      l.sort,
      l.quantity,
      l.unit,
      l.unitsPerPack,
      l.unitsPerPack === null ? null : l.unitsPerPack * l.quantity,
      l.unitPrice,
      priceBasis(o),
      l.discount,
      l.total,
      PROCESSING_LABEL[o.processing],
    ]),
  );
  return { name: "Artikelpositionen", columns, rows };
}

const itemsText = (o: OfficeOrder) => o.lines.map((l) => `${l.quantity}× ${l.product}${l.unit ? ` (${l.unit})` : ""}`).join("; ");

/** Versandliste – bewusst ohne Preise, Provisionen und interne Finanzdaten */
export function shippingSheet(orders: OfficeOrder[]): Sheet {
  const columns: Column[] = [
    { header: "Bestellnummer", type: "code", width: 14 },
    { header: "Datum/Uhrzeit", type: "datetime" },
    { header: "Kundenart", width: 12 },
    { header: "Empfänger" },
    { header: "Firma" },
    { header: "Straße" },
    { header: "Zusatz" },
    { header: "PLZ", type: "code", width: 9 },
    { header: "Ort" },
    { header: "Land", width: 7 },
    { header: "Telefon", type: "code" },
    { header: "Artikel", width: 60 },
    { header: "Packungen gesamt", type: "int" },
    { header: "Dosen/Flaschen gesamt", type: "int" },
    { header: "Kundenhinweise", width: 40 },
    { header: "Versandstatus" },
    { header: "Versanddienst" },
    { header: "Sendungsnummer", type: "code" },
  ];
  const rows: Row[] = orders.map((o) => {
    const a = o.delivery ?? o.billing;
    const known = o.lines.every((l) => l.unitsPerPack !== null);
    return [
      o.number,
      o.createdAt,
      CHANNEL_LABEL[o.channel],
      a?.name || o.customerName,
      a?.company || o.company,
      a?.line1,
      a?.line2,
      a?.zip,
      a?.city,
      a?.country,
      o.phone,
      itemsText(o),
      o.lines.reduce((n, l) => n + l.quantity, 0),
      known ? o.lines.reduce((n, l) => n + (l.unitsPerPack ?? 0) * l.quantity, 0) : null,
      o.customerNote,
      SHIPPING_LABEL[o.shippingStatus],
      o.carrier,
      o.tracking,
    ];
  });
  return { name: "Versandliste", columns, rows };
}

export type CollectRow = { handle: string; sku: string; sort: string; units: number; privat: number; haendler: number; orders: number };

/** Mengen je Sorte (Mixpakete in Sorten zerlegt). Stornierte Bestellungen zählen nicht. */
export function collectUnits(orders: OfficeOrder[], products: Map<string, Product>) {
  const map = new Map<string, CollectRow & { seen: Set<string> }>();
  const unknown: { number: string; product: string; quantity: number; unit: string }[] = [];
  for (const o of orders) {
    if (o.processing === "storniert") continue;
    for (const l of o.lines) {
      const parts = unitsBySort(l, products);
      if (!parts) {
        unknown.push({ number: o.number, product: l.product, quantity: l.quantity, unit: l.unit });
        continue;
      }
      for (const p of parts) {
        const row = map.get(p.handle) ?? { handle: p.handle, sku: (l.handle === p.handle ? l.sku : "") || "", sort: p.sort, units: 0, privat: 0, haendler: 0, orders: 0, seen: new Set<string>() };
        row.units += p.units;
        row[o.channel] += p.units;
        if (!row.seen.has(o.key)) {
          row.seen.add(o.key);
          row.orders += 1;
        }
        if (!row.sku && l.handle === p.handle) row.sku = l.sku;
        map.set(p.handle, row);
      }
    }
  }
  const rows = [...map.values()].map(({ seen: _, ...r }) => r).sort((a, b) => a.sort.localeCompare(b.sort, "de"));
  return { rows, unknown };
}

export function collectSheet(orders: OfficeOrder[], products: Map<string, Product>): Sheet {
  const columns: Column[] = [
    { header: "SKU", type: "code" },
    { header: "Sorte" },
    { header: "Einheit", width: 9 },
    { header: "Stück gesamt", type: "int" },
    { header: "Je Tray", type: "int" },
    { header: "Ganze Trays", type: "int" },
    { header: "Rest-Stück", type: "int" },
    { header: "Trays je Palette", type: "int" },
    { header: "Paletten", type: "dec" },
    { header: "Bestellungen", type: "int" },
    { header: "davon Privat (Stück)", type: "int" },
    { header: "davon Händler (Stück)", type: "int" },
  ];
  const { rows: collected, unknown } = collectUnits(orders, products);
  const rows: Row[] = collected.map((r) => {
    const info = packInfo(r.handle);
    const split = splitUnits(r.units, info);
    return [r.sku, r.sort, info.unitName, r.units, info.perTray, split.trays, split.rest, info.traysPerPallet, split.pallets === null ? null : Math.round(split.pallets * 100) / 100, r.orders, r.privat, r.haendler];
  });
  if (collected.length) {
    rows.push({ cells: ["", "Gesamt", "", collected.reduce((n, r) => n + r.units, 0), null, null, null, null, null, null, collected.reduce((n, r) => n + r.privat, 0), collected.reduce((n, r) => n + r.haendler, 0)], bold: true });
  }
  for (const u of unknown) rows.push(["", `${u.product} – Menge unbekannt (Bestellung ${u.number}: ${u.quantity}× ${u.unit || "Einheit unbekannt"})`]);
  return { name: "Artikel-Sammelliste", columns, rows };
}

export function simpleSheet(orders: OfficeOrder[]): Sheet {
  const columns: Column[] = [
    { header: "Bestellnummer", type: "code", width: 14 },
    { header: "Datum/Uhrzeit", type: "datetime" },
    { header: "Kundenart", width: 12 },
    { header: "Kunde" },
    { header: "Firma" },
    { header: "PLZ", type: "code", width: 9 },
    { header: "Ort" },
    { header: "Positionen", type: "int" },
    { header: "Gesamtbetrag brutto", type: "money" },
    { header: "Zahlungsstatus" },
    { header: "Bearbeitungsstatus" },
    { header: "Versandstatus" },
  ];
  const rows: Row[] = orders.map((o) => {
    const a = o.delivery ?? o.billing;
    return [o.number, o.createdAt, CHANNEL_LABEL[o.channel], o.customerName, o.company, a?.zip, a?.city, o.lines.length, o.gross, PAYMENT_LABEL[o.paymentStatus], PROCESSING_LABEL[o.processing], SHIPPING_LABEL[o.shippingStatus]];
  });
  return { name: "Bestellliste", columns, rows };
}

const toGross = (o: OfficeOrder, cents: number) => (o.priceBasis === "brutto" ? cents : Math.round(cents * 1.19));

function sums(list: OfficeOrder[]) {
  const live = list.filter((o) => o.processing !== "storniert");
  const units = live.reduce((n, o) => n + o.lines.reduce((m, l) => m + (l.unitsPerPack ?? 0) * l.quantity, 0), 0);
  return {
    count: list.length,
    privat: list.filter((o) => o.channel === "privat").length,
    haendler: list.filter((o) => o.channel === "haendler").length,
    cancelled: list.length - live.length,
    gross: list.reduce((n, o) => n + revenueGross(o), 0),
    net: list.reduce((n, o) => n + revenueNet(o), 0),
    discount: live.reduce((n, o) => n + toGross(o, o.discount), 0),
    shipping: live.reduce((n, o) => n + (o.shipping === null ? 0 : toGross(o, o.shipping)), 0),
    deposit: live.reduce((n, o) => n + toGross(o, o.deposit), 0),
    refunds: list.reduce((n, o) => n + o.refunded, 0),
    unpaid: live.filter((o) => o.paymentStatus === "offen").reduce((n, o) => n + o.gross, 0),
    units,
  };
}

export function dailySheet(orders: OfficeOrder[], range: Range): Sheet {
  const columns: Column[] = [
    { header: "Datum", type: "date" },
    { header: "Bestellungen", type: "int" },
    { header: "Privat", type: "int" },
    { header: "Händler", type: "int" },
    { header: "Storniert", type: "int" },
    { header: "Umsatz brutto", type: "money" },
    { header: "Umsatz netto", type: "money" },
    { header: "Rabatte (brutto)", type: "money" },
    { header: "Versand (brutto)", type: "money" },
    { header: "Pfand (brutto)", type: "money" },
    { header: "Erstattungen", type: "money" },
    { header: "Unbezahlt", type: "money" },
    { header: "Dosen/Flaschen", type: "int" },
  ];
  const line = (s: ReturnType<typeof sums>) => [s.count, s.privat, s.haendler, s.cancelled, s.gross, s.net, s.discount, s.shipping, s.deposit, s.refunds, s.unpaid, s.units];
  const rows: Row[] = daysOf(range).map((d) => [d.from + 12 * 3_600_000, ...line(sums(orders.filter((o) => o.createdAt >= d.from && o.createdAt < d.to)))]);
  rows.push({ cells: ["Gesamt", ...line(sums(orders))], bold: true });
  return { name: "Tagesbericht", columns, rows };
}

export function summarySheet(orders: OfficeOrder[], ctx: ExportContext, type: ExportType): Sheet {
  const s = sums(orders);
  const columns: Column[] = [{ header: "Angabe", width: 34 }, { header: "Betrag", type: "money" }, { header: "Anzahl", type: "int" }, { header: "Hinweis", width: 70 }];
  const rows: Row[] = [
    ["Export", null, null, exportLabel(type)],
    ["Zeitraum", null, null, ctx.range.label],
    ["Filter", null, null, ctx.filters.join(" · ")],
    ["Erstellt", null, null, new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(ctx.now)],
    ["Erstellt von", null, null, ctx.createdBy],
    { cells: ["Bestellungen", null, s.count], bold: true },
    ["davon Privatkunden", null, s.privat],
    ["davon Händler", null, s.haendler],
    ["davon storniert", null, s.cancelled, "zählen nicht zum Umsatz und nicht zur Artikel-Sammelliste"],
    ["Artikelpositionen", null, orders.reduce((n, o) => n + o.lines.length, 0)],
    { cells: ["Umsatz brutto", s.gross, null, "ohne Stornos, abzüglich Erstattungen; Privatbestellungen erst nach Zahlung"], bold: true },
    ["Umsatz netto", s.net],
    ["Rabatte (brutto)", s.discount, null, "Händlerwerte von netto mit 19 % in brutto umgerechnet"],
    ["Versandkosten (brutto)", s.shipping, null, orders.some((o) => o.shipping === null) ? "Bestellungen mit Spedition nach Absprache sind nicht enthalten" : ""],
    ["Pfand (brutto)", s.deposit],
    ["Erstattungen", s.refunds, null, "laut Stripe (Privatbestellungen)"],
    ["Unbezahlt (brutto)", s.unpaid],
    ["Dosen/Flaschen (ohne Stornos)", null, s.units],
    ["Hinweis", null, null, "Keine Lagerbestände – Mengen sind bestellte Mengen. Alle Bestellungen gehen nur an das EXSTASE-Büro."],
  ];
  return { name: "Zusammenfassung", columns, rows };
}

/** Alle Blätter eines Exports */
export function buildSheets(type: ExportType, orders: OfficeOrder[], ctx: ExportContext): Sheet[] {
  switch (type) {
    case "einfach":
      return [simpleSheet(orders)];
    case "versand":
      return [shippingSheet(orders)];
    case "sammel":
      return [collectSheet(orders, ctx.products)];
    case "tag":
      return [dailySheet(orders, ctx.range), simpleSheet(orders)];
    default:
      return [ordersSheet(orders, ctx), linesSheet(orders), shippingSheet(orders), collectSheet(orders, ctx.products), summarySheet(orders, ctx, type)];
  }
}

/** Dateiname nur mit ASCII-Zeichen, z. B. „exstase-voll-2026-10-20-1430.xlsx“ */
export function exportFilename(type: ExportType, now: number) {
  const p = berlinParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `exstase-${type}-${p.y}-${pad(p.m)}-${pad(p.d)}-${pad(p.h)}${pad(p.min)}.xlsx`;
}
