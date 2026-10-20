import { formatPrice } from "../format";
import type { Product } from "../types";
import { type LineMatch, collectUnits } from "./export";
import { computeKpis, countsAsRevenue } from "./kpis";
import { CHANNEL_LABEL, type OfficeOrder, PAYMENT_LABEL, PROCESSING_LABEL, packInfo, splitUnits } from "./model";
import { Flow, PdfDoc, type PdfImage, mm, wrapText } from "./pdf";
import { addressLines, lineContents, orderUnits, shipTo, shippingRows, unitsLabel } from "./shipping";
import type { Range } from "./time";

/**
 * Büro-Dokumente (Phase 3B): Lieferscheine, Versandliste, Artikel-Sammelliste, Tagesbericht – als PDF.
 * Reine Funktionen: dieselben Daten wie Bildschirm und Excel (shipping.ts, export.ts, kpis.ts). Ohne Server-Abhängigkeiten.
 *
 * Grundsätze:
 * - Lieferscheine und Versandlisten enthalten keine Preise, Provisionen, Umsätze oder Zahlungsdaten.
 * - Mengen sind bestellte Mengen – keine Lagerbestände.
 * - Ein Dokument zu erstellen ändert nie eine Bestellung (kein Versandstatus, keine Rechnung).
 * - Fehlende Angaben werden als „fehlt“ gedruckt und gemeldet – nie erfunden.
 */
export type CompanyInfo = { name: string; brand: string; owner: string; street: string; city: string; country: string; email: string; phone: string; vatId: string; register: string };

/** Platzhalter wie „[Telefonnummer]“ nicht drucken */
export const real = (v?: string) => {
  const t = v?.trim() ?? "";
  return t && !/^\[.*\]$/.test(t) ? t : "";
};

const berlin = (ms: number, withTime = false) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: "Europe/Berlin" }).format(ms);
const clock = (ms: number) => new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: "Europe/Berlin" }).format(ms);
const int = (n: number) => n.toLocaleString("de-DE");
const dec = (n: number | null) => (n === null ? "—" : n.toLocaleString("de-DE", { maximumFractionDigits: 2 }));
const pct = (part: number, total: number) => (total > 0 ? `${(Math.round((part / total) * 1000) / 10).toLocaleString("de-DE")} %` : "—");

/* ───────────── Gemeinsamer Dokumentkopf ───────────── */

/** Logo (oder Markenname) links, Firmenanschrift rechts. Gibt die Unterkante zurück. */
function letterhead(doc: PdfDoc, company: CompanyInfo, logo: PdfImage | null, o: { left?: number; top?: number; logoWidth?: number } = {}) {
  const L = o.left ?? mm(20);
  const R = doc.w - mm(15);
  const top = o.top ?? mm(12);
  let bottom = top;
  if (logo) bottom = top + doc.image(logo, L, top, o.logoWidth ?? mm(36));
  else {
    doc.text(L, top + 18, real(company.brand) || real(company.name) || "EXSTASE", { size: 18, font: "bold" });
    bottom = top + 24;
  }
  const lines = [real(company.name), real(company.street), real(company.city), real(company.country)].filter(Boolean);
  const contact = [real(company.phone), real(company.email)].filter(Boolean);
  [...lines, ...(contact.length ? ["", ...contact] : [])].forEach((t, i) => doc.text(R, top + 8 + i * 9.5, t, { size: 7.5, gray: 0.3, align: "right", font: i === 0 ? "bold" : "regular" }));
  return Math.max(bottom, top + 8 + (lines.length + contact.length + 1) * 9.5);
}

const companyFooter = (company: CompanyInfo) =>
  [real(company.name), real(company.owner), real(company.register), real(company.vatId) ? `USt-IdNr. ${real(company.vatId).replace(/^USt-?IdNr\.?\s*/i, "")}` : ""].filter(Boolean).join(" · ");

/** Fehlende Firmendaten (Einstellungen → Firmendaten), die auf Dokumenten stehen sollten */
export function missingCompanyFields(company: CompanyInfo): string[] {
  const out: string[] = [];
  if (!real(company.name)) out.push("Firmenname");
  if (!real(company.street)) out.push("Straße");
  if (!real(company.city)) out.push("PLZ und Ort");
  return out;
}

/* ───────────── Lieferschein ───────────── */

export type DeliveryNoteInfo = {
  /** null = Vorschau (noch keine Nummer vergeben) */
  number: string | null;
  version: number;
  createdAt: string;
  remark: string;
  /** Zusätzliche Prüfhinweise (z. B. „Bestellung nach der Versandfreigabe geändert“) */
  issues?: string[];
  /** Archivkopie einer älteren Version (aus der gespeicherten Datenbasis) */
  archive?: boolean;
};

/** Was auf einem Lieferschein fehlt oder unsicher ist (wird vor dem Erstellen angezeigt und ins PDF gedruckt) */
export function deliveryNoteIssues(o: OfficeOrder): string[] {
  const out: string[] = [];
  const a = shipTo(o);
  if (!a) out.push("Lieferadresse fehlt");
  else {
    if (!a.name && !a.company && !o.customerName) out.push("Empfängername fehlt");
    if (!a.line1) out.push("Straße fehlt");
    if (!a.zip || !a.city) out.push("PLZ/Ort fehlt");
  }
  if (!o.delivery && o.billing) out.push("Keine eigene Lieferadresse – Rechnungsadresse verwendet");
  if (!o.lines.length) out.push("Keine Artikelpositionen gespeichert");
  if (o.lines.some((l) => !l.sku)) out.push("Artikelnummer bei mindestens einer Position nicht hinterlegt");
  if (o.lines.some((l) => !l.unit)) out.push("Verpackungseinheit bei mindestens einer Position unbekannt");
  return out;
}

/**
 * Ein oder mehrere Lieferscheine in einem PDF (jeder beginnt auf einer neuen Seite und hat eigene Seitenzahlen).
 * Tabelle: Pos. | Artikelnummer | Produkt | Sorte | Menge | Einheit. Keine Preise.
 */
export function deliveryNotesPdf(items: { order: OfficeOrder; note: DeliveryNoteInfo }[], company: CompanyInfo, products: Map<string, Product>, logo: PdfImage | null, now = Date.now()): Buffer {
  const title = items.length === 1 ? `Lieferschein ${items[0].note.number ?? "(Vorschau)"} zu Bestellung ${items[0].order.number}` : `Lieferscheine (${items.length})`;
  const doc = new PdfDoc(title);
  const footerLeft = companyFooter(company);
  const labels: string[] = [];
  doc.footer = (page, pages, group) => ({ left: footerLeft, right: `${labels[group - 1] ?? ""} · Seite ${page} von ${pages}` });

  for (const { order: o, note } of items) {
    const preview = note.number === null;
    const numberText = preview ? "VORSCHAU" : `${note.number}${note.version > 1 ? ` (Version ${note.version})` : ""}`;
    labels.push(preview ? `Vorschau Lieferschein ${o.number}` : `Lieferschein ${note.number}`);
    doc.newGroup();
    const L = mm(20);
    const R = doc.w - mm(15);
    const head = letterhead(doc, company, logo);

    // Absenderzeile + Empfänger (Fensterposition DIN 5008 Form B)
    const senderLine = [real(company.name), real(company.street), real(company.city)].filter(Boolean).join(" · ");
    const addrTop = Math.max(head + mm(6), mm(45));
    if (senderLine) {
      doc.text(L, addrTop + 6, senderLine, { size: 6.5, gray: 0.35 });
      doc.line(L, addrTop + 8.5, L + mm(85), addrTop + 8.5, 0.3, 0.75);
    }
    const a = shipTo(o);
    const recipient = addressLines(a, o.customerName);
    const contactLine = o.contact && o.contact !== (a?.name ?? "") && o.contact !== o.customerName ? `z. Hd. ${o.contact}` : "";
    const raw = recipient.length ? [...recipient.slice(0, 1), ...(contactLine ? [contactLine] : []), ...recipient.slice(1)] : ["Lieferadresse fehlt"];
    // Lange Zeilen umbrechen, damit nichts in die Angaben rechts läuft
    const boldFirst = Boolean(a?.company || o.company);
    const block = raw.flatMap((t, i) => wrapText(t, mm(85), 10.5, i === 0 && boldFirst ? "bold" : "regular").map((l) => ({ l, bold: i === 0 && boldFirst })));
    block.forEach((b, i) => doc.text(L, addrTop + 22 + i * 13, b.l, { size: 10.5, font: b.bold ? "bold" : "regular" }));

    // Angaben rechts
    const info: [string, string][] = [
      ["Lieferschein-Nr.", numberText],
      ["Bestellnummer", o.number],
      ["Bestelldatum", berlin(o.createdAt)],
      ["Erstellt am", berlin(Date.parse(note.createdAt) || now)],
      ...(o.shippedAt ? ([["Versanddatum", berlin(o.shippedAt)]] as [string, string][]) : []),
      ["Kundenart", CHANNEL_LABEL[o.channel]],
    ];
    const ix = doc.w - mm(82);
    info.forEach(([k, v], i) => {
      doc.text(ix, addrTop + 22 + i * 12.5, k, { size: 8.5, gray: 0.35 });
      doc.text(R, addrTop + 22 + i * 12.5, v, { size: 8.5, font: "bold", align: "right" });
    });

    const titleY = Math.max(addrTop + 22 + block.length * 13, addrTop + 22 + info.length * 12.5) + mm(12);
    doc.text(L, titleY, "Lieferschein", { size: 20, font: "bold" });
    if (preview) doc.text(R, titleY, "Vorschau – noch keine Lieferscheinnummer vergeben", { size: 8.5, gray: 0.45, align: "right" });
    else if (note.archive) doc.text(R, titleY, `Archivkopie der Version ${note.version} (Stand ${berlin(Date.parse(note.createdAt) || now, true)})`, { size: 8.5, gray: 0.45, align: "right" });
    doc.line(L, titleY + 8, R, titleY + 8, 0.6, 0.2);

    const flow = new Flow(doc, titleY + 14, () => mm(18), mm(20), mm(15));
    let packs = 0;
    const rows = o.lines.map((l, i) => {
      packs += l.quantity;
      const contents = lineContents(l, products);
      const mix = l.mixContents !== undefined || Boolean(l.handle && products.get(l.handle)?.contents?.length);
      return [
        String(i + 1),
        l.sku || "—",
        l.product,
        mix ? `Mixpaket${contents ? `\nInhalt laut Produktdaten: ${contents}` : ""}` : l.sort || "—",
        int(l.quantity),
        `${l.unit || "unbekannt"}${contents && !mix ? `\n${contents}` : ""}`,
      ];
    });
    flow.table(
      [
        { header: "Pos.", width: 6 },
        { header: "Artikelnummer", width: 15 },
        { header: "Produkt", width: 31 },
        { header: "Sorte", width: 22 },
        { header: "Menge", width: 9, align: "right", bold: true },
        { header: "Einheit", width: 17 },
      ],
      rows.length ? rows : [["", "", "Keine Positionen gespeichert", "", "", ""]],
      { size: 9 },
    );
    const units = orderUnits(o, products);
    flow.ensure(16);
    doc.text(flow.right, flow.y + 12, `Packungen gesamt: ${int(packs)}${units !== null ? ` · Inhalt gesamt: ${unitsLabel(units)}` : ""}`, { size: 9, font: "bold", align: "right" });
    flow.y += 26;

    const remarks = [note.remark ? `Bemerkung: ${note.remark}` : "", o.customerNote ? `Versandhinweis des Kunden: ${o.customerNote}` : ""].filter(Boolean);
    if (remarks.length) {
      flow.ensure(32);
      flow.heading("Bemerkungen", { size: 9.5, gap: 1 });
      for (const r of remarks) flow.paragraph(r, { size: 9, gap: 2 });
      flow.y += 6;
    }
    const issues = [...deliveryNoteIssues(o).filter((x) => !x.startsWith("Keine eigene Lieferadresse")), ...(note.issues ?? [])];
    if (issues.length) flow.paragraph(`Bitte prüfen: ${issues.join(" · ")}.`, { size: 8, gray: 0.35, gap: 6 });

    // Empfangsbestätigung
    flow.ensure(mm(24));
    flow.y = Math.max(flow.y + mm(6), Math.min(flow.bottom - mm(20), flow.y + mm(24)));
    flow.paragraph("Ware vollständig und unbeschädigt erhalten:", { size: 8.5, gray: 0.3, gap: mm(10) });
    doc.line(flow.left, flow.y, flow.left + mm(55), flow.y, 0.5, 0.4);
    doc.line(flow.left + mm(70), flow.y, flow.right, flow.y, 0.5, 0.4);
    doc.text(flow.left, flow.y + 9, "Datum", { size: 7.5, gray: 0.4 });
    doc.text(flow.left + mm(70), flow.y + 9, "Name und Unterschrift", { size: 7.5, gray: 0.4 });
  }
  return doc.build(new Date(now));
}

/* ───────────── Listen: gemeinsamer Kopf ───────────── */

export type ListContext = { title: string; range: Range; filters: string[]; createdBy: string; now: number };

function listHead(doc: PdfDoc, ctx: ListContext, company: CompanyInfo, logo: PdfImage | null, extra = "") {
  const head = letterhead(doc, company, logo, { left: mm(15), top: mm(10), logoWidth: mm(28) });
  const y = head + mm(6);
  doc.text(mm(15), y + 14, ctx.title, { size: 16, font: "bold" });
  doc.text(mm(15), y + 27, `Zeitraum: ${ctx.range.label}`, { size: 9 });
  doc.text(mm(15), y + 38, `Filter: ${ctx.filters.join(" · ")}`, { size: 8, gray: 0.35 });
  doc.text(doc.w - mm(15), y + 27, `Erstellt am ${berlin(ctx.now, true)} von ${ctx.createdBy}`, { size: 8, gray: 0.35, align: "right" });
  if (extra) doc.text(doc.w - mm(15), y + 38, extra, { size: 8, gray: 0.35, align: "right" });
  doc.line(mm(15), y + 45, doc.w - mm(15), y + 45, 0.6, 0.2);
  return y + 52;
}

/* ───────────── Versandliste ───────────── */

/** Versandliste: eine Zeile je Artikelposition mit Lieferadresse (dieselben Zeilen wie im Excel-Export). Ohne Preise. */
export function shippingListPdf(orders: OfficeOrder[], ctx: ListContext, company: CompanyInfo, products: Map<string, Product>, logo: PdfImage | null): Buffer {
  const rows = shippingRows(orders, products);
  const doc = new PdfDoc(ctx.title, { landscape: true });
  doc.footer = (page, pages) => ({ left: `${ctx.title} · ${berlin(ctx.now, true)} · nur für das EXSTASE-Büro, enthält Kundendaten`, right: `Seite ${page} von ${pages}` });
  doc.addPage();
  const flow = new Flow(doc, listHead(doc, ctx, company, logo, `${int(orders.length)} Bestellungen · ${int(rows.length)} Positionen`), () => mm(15));
  let shade = false;
  flow.table(
    [
      { header: "Bestellung", width: 9, bold: true },
      { header: "Empfänger / Firma", width: 14 },
      { header: "Straße / Nr.", width: 13 },
      { header: "PLZ / Ort / Land", width: 11 },
      { header: "Telefon", width: 9 },
      { header: "Artikelnummer", width: 9 },
      { header: "Produkt / Sorte", width: 15 },
      { header: "Menge", width: 5, align: "right", bold: true },
      { header: "Einheit", width: 9 },
      { header: "Versandhinweise", width: 12 },
    ],
    rows.map((r) => {
      if (r.first) shade = !shade;
      return {
        cells: r.first
          ? [
              `${r.number}\n${berlin(r.createdAt)}\n${r.channel}`,
              [r.company, r.recipient].filter(Boolean).join("\n") || "fehlt",
              [[r.street, r.houseNo].filter(Boolean).join(" "), r.extra].filter(Boolean).join("\n") || "fehlt",
              [[r.zip, r.city].filter(Boolean).join(" "), ["DE", "Deutschland", "Germany"].includes(r.country) ? "" : r.country].filter(Boolean).join("\n") || "fehlt",
              r.phone || "—",
              r.sku || "—",
              r.sort && r.sort !== r.product ? `${r.product}\n${r.sort}` : r.product,
              int(r.quantity),
              `${r.unit || "unbekannt"}${r.contents ? `\n${r.contents}` : ""}`,
              r.note,
            ]
          : ["", "", "", "", "", r.sku || "—", r.sort && r.sort !== r.product ? `${r.product}\n${r.sort}` : r.product, int(r.quantity), `${r.unit || "unbekannt"}${r.contents ? `\n${r.contents}` : ""}`, ""],
        shade: !shade,
      };
    }),
    { size: 7.5, padding: 3.5 },
  );
  if (!rows.length) flow.paragraph("Keine passenden Bestellungen im gewählten Zeitraum.", { size: 10, gray: 0.4 });
  return doc.build(new Date(ctx.now));
}

/* ───────────── Artikel-Sammelliste ───────────── */

/**
 * Mengen je Sorte, je Produkt und je Verpackungseinheit – nur bestellte Mengen, ohne Stornos.
 * Je Sorte über `collectUnits` (dieselbe Berechnung wie das Excel-Blatt „Artikel-Sammelliste“).
 */
export function collectReport(orders: OfficeOrder[], products: Map<string, Product>, match?: LineMatch) {
  const { rows, unknown } = collectUnits(orders, products, match);
  const bySort = rows.map((r) => {
    const info = packInfo(r.handle);
    const split = splitUnits(r.units, info);
    return { ...r, unitName: info.unitName, perTray: info.perTray, traysPerPallet: info.traysPerPallet, trays: split.trays, rest: split.rest, pallets: split.pallets };
  });
  const live = orders.filter((o) => o.processing !== "storniert");
  const productMap = new Map<string, { product: string; unit: string; sku: string; quantity: number; positions: number; privat: number; haendler: number }>();
  const unitMap = new Map<string, number>();
  for (const o of live) {
    for (const l of o.lines) {
      if (match && l.handle && !match(l.handle, l.handle) && !(products.get(l.handle)?.contents ?? []).some(([h]) => match(l.handle, h))) continue;
      const unit = l.unit || "Einheit unbekannt";
      const k = `${l.handle ?? l.product}|${unit}`;
      const row = productMap.get(k) ?? { product: l.product, unit, sku: l.sku, quantity: 0, positions: 0, privat: 0, haendler: 0 };
      row.quantity += l.quantity;
      row.positions += 1;
      row[o.channel] += l.quantity;
      productMap.set(k, row);
      unitMap.set(unit, (unitMap.get(unit) ?? 0) + l.quantity);
    }
  }
  const byProduct = [...productMap.values()].sort((a, b) => b.quantity - a.quantity || a.product.localeCompare(b.product, "de"));
  const byUnit = [...unitMap.entries()].map(([unit, quantity]) => ({ unit, quantity })).sort((a, b) => b.quantity - a.quantity);
  const cans = bySort.filter((r) => r.unitName === "Dosen").reduce((n, r) => n + r.units, 0);
  const bottles = bySort.filter((r) => r.unitName === "Flaschen").reduce((n, r) => n + r.units, 0);
  const trays = bySort.reduce((n, r) => n + r.trays, 0);
  const partialTrays = bySort.filter((r) => r.rest > 0).length;
  const privat = bySort.reduce((n, r) => n + r.privat, 0);
  const haendler = bySort.reduce((n, r) => n + r.haendler, 0);
  return { bySort, byProduct, byUnit, unknown, totals: { cans, bottles, trays, partialTrays, privat, haendler, orders: live.length, cancelled: orders.length - live.length } };
}

function collectTables(flow: Flow, r: ReturnType<typeof collectReport>, o: { compact?: boolean } = {}) {
  flow.heading("Mengen je Sorte (Mixpakete laut Produktdaten aufgeteilt)", { size: 10.5, gap: 4 });
  const total = r.totals.cans + r.totals.bottles;
  flow.table(
    [
      { header: "Sorte", width: 22, bold: true },
      { header: "Artikelnummer", width: 13 },
      { header: "Stück", width: 12, align: "right" },
      { header: "Je Tray", width: 7, align: "right" },
      { header: "Trays", width: 8, align: "right", bold: true },
      { header: "Rest", width: 7, align: "right" },
      { header: "Paletten", width: 9, align: "right" },
      { header: "Anteil", width: 8, align: "right" },
      ...(o.compact ? [] : [{ header: "Bestellungen", width: 10, align: "right" as const }]),
    ],
    [
      ...r.bySort.map((x) => [
        x.sort,
        x.sku || "—",
        `${int(x.units)} ${x.unitName}`,
        int(x.perTray),
        int(x.trays),
        int(x.rest),
        dec(x.pallets === null ? null : Math.round(x.pallets * 100) / 100),
        pct(x.units, total),
        ...(o.compact ? [] : [int(x.orders)]),
      ]),
      ...(r.bySort.length
        ? [{ cells: ["Gesamt", "", [r.totals.cans ? `${int(r.totals.cans)} Dosen` : "", r.totals.bottles ? `${int(r.totals.bottles)} Flaschen` : ""].filter(Boolean).join("\n"), "", int(r.totals.trays), r.totals.partialTrays ? `${r.totals.partialTrays}× angebr.` : "", "", "100 %", ...(o.compact ? [] : [""])], bold: true }]
        : []),
    ],
  );
  if (!r.bySort.length) flow.paragraph("Keine Artikel im gewählten Zeitraum.", { size: 9.5, gray: 0.4 });
  flow.y += 12;
  flow.heading("Mengen je Produkt und Verpackungseinheit", { size: 10.5, gap: 4 });
  flow.table(
    [
      { header: "Produkt", width: 34, bold: true },
      { header: "Artikelnummer", width: 15 },
      { header: "Verpackungseinheit", width: 20 },
      { header: "Bestellte Menge", width: 12, align: "right", bold: true },
      { header: "Privat", width: 9, align: "right" },
      { header: "Händler", width: 9, align: "right" },
    ],
    r.byProduct.map((x) => [x.product, x.sku || "—", x.unit, int(x.quantity), int(x.privat), int(x.haendler)]),
  );
  flow.y += 12;
  flow.heading("Mengen je Verpackungseinheit", { size: 10.5, gap: 4 });
  flow.table(
    [
      { header: "Verpackungseinheit", width: 60, bold: true },
      { header: "Bestellte Menge", width: 20, align: "right" },
    ],
    r.byUnit.map((x) => [x.unit, int(x.quantity)]),
  );
  if (r.unknown.length) {
    flow.y += 10;
    flow.heading("Positionen mit unbekannter Menge (nicht in den Summen):", { size: 9, gap: 2 });
    for (const u of r.unknown) flow.paragraph(`${u.number}: ${int(u.quantity)}× ${u.product} (${u.unit || "Einheit unbekannt"})`, { size: 8.5 });
  }
}

export function collectListPdf(orders: OfficeOrder[], ctx: ListContext, company: CompanyInfo, products: Map<string, Product>, logo: PdfImage | null, match?: LineMatch): Buffer {
  const r = collectReport(orders, products, match);
  const doc = new PdfDoc(ctx.title);
  doc.footer = (page, pages) => ({ left: `${ctx.title} · ${berlin(ctx.now, true)} · nur bestellte Mengen, keine Lagerbestände`, right: `Seite ${page} von ${pages}` });
  doc.addPage();
  const flow = new Flow(doc, listHead(doc, ctx, company, logo, `${int(r.totals.orders)} Bestellungen (ohne Stornos)`), () => mm(15));
  flow.keyValues(
    [
      ["Bestellungen (ohne Stornos)", int(r.totals.orders)],
      ["Dosen gesamt", int(r.totals.cans)],
      ...(r.totals.bottles ? ([["Flaschen gesamt", int(r.totals.bottles)]] as [string, string][]) : []),
      ["Volle Trays gesamt", `${int(r.totals.trays)}${r.totals.partialTrays ? ` (+ ${r.totals.partialTrays} angebrochene)` : ""}`],
    ],
    { size: 10, bold: ["Dosen gesamt"] },
  );
  flow.y += 10;
  collectTables(flow, r);
  return doc.build(new Date(ctx.now));
}

/* ───────────── Tagesbericht ───────────── */

/** Tagesauswertung – Kennzahlen aus computeKpis (gleiche Regeln wie Übersicht und Excel) */
export function dailyReport(orders: OfficeOrder[], day: Range, products: Map<string, Product>, now: number) {
  const inDay = orders.filter((o) => o.createdAt >= day.from && o.createdAt < day.to);
  const k = computeKpis(inDay, day, now);
  // USt des Umsatzes: gleiche Regeln wie der Umsatz, anteilig um Erstattungen gekürzt
  const vat = inDay.reduce((n, o) => n + (countsAsRevenue(o) && o.gross > 0 ? Math.round(o.vat * ((o.gross - o.refunded) / o.gross)) : 0), 0);
  return {
    day,
    counts: {
      received: k.counts.total,
      private: k.counts.private,
      dealer: k.counts.dealer,
      paid: k.counts.paid,
      unpaid: k.counts.unpaid,
      open: k.counts.open,
      cancelled: k.counts.cancelled,
      refunded: inDay.filter((o) => o.refunded > 0).length,
      fullyRefunded: inDay.filter((o) => o.paymentStatus === "erstattet").length,
    },
    money: { ...k.money, vat },
    collect: collectReport(inDay, products),
    cancelled: inDay.filter((o) => o.processing === "storniert"),
    refunds: inDay.filter((o) => o.refunded > 0),
    orders: inDay,
  };
}

export function dailyReportPdf(orders: OfficeOrder[], ctx: ListContext, company: CompanyInfo, products: Map<string, Product>, logo: PdfImage | null): Buffer {
  const r = dailyReport(orders, ctx.range, products, ctx.now);
  const doc = new PdfDoc(ctx.title);
  doc.footer = (page, pages) => ({ left: `EXSTASE – Tagesbericht ${ctx.range.label} · erstellt ${berlin(ctx.now, true)}`, right: `Seite ${page} von ${pages}` });
  doc.addPage();
  const flow = new Flow(doc, listHead(doc, ctx, company, logo, `Berichtsdatum: ${ctx.range.label}`), () => mm(15));

  flow.heading("Zusammenfassung", { size: 11, gap: 2 });
  flow.paragraph(
    `${int(r.counts.received)} Bestellungen eingegangen (${int(r.counts.private)} Privat, ${int(r.counts.dealer)} Händler), Umsatz ${formatPrice(r.money.gross)} brutto, ${int(r.collect.totals.cans)} Dosen${r.collect.totals.bottles ? ` und ${int(r.collect.totals.bottles)} Flaschen` : ""} bestellt.`,
    { size: 9.5, gap: 10 },
  );

  flow.heading("Bestellkennzahlen", { size: 11, gap: 2 });
  flow.keyValues([
    ["Neue Bestellungen", int(r.counts.received)],
    ["Privatkundenbestellungen", int(r.counts.private)],
    ["Händlerbestellungen", int(r.counts.dealer)],
    ["Bezahlt", int(r.counts.paid)],
    ["Unbezahlt", `${int(r.counts.unpaid)} (Händler auf Rechnung zählen hier mit, bis die Rechnung bezahlt ist)`],
    ["Offen (noch nicht bearbeitet)", int(r.counts.open)],
    ["Stornierungen", int(r.counts.cancelled)],
    ["Rückerstattungen", `${int(r.counts.refunded)} (davon ${int(r.counts.fullyRefunded)} vollständig)`],
  ]);
  flow.y += 10;

  flow.heading("Umsatzkennzahlen (brutto, Euro)", { size: 11, gap: 2 });
  flow.keyValues(
    [
      ["Umsatz brutto", formatPrice(r.money.gross)],
      ["Umsatz netto", formatPrice(r.money.net)],
      ["Umsatzsteuer", formatPrice(r.money.vat)],
      ["Rabatte", formatPrice(r.money.discount)],
      ["Versandkosten", `${formatPrice(r.money.shipping)}${r.money.shippingOnRequest ? ` (+ ${r.money.shippingOnRequest}× Spedition nach Absprache, nicht enthalten)` : ""}`],
      ["Pfand", formatPrice(r.money.deposit)],
      ["Erstattungen", formatPrice(r.money.refunds)],
      ["Noch unbezahlt", formatPrice(r.money.unpaidGross)],
    ],
    { bold: ["Umsatz brutto"] },
  );
  flow.paragraph(
    "Berechnung: Umsatz = Bruttobetrag abzüglich Erstattungen, ohne Stornos; Privatbestellungen zählen erst nach Zahlung (Stripe), Händlerbestellungen auf Rechnung ab Bestellung. Händlerwerte sind netto gespeichert und mit 19 % in brutto umgerechnet. USt laut Stripe bzw. Rechnung, sonst aus dem Bruttobetrag berechnet. Pfand ungekürzt: Bei Gutscheinen kann Stripe den Rabatt anteilig auch auf die Pfandposition verteilen – dieser Anteil steckt dann in „Rabatte“.",
    { size: 7.5, gray: 0.4, gap: 10 },
  );

  flow.heading("Kunden-Verteilung (Stück, ohne Stornos)", { size: 11, gap: 2 });
  const totalUnits = r.collect.totals.privat + r.collect.totals.haendler;
  flow.keyValues([
    ["Privatkunden", `${int(r.collect.totals.privat)} Stück · ${pct(r.collect.totals.privat, totalUnits)}`],
    ["Händler", `${int(r.collect.totals.haendler)} Stück · ${pct(r.collect.totals.haendler, totalUnits)}`],
  ]);
  flow.y += 10;

  flow.heading("Artikel-Sammelliste", { size: 11, gap: 4 });
  collectTables(flow, r.collect, { compact: true });

  flow.y += 14;
  flow.heading("Stornierungen und Erstattungen", { size: 11, gap: 4 });
  const special = [...new Map([...r.cancelled, ...r.refunds].map((o) => [o.key, o])).values()].sort((a, b) => a.createdAt - b.createdAt);
  if (!special.length) flow.paragraph("Keine Stornierungen oder Erstattungen an diesem Tag.", { size: 9.5, gray: 0.4 });
  else
    flow.table(
      [
        { header: "Bestellung", width: 14, bold: true },
        { header: "Uhrzeit", width: 8 },
        { header: "Kundenart", width: 11 },
        { header: "Bearbeitung", width: 13 },
        { header: "Zahlung", width: 16 },
        { header: "Betrag brutto", width: 13, align: "right" },
        { header: "Erstattet", width: 13, align: "right" },
      ],
      special.map((o) => [o.number, clock(o.createdAt), CHANNEL_LABEL[o.channel], PROCESSING_LABEL[o.processing], PAYMENT_LABEL[o.paymentStatus], formatPrice(o.gross), o.refunded ? formatPrice(o.refunded) : "—"]),
    );

  if (r.orders.length) {
    flow.y += 14;
    flow.heading("Alle Bestellungen des Tages", { size: 11, gap: 4 });
    flow.table(
      [
        { header: "Bestellung", width: 14, bold: true },
        { header: "Uhrzeit", width: 8 },
        { header: "Kundenart", width: 11 },
        { header: "Kunde / Firma", width: 28 },
        { header: "Gesamt brutto", width: 13, align: "right" },
        { header: "Zahlung", width: 13 },
        { header: "Bearbeitung", width: 13 },
      ],
      [...r.orders].sort((a, b) => a.createdAt - b.createdAt).map((o) => [o.number, clock(o.createdAt), CHANNEL_LABEL[o.channel], o.company || o.customerName || "—", formatPrice(o.gross), PAYMENT_LABEL[o.paymentStatus], PROCESSING_LABEL[o.processing]]),
      { size: 8.5 },
    );
  }
  return doc.build(new Date(ctx.now));
}
