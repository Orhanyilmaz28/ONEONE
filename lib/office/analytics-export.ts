import type { AnalyticsResult } from "./analytics-service";
import { groupName } from "./analytics";
import { type CompanyInfo, listHead } from "./documents";
import { Flow, PdfDoc, type PdfImage, mm } from "./pdf";
import type { Sheet } from "./xlsx";

/**
 * Export der Verkaufsanalysen (Excel/PDF) – nur Kennzahlen und Firmennamen von Händlern, keine Privatkunden-Namen,
 * -Adressen oder -E-Mails. Gleiche Zahlen wie auf der Seite (eine Berechnung: analytics.ts).
 */
const eur = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
const int = (n: number) => n.toLocaleString("de-DE");
export const pctText = (v: number | null) => (v === null ? "keine Basis" : `${v > 0 ? "+" : ""}${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);
const day = (ms: number) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(ms);
const money = (c: number) => c / 100;

export function analyticsSheets(a: AnalyticsResult, meta: { createdBy: string; now: number }): Sheet[] {
  const t = a.current;
  const info: Sheet = {
    name: "Kennzahlen",
    columns: [{ header: "Kennzahl", width: 44 }, { header: "Wert", type: "money", width: 16 }, { header: "Hinweis", width: 50 }],
    rows: [
      ["Zeitraum", null, a.req.range.label],
      ["Vergleich", null, a.req.previous.label],
      ["Filter", null, a.filterText.join(" · ")],
      ["Erstellt", null, `${day(meta.now)} von ${meta.createdBy}`],
      ...(a.complete ? [] : [["ACHTUNG: Daten unvollständig", null, a.errors.join(" ")]]),
      { cells: ["Umsatz brutto", money(t.gross), "brutto abzüglich Erstattungen, ohne Stornos"], bold: true },
      ["Umsatz netto", money(t.net), ""],
      ["Umsatzsteuer", money(t.vat), "brutto − netto"],
      ["Pfand (brutto)", money(t.deposit), ""],
      ["Versandkosten (brutto)", money(t.shipping), ""],
      ["Rabatte (brutto)", money(t.discount), ""],
      ["Erstattungen", money(t.refunds), ""],
      ["Stornierungen (Anzahl)", t.cancelled, `Bestellwert ${eur(t.cancelledGross)}`],
      ["Bestellungen (umsatzwirksam)", t.orders, `${t.pending} weitere noch nicht umsatzwirksam (z. B. unbezahlt)`],
      ["Ø Bestellwert brutto", t.aov === null ? null : money(t.aov), ""],
      ["Privat: Zahlungseingänge brutto", money(t.b2c.gross), `${t.b2c.orders} Bestellungen`],
      ["Händler: Rechnungsaufträge brutto", money(t.b2b.gross), `${t.b2b.orders} Bestellungen`],
      ["Gewinn", null, "nicht berechnet – keine Einkaufspreise/Kosten im System"],
    ],
  };
  const cmp: Sheet = {
    name: "Vergleich",
    columns: [{ header: "Kennzahl", width: 36 }, { header: "Zeitraum", type: "dec", width: 16 }, { header: "Vergleich", type: "dec", width: 16 }, { header: "Veränderung", type: "dec", width: 16 }, { header: "Veränderung %", width: 16 }],
    rows: a.comparison.rows.map((r) => [r.label, r.money ? money(r.change.now) : r.change.now, r.money ? money(r.change.before) : r.change.before, r.money ? money(r.change.abs) : r.change.abs, pctText(r.change.pct)]),
  };
  const prod: Sheet = {
    name: "Produkte",
    columns: [{ header: "Produkt", width: 34 }, { header: "Gruppe", width: 16 }, { header: "Bestellmenge (Einheiten)", type: "int" }, { header: "Bestellungen", type: "int" }, { header: "Umsatz brutto", type: "money" }, { header: "Ø je Bestellung", type: "money" }, { header: "Anteil %", type: "dec" }],
    rows: a.products.map((r) => [r.title, r.group, r.packs, r.orders, money(r.revenue), r.avgPerOrder === null ? null : money(r.avgPerOrder), Math.round(r.share * 10) / 10]),
  };
  const groups: Sheet = {
    name: "Produktgruppen",
    columns: [{ header: "Gruppe", width: 30 }, { header: "Bestellmenge (Einheiten)", type: "int" }, { header: "Bestellungen", type: "int" }, { header: "Umsatz brutto", type: "money" }, { header: "Anteil %", type: "dec" }],
    rows: a.groups.map((r) => [r.title, r.packs, r.orders, money(r.revenue), Math.round(r.share * 10) / 10]),
  };
  const sorts: Sheet = {
    name: "Sorten",
    columns: [{ header: "Sorte", width: 30 }, { header: "Dosen/Flaschen", type: "int" }, { header: "Bestellungen", type: "int" }, { header: "Umsatz brutto (ohne Mixpakete)", type: "money" }],
    rows: [...a.sorts.rows.map((r) => [r.sort, r.units, r.orders, money(r.revenue)]), ...(a.sorts.unknownLines ? [[`${a.sorts.unknownLines} Position(en) ohne gesicherte Sortenzuordnung (Mixpaket ohne Kauf-Zusammensetzung)`, null, null, null]] : [])],
  };
  const dealers: Sheet = {
    name: "Händler",
    columns: [{ header: "Händler", width: 30 }, { header: "Bestellungen", type: "int" }, { header: "Umsatz brutto", type: "money" }, { header: "Umsatz netto", type: "money" }, { header: "Ø Bestellwert", type: "money" }, { header: "Letzte Bestellung", width: 14 }, { header: "Häufigste Produkte", width: 36 }, { header: "Häufigste Sorten", width: 36 }, { header: "Wiederkehrend", width: 12 }],
    rows: [
      ...a.dealers.rows.map((r) => [r.company, r.orders, money(r.gross), money(r.net), r.aov === null ? null : money(r.aov), day(r.lastOrder), r.topProducts.join(", "), r.topSorts.join(", "), r.recurring ? "ja" : "nein"]),
      ...a.dealers.quiet.map((d) => [`${d.company} (ohne Bestellung seit ${a.dealers.quietDays} Tagen)`, 0, null, null, null, d.lastOrder ? day(d.lastOrder) : "nie", "", "", ""]),
    ],
  };
  const p = a.privat;
  const priv: Sheet = {
    name: "Privatkunden",
    columns: [{ header: "Kennzahl", width: 50 }, { header: "Wert", type: "dec", width: 16 }],
    rows: [
      ["Kunden (Konto oder E-Mail)", p.customers],
      ["Bestellungen", p.orders],
      ["Neu (im Vergleichszeitraum nicht gekauft)", p.newInPeriod],
      ["Wiederkehrend (auch im Vergleichszeitraum gekauft)", p.returning],
      ["Mit 2+ Bestellungen im Zeitraum", p.repeatInPeriod],
      ["Bestellungen je Kunde", p.frequency === null ? null : Math.round(p.frequency * 100) / 100],
      ["Ø Bestellwert brutto", p.aov === null ? null : money(p.aov)],
      ["Umsatz brutto", money(p.gross)],
      ["Bestellungen ohne zuordenbaren Kunden", p.unknown],
    ],
  };
  const d = a.discounts;
  const codes: Sheet = {
    name: "Rabattcodes",
    columns: [{ header: "Code / Herkunft", width: 30 }, { header: "Creator", width: 24 }, { header: "Verwendungen", type: "int" }, { header: "Umsatz brutto", type: "money" }, { header: "Rabatt brutto", type: "money" }, { header: "Provision (aus Provisionsbuch)", type: "money" }, { header: "Bestellungen", width: 50 }],
    rows: [
      ...d.codes.map((c) => [c.code, c.creator, c.uses, money(c.gross), money(c.discount), c.commission === null ? null : money(c.commission), c.orders.slice(0, 50).join(", ")]),
      ["Ohne Code (Mix-Rabatt oder Aktionscode)", "", d.mixOrPromo.orders, null, money(d.mixOrPromo.discount), null, ""],
      ["Händlerrabatt (Rechnung)", "", d.dealer.orders, null, money(d.dealer.discount), null, ""],
    ],
  };
  const timeline: Sheet = {
    name: "Verlauf",
    columns: [{ header: "Zeitraum", width: 14 }, { header: "Privat brutto", type: "money" }, { header: "Händler brutto", type: "money" }, { header: "Gesamt brutto", type: "money" }, { header: "Bestellungen", type: "int" }, { header: "Rabatte brutto", type: "money" }],
    rows: a.timeline.map((b) => [b.label, money(b.b2c), money(b.b2b), money(b.b2c + b.b2b), b.orders, money(b.discount)]),
  };
  return [info, cmp, timeline, prod, groups, sorts, dealers, priv, codes];
}

export function analyticsPdf(a: AnalyticsResult, company: CompanyInfo, logo: PdfImage | null, meta: { createdBy: string; now: number }): Buffer {
  const title = "Verkaufsanalyse";
  const doc = new PdfDoc(title, { landscape: true });
  doc.footer = (page, pages) => ({ left: `${title} · ${a.req.range.label} · intern`, right: `Seite ${page} von ${pages}` });
  doc.addPage();
  const flow = new Flow(doc, listHead(doc, { title, range: a.req.range, filters: a.filterText, createdBy: meta.createdBy, now: meta.now }, company, logo, `Vergleich: ${a.req.previous.label}`), () => mm(15));
  if (!a.complete) flow.paragraph(`ACHTUNG: Daten unvollständig – ${a.errors.join(" ")}`, { size: 9, font: "bold" });
  const t = a.current;
  flow.heading("Kennzahlen", { size: 11 });
  flow.keyValues(
    [
      ["Umsatz brutto / netto", `${eur(t.gross)} / ${eur(t.net)}`],
      ["Umsatzsteuer", eur(t.vat)],
      ["Pfand · Versand · Rabatte", `${eur(t.deposit)} · ${eur(t.shipping)} · ${eur(t.discount)}`],
      ["Erstattungen · Stornierungen", `${eur(t.refunds)} · ${int(t.cancelled)}`],
      ["Bestellungen · Ø Bestellwert", `${int(t.orders)} · ${eur(t.aov)}`],
      ["Privat (Zahlungseingänge) · Händler (Rechnungsaufträge)", `${eur(t.b2c.gross)} · ${eur(t.b2b.gross)}`],
      ["Gewinn", "nicht berechnet (keine Einkaufspreise im System)"],
    ],
    { size: 9, keyWidth: mm(95) },
  );
  flow.heading("Vergleich", { size: 11 });
  flow.table(
    [{ header: "Kennzahl", width: 30, bold: true }, { header: "Zeitraum", width: 15, align: "right" }, { header: "Vergleich", width: 15, align: "right" }, { header: "Veränderung", width: 15, align: "right" }, { header: "%", width: 12, align: "right" }],
    a.comparison.rows.map((r) => [r.label, r.money ? eur(r.change.now) : int(r.change.now), r.money ? eur(r.change.before) : int(r.change.before), r.money ? eur(r.change.abs) : int(r.change.abs), pctText(r.change.pct)]),
    { size: 8 },
  );
  flow.heading("Produktgruppen", { size: 11 });
  flow.table(
    [{ header: "Gruppe", width: 30, bold: true }, { header: "Einheiten", width: 12, align: "right" }, { header: "Bestellungen", width: 12, align: "right" }, { header: "Umsatz brutto", width: 15, align: "right" }, { header: "Anteil", width: 10, align: "right" }],
    a.groups.map((r) => [groupName(r.key), int(r.packs), int(r.orders), eur(r.revenue), `${r.share.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`]),
    { size: 8 },
  );
  flow.heading("Top-Produkte", { size: 11 });
  flow.table(
    [{ header: "Produkt", width: 34, bold: true }, { header: "Einheiten", width: 12, align: "right" }, { header: "Bestellungen", width: 12, align: "right" }, { header: "Umsatz brutto", width: 15, align: "right" }, { header: "Anteil", width: 10, align: "right" }],
    a.products.slice(0, 25).map((r) => [r.title, int(r.packs), int(r.orders), eur(r.revenue), `${r.share.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`]),
    { size: 8 },
  );
  flow.heading("Meistbestellte Sorten (Dosen/Flaschen)", { size: 11 });
  flow.table(
    [{ header: "Sorte", width: 34, bold: true }, { header: "Menge", width: 12, align: "right" }, { header: "Bestellungen", width: 12, align: "right" }, { header: "Umsatz (ohne Mix)", width: 15, align: "right" }],
    a.sorts.rows.slice(0, 25).map((r) => [r.sort, int(r.units), int(r.orders), eur(r.revenue)]),
    { size: 8 },
  );
  if (a.sorts.unknownLines) flow.paragraph(`${a.sorts.unknownLines} Position(en) ohne gesicherte Sortenzuordnung (Mixpaket ohne gespeicherte Zusammensetzung).`, { size: 8, gray: 0.4 });
  flow.heading("Top-Händler", { size: 11 });
  flow.table(
    [{ header: "Händler", width: 30, bold: true }, { header: "Bestellungen", width: 10, align: "right" }, { header: "Umsatz brutto", width: 14, align: "right" }, { header: "Ø Bestellwert", width: 13, align: "right" }, { header: "Letzte", width: 12 }, { header: "Häufigste Sorten", width: 30 }],
    a.dealers.rows.slice(0, 25).map((r) => [r.company, int(r.orders), eur(r.gross), eur(r.aov), day(r.lastOrder), r.topSorts.join(", ")]),
    { size: 8 },
  );
  flow.heading("Rabattcodes", { size: 11 });
  flow.table(
    [{ header: "Code", width: 20, bold: true }, { header: "Creator", width: 20 }, { header: "Verwendungen", width: 12, align: "right" }, { header: "Umsatz brutto", width: 14, align: "right" }, { header: "Rabatt", width: 12, align: "right" }, { header: "Provision", width: 12, align: "right" }],
    [
      ...a.discounts.codes.map((c) => [c.code, c.creator || "—", int(c.uses), eur(c.gross), eur(c.discount), eur(c.commission)]),
      ["Ohne Code (Mix/Aktion)", "", int(a.discounts.mixOrPromo.orders), "", eur(a.discounts.mixOrPromo.discount), ""],
      ["Händlerrabatt", "", int(a.discounts.dealer.orders), "", eur(a.discounts.dealer.discount), ""],
    ],
    { size: 8 },
  );
  return doc.build(new Date(meta.now));
}
