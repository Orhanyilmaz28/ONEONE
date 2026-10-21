/**
 * Phase 3B – Büro-Dokumente: Lieferscheine (Nummern, Versionen, Sammeldruck, Vorschau), Versandliste,
 * Artikel-Sammelliste, Tagesbericht, PDF-Aufbau, Rechte, Ausfälle und fehlende Nebenwirkungen.
 * Läuft ohne Netz, ohne Stripe und ohne echte Datenbank (Datei-Speicher in einem Temp-Ordner, Redis-Ersatz im Speicher).
 * Mit REDIS_TEST_URL/REDIS_TEST_TOKEN läuft zusätzlich die parallele Nummernvergabe gegen eine lokale Test-Redis.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { inflateSync } from "node:zlib";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO", "ADMIN_REQUIRE_2FA"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-docs-"));
process.chdir(dir);
const ROOT = path.join(import.meta.dirname, "..");

const time = await import("../lib/office/time");
const model = await import("../lib/office/model");
const filters = await import("../lib/office/filters");
const kpis = await import("../lib/office/kpis");
const exp = await import("../lib/office/export");
const roles = await import("../lib/office/roles");
const pdf = await import("../lib/office/pdf");
const docs = await import("../lib/office/documents");
const shipping = await import("../lib/office/shipping");
const notes = await import("../lib/office/delivery-notes");
const service = await import("../lib/office/documents-service");
const { logoImage } = await import("../lib/office/logo");
const { memoryBackend, setKvBackend } = await import("../lib/kv");
const { listSecurityEvents } = await import("../lib/admin-security/audit");
const store = await import("../lib/store");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const { company: COMPANY_STATIC } = await import("../lib/company");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;
type DealerOrder = import("../lib/dealer-orders").DealerOrder;

after(() => fs.rm(dir, { recursive: true, force: true }));
setKvBackend(memoryBackend(() => Date.now()));

/* ───────────── Testdaten ───────────── */

const mix: Product = {
  handle: "mix-test",
  title: "Mix-Test",
  descriptionHtml: "",
  tags: [],
  collections: ["mixpakete"],
  images: [],
  options: [],
  variants: [{ id: "v-mix", title: "2 Trays", price: 3600, available: true, options: {}, cans: 48 }],
  createdAt: "2026-01-01",
  contents: [
    ["classic", 1],
    ["tropical", 1],
  ],
};
const PRODUCTS = new Map<string, Product>([...(catalogData.products as Product[]), mix].map((p) => [p.handle, p]));
const COMPANY = { ...COMPANY_STATIC } as unknown as import("../lib/office/documents").CompanyInfo;
const T = (iso: string) => Date.parse(iso);
const seqOf = async (year: string) => (await store.getJSON<Record<string, number>>(store.KEYS.officeNoteSeq, {}))[year];
const sec = (iso: string) => Math.floor(T(iso) / 1000);
const NOW = T("2026-10-20T12:00:00Z");

function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_test_A1",
    created: sec("2026-10-20T08:00:00Z"),
    amount_total: 3600 + 1200 + 590 - 360,
    amount_subtotal: 3600 + 1200,
    payment_status: "paid",
    metadata: { items: "classic:2" },
    customer_details: { name: "Jürgen Müßig", email: "jm@example.de", phone: "+49 151 0000", address: { line1: "Hauptstraße 1", postal_code: "01067", city: "Dresden", country: "DE" } },
    collected_information: { shipping_details: { name: "Jürgen Müßig", address: { line1: "Lieferweg 2", line2: "Hinterhaus", postal_code: "01069", city: "Dresden", country: "DE" } } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: 360, amount_tax: 0 },
    payment_intent: { latest_charge: { amount_refunded: 0, refunded: false, payment_method_details: { type: "card" } } },
    ...over,
  } as import("../lib/office/model").StripeSessionLike;
}
const LINES = [
  { description: "Classic", quantity: 2, amount_total: 3300, amount_subtotal: 3600, amount_discount: 300, price: { unit_amount: 1800 } },
  { description: "Einwegpfand", quantity: 48, amount_total: 1140, amount_subtotal: 1200, amount_discount: 60, price: { unit_amount: 25 } },
];
function b2c(over: Record<string, unknown> = {}, lines: typeof LINES = LINES, status: import("../lib/orders").OrderStatus = "offen") {
  const s = session(over);
  return model.fromStripe(s, lines, { status }, PRODUCTS, `EX-${s.id.slice(-6).toUpperCase()}`);
}
const rows = [
  { handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
  { handle: "tropical", title: "Tropical", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
  { handle: "wasser-still", title: "Aqua x Still", perTray: 12, can: { s1: 30, pal: 25 } as Record<string, number>, orderable: true },
];
function dealerOrder(over: Partial<DealerOrder> = {}, qty: Record<string, number> = { classic: 3, tropical: 2 }): DealerOrder {
  const calc = calcDealerOrder(rows as never, qty, { cost: 1190, freeFrom: 0 });
  return {
    id: "a1b2c3d4e5f60718",
    number: "H-2026-0007",
    createdAt: "2026-10-20T09:30:00.000Z",
    dealerId: "d1",
    dealerEmail: "einkauf@kiosk.de",
    tierName: "Standard",
    status: "eingegangen",
    history: [{ status: "eingegangen", at: "2026-10-20T09:30:00.000Z" }],
    calc,
    delivery: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
    reference: "PO-77",
    note: "Bitte vor 10 Uhr",
    ...over,
  };
}
const DEALER = { id: "d1", company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", email: "einkauf@kiosk.de", phone: "0341 123", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig", vatId: "DE123456789" } as never;
const b2b = (over: Partial<DealerOrder> = {}, qty?: Record<string, number>) => model.fromDealer(dealerOrder(over, qty), DEALER, PRODUCTS);

const noteInfo = (number: string | null, remark = "") => ({ number, version: 1, createdAt: new Date(NOW).toISOString(), remark });
const DAY = time.dayRange({ y: 2026, m: 10, d: 20 });
const ctx = (title: string, range = DAY) => ({ title, range, filters: ["Alle Kunden"], createdBy: "Büromitarbeiter anna", now: NOW });
const WHO = { role: "buero" as const, name: "Anna", userId: "u-anna", username: "anna" };
const ORIGIN = { ip: "127.0.0.1", ua: "test" };

/* ───────────── PDF lesen (für die Prüfung) ───────────── */

const WIN_BACK: Record<number, string> = { 0x80: "€", 0x84: "„", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—", 0x91: "‘", 0x92: "’", 0x85: "…", 0x95: "•" };

type Parsed = { pages: string[][]; positions: { x: number; y: number }[][]; raw: string; objects: Map<number, string>; images: number };

/** Prüft den Aufbau (Kopf, Objekte, Querverweistabelle, Ende) und liefert den Text je Seite */
function readPdf(buf: Buffer): Parsed {
  const raw = buf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.4\n"), "PDF-Kopf");
  assert.ok(raw.trimEnd().endsWith("%%EOF"), "PDF-Ende");
  const startxref = Number(/startxref\n(\d+)\n%%EOF\s*$/.exec(raw)?.[1]);
  assert.equal(raw.slice(startxref, startxref + 4), "xref", "startxref zeigt auf die Querverweistabelle");
  const xref = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(raw.slice(startxref));
  assert.ok(xref);
  const count = Number(xref[1]);
  const entries = xref[2].trim().split("\n").slice(1);
  assert.equal(entries.length, count - 1);
  const objects = new Map<number, string>();
  entries.forEach((e, i) => {
    const off = Number(e.slice(0, 10));
    assert.equal(raw.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `Objekt ${i + 1} an der angegebenen Stelle`);
    const end = raw.indexOf("\nendobj", off);
    objects.set(i + 1, raw.slice(off, end));
  });
  const pagesObj = objects.get(2) ?? "";
  const kids = [...pagesObj.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  assert.equal(Number(/\/Count (\d+)/.exec(pagesObj)?.[1]), kids.length);
  const pages: string[][] = [];
  const positions: { x: number; y: number }[][] = [];
  for (const k of kids) {
    const page = objects.get(k) ?? "";
    assert.match(page, /\/MediaBox \[0 0 (595\.28 841\.89|841\.89 595\.28)\]/, "DIN A4");
    const contentNo = Number(/\/Contents (\d+) 0 R/.exec(page)?.[1]);
    const obj = objects.get(contentNo) ?? "";
    const start = obj.indexOf("stream\n") + 7;
    const len = Number(/\/Length (\d+)/.exec(obj)?.[1]);
    const content = inflateSync(Buffer.from(obj.slice(start, start + len), "latin1")).toString("latin1");
    const texts: string[] = [];
    const pos: { x: number; y: number }[] = [];
    for (const m of content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm \(((?:\\.|[^\\)])*)\) Tj/g)) {
      pos.push({ x: Number(m[1]), y: Number(m[2]) });
      const t = m[3].replace(/\\([\\()])/g, "$1");
      texts.push([...t].map((c) => WIN_BACK[c.charCodeAt(0)] ?? c).join(""));
    }
    pages.push(texts);
    positions.push(pos);
  }
  assert.match(objects.get(3) ?? "", /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  const images = [...objects.values()].filter((o) => o.includes("/Subtype /Image")).length;
  return { pages, positions, raw, objects, images };
}
const allText = (p: Parsed) => p.pages.flat().join("\n");
/** Text ohne Zeilenumbrüche (umbrochene Tabellenzellen wieder zusammengesetzt) */
const flatText = (p: Parsed) => p.pages.flat().join(" ").replace(/\s+/g, " ");

/* ───────────── 1. PDF-Baustein ───────────── */

describe("PDF-Baustein", () => {
  test("Zwischenüberschrift steht nie allein unten auf einer Seite", () => {
    const d = new pdf.PdfDoc("Test");
    d.addPage();
    const flow = new pdf.Flow(d, 60);
    while (flow.y < flow.bottom - 40) flow.paragraph("Füllzeile");
    flow.heading("Neue Tabelle", { size: 10.5 });
    flow.table([{ header: "A", width: 100 }], [["Zeile 1"]]);
    const p = readPdf(d.build(new Date(NOW)));
    assert.equal(p.pages.length, 2);
    assert.ok(p.pages[1].includes("Neue Tabelle") && !p.pages[0].includes("Neue Tabelle"));
  });

  test("Gültiger Aufbau: Kopf, Objekte, Querverweise, A4, Schriften, Seitenzahl", () => {
    const d = new pdf.PdfDoc("Test – Übersicht");
    d.text(50, 50, "Hallo");
    d.addPage();
    d.text(50, 50, "Seite zwei");
    const p = readPdf(d.build(new Date(NOW)));
    assert.equal(p.pages.length, 2);
    assert.deepEqual(p.pages[1], ["Seite zwei"]);
    // Titel als UTF-16 (Umlaute/Gedankenstrich korrekt)
    assert.match(p.objects.get(5) ?? "", /\/Title <FEFF[0-9A-F]+>/i);
  });

  test("Deutsche Umlaute, ß, € und Anführungszeichen im WinAnsi-Zeichensatz; fremde Zeichen vereinfacht", () => {
    assert.equal(pdf.toWinAnsi("Müßig Öl Äpfel"), "Müßig Öl Äpfel");
    assert.equal(pdf.toWinAnsi("12,50 €").charCodeAt(6), 0x80);
    assert.equal(pdf.toWinAnsi("„Hallo“ – gut"), "\x84Hallo\x93 \x96 gut");
    assert.equal(pdf.toWinAnsi("Ayşe Yılmaz Łódź"), "Ayse Yilmaz Lódz");
    assert.equal(pdf.toWinAnsi("a\tb\nc\u0000d"), "a b cd");
    const d = new pdf.PdfDoc("x");
    d.text(10, 10, "Jürgen Müßig zahlt 5 € (Klammern) \\ Backslash");
    assert.deepEqual(readPdf(d.build()).pages[0], ["Jürgen Müßig zahlt 5 € (Klammern) \\ Backslash"]);
  });

  test("Zeilenumbruch: lange Wörter und Texte passen in die Breite", () => {
    const long = "Kiosk Ölmühle GmbH & Co. KG – Filiale Leipzig-Südvorstadt am Bayerischen Bahnhof Donaudampfschifffahrtsgesellschaftskapitänskajüte";
    const lines = pdf.wrapText(long, 200, 10);
    assert.ok(lines.length > 2);
    for (const l of lines) assert.ok(pdf.textWidth(l, 10) <= 200 + 0.01, l);
    assert.equal(lines.join(" ").replace(/\s+/g, ""), long.replace(/\s+/g, ""));
    assert.deepEqual(pdf.wrapText("", 100, 10), [""]);
  });

  test("Tabelle mit Seitenumbruch: Kopf auf jeder Seite, keine Zeile abgeschnitten, nichts unter dem Rand", () => {
    const d = new pdf.PdfDoc("Tabelle");
    d.addPage();
    const f = new pdf.Flow(d, 60);
    f.table(
      [
        { header: "Nr", width: 10 },
        { header: "Text", width: 90 },
      ],
      Array.from({ length: 120 }, (_, i) => [String(i + 1), `Zeile ${i + 1}`]),
    );
    const p = readPdf(d.build());
    assert.ok(p.pages.length >= 3);
    for (const page of p.pages) assert.equal(page[0], "Nr", "Tabellenkopf oben auf jeder Seite");
    const numbers = p.pages.flat().filter((t) => /^\d+$/.test(t)).map(Number);
    assert.deepEqual(numbers, Array.from({ length: 120 }, (_, i) => i + 1));
    for (const pos of p.positions.flat()) assert.ok(pos.y > pdf.mm(17), `Text zu tief: ${pos.y}`);
  });
});

/* ───────────── 2. Lieferscheine ───────────── */

describe("Lieferschein-PDF", () => {
  test("Einzelner B2C-Lieferschein: Pflichtfelder, Logo, keine Preise", async () => {
    const o = b2c();
    const logo = await logoImage();
    assert.ok(logo, "Logo wird aus den Original-Pfaden erzeugt");
    const p = readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00001") }], COMPANY, PRODUCTS, logo, NOW));
    const text = allText(p);
    assert.equal(p.images, 2, "Logo als Bild (Farbe + Deckkraft)");
    for (const t of ["Lieferschein", "LS-2026-00001", o.number, "20.10.2026", "Jürgen Müßig", "Lieferweg 2", "Hinterhaus", "01069 Dresden", "Pos.", "Artikelnummer", "Produkt", "Sorte", "Menge", "Einheit", "Classic", "24er Tray", "48 Dosen", "Privatkunde", COMPANY.name])
      assert.ok(text.includes(t), `fehlt: ${t}`);
    assert.ok(o.lines[0].sku && text.includes(o.lines[0].sku), "Artikelnummer gedruckt");
    // keine Preise, Beträge, Zahlungsdaten
    assert.doesNotMatch(text, /€|EUR|Preis|Summe|Betrag|Rabatt|Umsatz|bezahlt|Karte|Provision/i);
    assert.doesNotMatch(text, /\d+,\d{2}(?!\d)/, "keine Geldbeträge");
    assert.ok(text.includes("Seite 1 von 1"));
    assert.ok(!text.includes("Versanddatum"), "Versanddatum nur, wenn bekannt");
  });

  test("B2B-Lieferschein: Firma, Ansprechpartner, Lieferadresse, Kundenhinweis, Versanddatum wenn bekannt", () => {
    const o = model.fromDealer(
      dealerOrder({ status: "versendet", history: [{ status: "eingegangen", at: "2026-10-20T09:30:00.000Z" }, { status: "versendet", at: "2026-10-21T08:00:00.000Z" }], delivery: { company: "Kiosk Ölmühle GmbH", contact: "Herr Weber", street: "Industriestr. 5", zip: "04109", city: "Leipzig" } }),
      { ...(DEALER as object), contact: "Ayşe Yılmaz" } as never,
      PRODUCTS,
    );
    const text = allText(readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00002", "Palette oben leicht") }], COMPANY, PRODUCTS, null, NOW)));
    for (const t of ["Kiosk Ölmühle GmbH", "Herr Weber", "Industriestr. 5", "04109 Leipzig", "Händler", "H-2026-0007", "Versanddatum", "21.10.2026", "Bemerkung: Palette oben leicht", "Eigene Bestellnr.: PO-77", "Bitte vor 10 Uhr", "Tray (24 Dosen)"])
      assert.ok(text.includes(t), `fehlt: ${t}`);
    assert.doesNotMatch(text, /€|\d+,\d{2}(?!\d)/);
  });

  test("Mehrseitiger Lieferschein mit vielen Positionen: alle Positionen, Seiten „x von y“, Tabellenkopf wiederholt", () => {
    const o = b2c();
    o.lines = Array.from({ length: 70 }, (_, i) => ({ ...o.lines[0], product: `Produkt mit einem sehr langen Namen Nummer ${i + 1}`, quantity: i + 1 }));
    const p = readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00003") }], COMPANY, PRODUCTS, null, NOW));
    const n = p.pages.length;
    assert.ok(n >= 3, `Seiten: ${n}`);
    for (let i = 1; i <= n; i++) assert.ok(allText(p).includes(`Seite ${i} von ${n}`));
    for (const page of p.pages.slice(1)) assert.ok(page.includes("Artikelnummer"), "Kopf auf Folgeseite");
    for (let i = 1; i <= 70; i++) assert.ok(flatText(p).includes(`Produkt mit einem sehr langen Namen Nummer ${i}`), `Position ${i}`);
    for (const pos of p.positions.flat()) assert.ok(pos.y > pdf.mm(5) && pos.x >= 0 && pos.x < 595, "innerhalb der Seite");
  });

  test("Sammeldruck: ein PDF, je Bestellung ein eigener Lieferschein mit eigener Seitenzählung", () => {
    const list = [b2c({ id: "cs_test_S1" }), b2c({ id: "cs_test_S2" }), b2b()];
    const p = readPdf(docs.deliveryNotesPdf(list.map((o, i) => ({ order: o, note: noteInfo(`LS-2026-0000${i + 1}`) })), COMPANY, PRODUCTS, null, NOW));
    assert.equal(p.pages.length, 3);
    p.pages.forEach((page, i) => {
      assert.ok(page.includes(`LS-2026-0000${i + 1}`));
      assert.ok(page.join(" ").includes("Seite 1 von 1"));
      assert.ok(page.includes(list[i].number));
    });
  });

  test("Vorschau: „VORSCHAU“ statt Nummer", () => {
    const text = allText(readPdf(docs.deliveryNotesPdf([{ order: b2c(), note: noteInfo(null) }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("VORSCHAU"));
    assert.ok(text.includes("Vorschau – noch keine Lieferscheinnummer vergeben"));
    assert.doesNotMatch(text, /LS-\d{4}-/);
  });

  test("Fehlende optionale Kundendaten: nichts erfunden, Hinweise statt Fantasiewerte", () => {
    const o = b2c({ collected_information: null, customer_details: { name: "", email: "", address: null } });
    assert.equal(o.delivery, null);
    const issues = docs.deliveryNoteIssues(o);
    assert.ok(issues.includes("Lieferadresse fehlt"));
    const text = allText(readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00009") }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Lieferadresse fehlt"));
    assert.ok(!text.includes("Ansprechpartner"));
    const billingOnly = b2c({ collected_information: null });
    assert.ok(docs.deliveryNoteIssues(billingOnly).includes("Keine eigene Lieferadresse – Rechnungsadresse verwendet"));
    assert.deepEqual(docs.missingCompanyFields({ ...COMPANY, street: "[Straße]", city: "" }), ["Straße", "PLZ und Ort"]);
  });

  test("Lange Adressen und Produktnamen werden umbrochen (nichts läuft in die Angaben rechts)", () => {
    const o = b2b({ delivery: { company: "Kiosk Ölmühle GmbH & Co. KG – Filiale Leipzig-Südvorstadt am Bayerischen Bahnhof Nord", contact: "x", street: "Prinz-Friedrich-Leopold-von-Hohenzollern-Straße 123a", zip: "04109", city: "Leipzig" } });
    const p = readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00010") }], COMPANY, PRODUCTS, null, NOW));
    const page = p.pages[0];
    const idx = page.findIndex((t) => t.startsWith("Kiosk Ölmühle"));
    const pos = p.positions[0][idx];
    assert.ok(pos.x < 100);
    // Zeilen des Empfängerblocks enden vor den Angaben rechts (x ≈ 595 - 82 mm)
    for (let i = idx; i < idx + 3; i++) assert.ok(pdf.textWidth(page[i], 10.5, "bold") <= pdf.mm(85) + 1, page[i]);
    assert.ok(page.join(" ").includes("Leipzig-Südvorstadt"));
  });

  test("Mixpaket: Produkt bleibt eine Position, Inhalt laut Produktdaten wird genannt", () => {
    const o = b2c({ id: "cs_test_MIX1", metadata: { items: "mix-test:2" } }, [{ description: "Mix-Test", quantity: 2, amount_total: 7200, price: { unit_amount: 3600 } }] as never);
    const text = flatText(readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00011") }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Mix-Test"));
    assert.ok(text.includes("Mixpaket"));
    assert.ok(text.includes("Inhalt laut Produktdaten: 48 Classic, 48 Tropical"));
  });

  test("Summe trennt Dosen und Flaschen (Wasser wird nicht als Dosen gezählt)", () => {
    const o = b2b({}, { classic: 5, "wasser-still": 3 });
    const text = flatText(readPdf(docs.deliveryNotesPdf([{ order: o, note: noteInfo("LS-2026-00012") }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Inhalt gesamt: 120 Dosen, 36 Flaschen"), text);
    assert.deepEqual(shipping.orderUnits(o, PRODUCTS), { cans: 120, bottles: 36 });
  });
});

/* ───────────── 3. Lieferscheinnummern ───────────── */

describe("Lieferscheinnummern", () => {
  beforeEach(async () => {
    setKvBackend(memoryBackend(() => Date.now()));
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });
  const one = (prev: import("../lib/office/delivery-notes").StoredNote | null, o: OfficeOrder, num: string | null, by: string, action: "heruntergeladen" | "gedruckt", at: number, remark?: string) => notes.applyIssueOne(prev, o, num, by, action, at, PRODUCTS, remark);

  test("Eindeutig, je Jahr fortlaufend, unabhängig von Bestell- und Rechnungsnummern", async () => {
    const list = [b2c({ id: "cs_test_N1" }), b2c({ id: "cs_test_N2" }), b2b()];
    const book = await notes.issueNotes(list, "anna", "heruntergeladen", PRODUCTS, NOW);
    assert.deepEqual(
      list.map((o) => book.get(o.key)?.number),
      ["LS-2026-00001", "LS-2026-00002", "LS-2026-00003"],
    );
    assert.equal(book.get(list[2].key)?.order, "H-2026-0007");
    const next = await notes.issueNotes([b2c({ id: "cs_test_N4" })], "anna", "gedruckt", PRODUCTS, T("2027-01-01T08:00:00Z"));
    assert.equal(next.get("s:cs_test_N4")?.number, "LS-2027-00001");
    assert.equal(await seqOf("2026"), 3);
    assert.equal(notes.formatNoteNumber(2026, 123456), "LS-2026-123456", "über 99.999 Lieferscheine: Nummer wird nur länger, nie doppelt");
  });

  test("Erneuter Download: dieselbe Nummer und Version; geänderter Inhalt → gleiche Nummer, neue Version", () => {
    const o = b2c({ id: "cs_test_R1" });
    let n = one(null, o, "LS-2026-00001", "anna", "heruntergeladen", NOW);
    n = one(n, o, null, "ben", "gedruckt", NOW + 1000);
    assert.equal(n.number, "LS-2026-00001");
    assert.equal(n.version, 1);
    assert.deepEqual(
      n.events.map((e) => e.action),
      ["erstellt", "heruntergeladen", "gedruckt"],
    );
    n = one(n, o, null, "anna", "heruntergeladen", NOW + 2000, "Neue Bemerkung");
    assert.equal(n.number, "LS-2026-00001");
    assert.equal(n.version, 2);
    assert.equal(n.remark, "Neue Bemerkung");
    const changed = { ...o, lines: [{ ...o.lines[0], quantity: 5 }] };
    n = one(n, changed, null, "anna", "heruntergeladen", NOW + 3000);
    assert.equal(n.version, 3);
    assert.deepEqual(
      n.versions?.map((v) => v.version),
      [1, 2, 3],
      "jede Version mit Datenbasis gespeichert",
    );
    assert.throws(() => one(null, o, null, "anna", "heruntergeladen", NOW), /Keine Lieferscheinnummer/);
  });

  test("Historie bleibt begrenzt, „erstellt“ und erste Version bleiben erhalten", () => {
    const o = b2c({ id: "cs_test_H1" });
    let n = one(null, o, "LS-2026-00001", "anna", "heruntergeladen", NOW);
    for (let i = 0; i < 30; i++) n = one(n, o, null, "anna", "gedruckt", NOW + i);
    assert.ok(n.events.length <= 12);
    assert.equal(n.events[0].action, "erstellt");
    for (let i = 0; i < 40; i++) n = one(n, o, null, "anna", "gedruckt", NOW + 100 + i, `Bemerkung ${i}`);
    assert.ok((n.versions?.length ?? 0) <= notes.MAX_VERSIONS);
    assert.equal(n.versions?.[0].version, 1);
    assert.equal(n.version, 41);
  });

  test("Historische Lieferschein-Version lässt sich unverändert wieder erzeugen", () => {
    const o = b2c({ id: "cs_test_V1" });
    let n = one(null, o, "LS-2026-00009", "anna", "heruntergeladen", NOW, "Erste Fassung");
    const changed = { ...o, lines: [{ ...o.lines[0], quantity: 7 }] };
    n = one(n, changed, null, "ben", "gedruckt", NOW + 5000, "Zweite Fassung");
    const v1 = n.versions?.find((v) => v.version === 1);
    assert.ok(v1);
    const archived = notes.orderFromBasis(o.key, v1.basis);
    assert.equal(notes.noteFingerprint(archived, v1.basis.remark, PRODUCTS), v1.fp, "Archivkopie hat denselben Inhalt wie Version 1");
    const text = allText(readPdf(docs.deliveryNotesPdf([{ order: archived, note: { number: n.number, version: 1, createdAt: v1.at, remark: v1.basis.remark, archive: true } }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Archivkopie") && text.includes("Erste Fassung") && text.includes("LS-2026-00009"));
    assert.ok(!text.includes("Zweite Fassung"));
  });

  test("Parallele Erstellung: keine doppelte Nummer (Datei-Speicher)", async () => {
    const list = Array.from({ length: 25 }, (_, i) => b2c({ id: `cs_test_PAR${String(i).padStart(3, "0")}` }));
    const results = await Promise.all(list.map((o) => notes.issueNotes([o], "anna", "heruntergeladen", PRODUCTS, NOW)));
    const numbers = results.map((m, i) => m.get(list[i].key)?.number);
    assert.equal(new Set(numbers).size, 25);
    assert.equal(await seqOf("2026"), 25);
    // gleichzeitig dieselbe Bestellung → eine Nummer
    const same = await Promise.all(Array.from({ length: 5 }, () => notes.issueNotes([list[0]], "ben", "gedruckt", PRODUCTS, NOW)));
    assert.equal(new Set(same.map((m) => m.get(list[0].key)?.number)).size, 1);
    assert.equal(await seqOf("2026"), 25);
  });

  test("Großer Lieferschein-Bestand: je Bestellung ein eigener Eintrag, Lesen nur der benötigten", async () => {
    const list = Array.from({ length: 300 }, (_, i) => b2c({ id: `cs_test_BIG${String(i).padStart(4, "0")}` }));
    for (let i = 0; i < list.length; i += 100) await notes.issueNotes(list.slice(i, i + 100), "anna", "heruntergeladen", PRODUCTS, NOW);
    assert.equal(await seqOf("2026"), 300);
    const some = await notes.readNotesFor([list[0].key, list[299].key, "s:cs_test_gibtsnicht"]);
    assert.equal(some.get(list[0].key)?.number, "LS-2026-00001");
    assert.equal(some.get(list[299].key)?.number, "LS-2026-00300");
    assert.equal(some.size, 2);
    const raw = JSON.parse(await fs.readFile(path.join(dir, ".data", "store.json"), "utf8"));
    const biggest = Math.max(...Object.entries(raw).filter(([k]) => k.startsWith("tt:office-ls")).map(([, v]) => JSON.stringify(v).length));
    assert.ok(biggest < 20_000, `kein Einzeleintrag wächst mit der Gesamtzahl (größter: ${biggest} Zeichen)`);
  });

  test("Alte Lieferscheine aus Phase 3B bleiben gültig (Nummer, Zählerstand) – ohne Umzug der Daten", async () => {
    const o = b2c({ id: "cs_test_OLD1" });
    const legacyNote = one(null, o, "LS-2026-00007", "anna", "heruntergeladen", NOW);
    delete legacyNote.versions;
    await store.setJSON(store.KEYS.officeDeliveryNotes, { seq: { "2026": 7 }, notes: { [o.key]: legacyNote } });
    const read = await notes.readNotesFor([o.key]);
    assert.equal(read.get(o.key)?.number, "LS-2026-00007");
    const res = await notes.issueNotes([o, b2c({ id: "cs_test_NEW1" })], "ben", "gedruckt", PRODUCTS, NOW + 1000);
    assert.equal(res.get(o.key)?.number, "LS-2026-00007", "alte Nummer bleibt");
    assert.equal(res.get("s:cs_test_NEW1")?.number, "LS-2026-00008", "neue Nummern setzen nach dem alten Stand fort");
    const legacyAfter = await store.getJSON<{ seq: Record<string, number> }>(store.KEYS.officeDeliveryNotes, { seq: {} });
    assert.equal(legacyAfter.seq["2026"], 7, "altes Nummernbuch wird nur gelesen");
  });

  const redisUrl = process.env.REDIS_TEST_URL;
  const local = Boolean(redisUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(redisUrl));
  test("Parallele Erstellung gegen echte (lokale Test-)Redis: keine doppelte Nummer", { skip: !local ? "REDIS_TEST_URL (lokal) nicht gesetzt" : false }, async () => {
    process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = process.env.REDIS_TEST_TOKEN;
    const fresh = await import(`../lib/office/delivery-notes.ts?redis=${Date.now()}`);
    try {
      const list = Array.from({ length: 20 }, (_, i) => b2c({ id: `cs_test_RED${String(i).padStart(3, "0")}` }));
      const keys = [store.KEYS.officeDeliveryNotes, store.KEYS.officeNoteSeq, ...list.map((o) => notes.noteKey(o.key))];
      await fetch(redisUrl as string, { method: "POST", headers: { Authorization: `Bearer ${process.env.REDIS_TEST_TOKEN}` }, body: JSON.stringify(["DEL", ...keys, ...keys.map((k) => `tt:ver:${k}`)]) });
      const results = await Promise.all(list.map((o) => fresh.issueNotes([o], "anna", "heruntergeladen", PRODUCTS, NOW)));
      assert.equal(new Set(results.map((m: Map<string, { number: string }>, i: number) => m.get(list[i].key)?.number)).size, 20);
      // gleichzeitig dieselbe Bestellung → eine Nummer
      const same = await Promise.all(Array.from({ length: 6 }, () => fresh.issueNotes([list[3]], "ben", "gedruckt", PRODUCTS, NOW)));
      assert.equal(new Set(same.map((m: Map<string, { number: string }>) => m.get(list[3].key)?.number)).size, 1);
    } finally {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
});

/* ───────────── 4. Versandliste ───────────── */

describe("Versandliste", () => {
  const list = () => [
    b2c({ id: "cs_test_V1", created: sec("2026-10-20T08:00:00Z") }),
    b2c({ id: "cs_test_V2", created: sec("2026-10-20T09:00:00Z"), payment_status: "unpaid" }),
    b2c({ id: "cs_test_V3", created: sec("2026-10-20T10:00:00Z") }, LINES, "storniert"),
    b2b({}, { classic: 3, "wasser-still": 2 }),
    b2b({ id: "bbbbbbbbbbbbbbb2", number: "H-2026-0008", createdAt: "2026-10-03T09:30:00.000Z" }),
  ];

  test("Eine Zeile je Position mit Lieferadresse, Straße/Hausnummer getrennt, ohne Preise", () => {
    const r = shipping.shippingRows([list()[0], list()[3]], PRODUCTS);
    assert.equal(r.length, 1 + 2);
    assert.deepEqual([r[0].street, r[0].houseNo, r[0].extra, r[0].zip, r[0].city], ["Lieferweg", "2", "Hinterhaus", "01069", "Dresden"]);
    assert.equal(r[1].company, "Kiosk Ölmühle GmbH");
    assert.deepEqual([r[1].street, r[1].houseNo], ["Industriestr.", "5"]);
    assert.deepEqual(
      r.slice(1).map((x) => [x.product, x.quantity, x.contents]),
      [
        ["Classic", 3, "72 Dosen"],
        ["Aqua x Still", 2, "24 Flaschen"],
      ],
    );
    assert.ok(Object.keys(r[0]).every((k) => !/price|total|gross|net|vat|discount|refund/i.test(k)));
  });

  test("Hausnummern-Erkennung: nur am Ende, sonst nichts geraten", () => {
    assert.deepEqual(shipping.splitStreet("Hauptstraße 12a"), { street: "Hauptstraße", houseNo: "12a" });
    assert.deepEqual(shipping.splitStreet("Am Markt 3-5"), { street: "Am Markt", houseNo: "3-5" });
    assert.deepEqual(shipping.splitStreet("Straße des 17. Juni 110 B"), { street: "Straße des 17. Juni", houseNo: "110B" });
    assert.deepEqual(shipping.splitStreet("Postfach"), { street: "Postfach", houseNo: "" });
    assert.deepEqual(shipping.splitStreet(""), { street: "", houseNo: "" });
  });

  test("Versandbereit: ohne Stornos und unbezahlte Privatbestellungen, Händler auf Rechnung immer", () => {
    const l = list();
    const ready = filters.applyFilters(l, filters.parseFilters({ versandbereit: "1" }), PRODUCTS).map((o) => o.number);
    assert.deepEqual(ready, ["EX-EST_V1", "H-2026-0007", "H-2026-0008"]);
    assert.equal(filters.isShipReady(l[1]), false);
    assert.equal(filters.isShipReady(l[2]), false);
    assert.equal(filters.isShipReady(l[3]), true, "Händler unbezahlt (Rechnung) ist versandbereit");
    // ohne Haken: alles (ausdrückliche Entscheidung)
    assert.equal(filters.applyFilters(l, filters.parseFilters({}), PRODUCTS).length, 5);
    assert.deepEqual(
      filters.applyFilters(l, filters.parseFilters({ status: "nicht_versendet", typ: "haendler" }), PRODUCTS).map((o) => o.number),
      ["H-2026-0007", "H-2026-0008"],
    );
  });

  test("Filter B2B/B2C und Zeitraum Tag/Monat/individuell", () => {
    const l = list();
    const inRange = (r: { from: number; to: number }) => l.filter((o) => o.createdAt >= r.from && o.createdAt < r.to).map((o) => o.number);
    assert.equal(inRange(DAY).length, 4);
    assert.equal(inRange(time.monthRange(2026, 10)).length, 5);
    const custom = time.resolveRange({ preset: "zeitraum", from: "2026-10-01", to: "2026-10-05" }, NOW);
    assert.ok(custom.ok);
    assert.deepEqual(inRange(custom.range), ["H-2026-0008"]);
    assert.deepEqual(
      filters.applyFilters(l, filters.parseFilters({ typ: "privat", versandbereit: "1" }), PRODUCTS).map((o) => o.number),
      ["EX-EST_V1"],
    );
  });

  test("Excel und PDF nutzen dieselben Zeilen", () => {
    const l = filters.applyFilters(list(), filters.parseFilters({ versandbereit: "1" }), PRODUCTS);
    const sheet = exp.shippingSheet(l, PRODUCTS);
    const r = shipping.shippingRows(l, PRODUCTS);
    assert.equal(sheet.rows.length, r.length);
    const p = readPdf(docs.shippingListPdf(l, ctx("Versandliste", time.monthRange(2026, 10)), COMPANY, PRODUCTS, null));
    const text = allText(p);
    for (const o of l) assert.ok(text.includes(o.number));
    assert.ok(text.includes("Industriestr. 5"));
    assert.ok(text.includes("Aqua x Still"));
    assert.doesNotMatch(text, /€|\d+,\d{2}(?!\d)/, "keine Beträge");
    assert.match(p.objects.get(6) ?? "", /\/MediaBox \[0 0 841\.89 595\.28\]/, "Querformat");
  });
});

/* ───────────── 5. Artikel-Sammelliste ───────────── */

describe("Artikel-Sammelliste", () => {
  const list = () => [
    b2c({ id: "cs_test_C1" }),
    b2c({ id: "cs_test_C2" }, LINES, "storniert"),
    b2c({ id: "cs_test_CM", metadata: { items: "mix-test:1" } }, [{ description: "Mix-Test", quantity: 1, amount_total: 3600, price: { unit_amount: 3600 } }] as never),
    b2b({}, { classic: 120, "wasser-still": 3 }),
  ];

  test("Summen je Sorte wie im Excel-Export; Stornos zählen nicht; Mixpakete aufgeteilt", () => {
    const rep = docs.collectReport(list(), PRODUCTS);
    const classic = rep.bySort.find((x) => x.handle === "classic");
    assert.equal(classic?.units, 48 + 24 + 2880);
    assert.equal(classic?.trays, 2 + 1 + 120);
    assert.equal(rep.bySort.find((x) => x.handle === "tropical")?.units, 24);
    const sheet = exp.collectSheet(list(), PRODUCTS);
    const total = (sheet.rows.find((r) => !Array.isArray(r) && r.bold) as { cells: unknown[] }).cells[3];
    assert.equal(total, rep.totals.cans + rep.totals.bottles, "gleiche Summe wie Excel");
    assert.equal(rep.totals.cancelled, 1);
  });

  test("Verschiedene Verpackungseinheiten: Energy 24 Dosen je Tray, Wasser 12 Flaschen je Tray, 120 Trays = 2.880 Dosen", () => {
    const rep = docs.collectReport(list(), PRODUCTS);
    const water = rep.bySort.find((x) => x.handle === "wasser-still");
    assert.equal(water?.unitName, "Flaschen");
    assert.equal(water?.perTray, 12);
    assert.equal(water?.units, 36);
    assert.equal(rep.totals.bottles, 36);
    const classic = rep.bySort.find((x) => x.handle === "classic");
    assert.equal(classic?.perTray, 24);
    assert.ok(rep.byUnit.some((u) => u.unit === "24er Tray") && rep.byUnit.some((u) => u.unit.startsWith("Tray (12 Flaschen)")));
    assert.equal(rep.byProduct[0].product, "Classic");
  });

  test("Sorten-, Produkt- und Gruppenfilter zählen nur passende Sorten (auch aus Mixpaketen) – Excel gleich", () => {
    const f = filters.parseFilters({ sorte: "tropical" });
    const l = filters.applyFilters(list(), f, PRODUCTS);
    const rep = docs.collectReport(l, PRODUCTS, filters.lineFilter(f, PRODUCTS));
    assert.deepEqual(
      rep.bySort.map((x) => [x.handle, x.units]),
      [["tropical", 24]],
    );
    const sheet = exp.collectSheet(l, PRODUCTS, filters.lineFilter(f, PRODUCTS));
    assert.equal((sheet.rows[0] as unknown[])[3], 24);
    const g = filters.parseFilters({ gruppe: "mineralwasser" });
    const rg = docs.collectReport(filters.applyFilters(list(), g, PRODUCTS), PRODUCTS, filters.lineFilter(g, PRODUCTS));
    assert.deepEqual(
      rg.bySort.map((x) => x.handle),
      ["wasser-still"],
    );
  });

  test("PDF: Zeitraum, Filter, Gesamtmengen, Erstellungsdatum, keine Lagerspalten", () => {
    const text = allText(readPdf(docs.collectListPdf(list(), ctx("Artikel-Sammelliste"), COMPANY, PRODUCTS, null)));
    for (const t of ["Artikel-Sammelliste", "Zeitraum:", "Filter: Alle Kunden", "Erstellt am", "Dosen gesamt", "2.952", "Volle Trays gesamt", "Mengen je Sorte", "Mengen je Produkt und Verpackungseinheit", "Classic", "Aqua x Still"])
      assert.ok(text.includes(t), `fehlt: ${t}`);
    assert.doesNotMatch(text, /Lagerbestand|Wareneingang|Inventur|verfügbar/i);
  });
});

/* ───────────── 6. Tagesbericht ───────────── */

describe("Tagesbericht", () => {
  const list = () => [
    b2c({ id: "cs_test_T1", created: sec("2026-10-20T08:00:00Z") }),
    b2c({ id: "cs_test_T2", created: sec("2026-10-20T09:00:00Z"), payment_intent: { latest_charge: { amount_refunded: 1030 } } }),
    b2c({ id: "cs_test_T3", created: sec("2026-10-20T10:00:00Z") }, LINES, "storniert"),
    b2c({ id: "cs_test_T4", created: sec("2026-10-20T11:00:00Z"), payment_status: "unpaid" }),
    b2b(),
    b2b({ id: "cccccccccccccccc", number: "H-2026-0009", createdAt: "2026-10-19T09:30:00.000Z" }),
  ];

  test("Kennzahlen aus der Phase-3A-Berechnung: Umsatz, USt, Pfand, Rabatte, Stornos, Teilerstattung", () => {
    const l = list();
    const rep = docs.dailyReport(l, DAY, PRODUCTS, NOW);
    const k = kpis.computeKpis(l.filter((o) => o.createdAt >= DAY.from && o.createdAt < DAY.to), DAY, NOW);
    assert.equal(rep.counts.received, 5);
    assert.equal(rep.counts.private, 4);
    assert.equal(rep.counts.dealer, 1);
    assert.equal(rep.counts.cancelled, 1);
    assert.equal(rep.counts.refunded, 1);
    assert.equal(rep.counts.fullyRefunded, 0);
    assert.equal(rep.money.gross, k.money.gross);
    // Umsatz: T1 5030 + T2 (5030 − 1030) + Händler brutto; T3 storniert, T4 unbezahlt zählen nicht
    const dealer = l[4];
    assert.equal(rep.money.gross, 5030 + 4000 + dealer.gross);
    // USt anteilig gekürzt, nur Umsatz-Bestellungen
    const vat = (o: OfficeOrder) => Math.round(o.vat * ((o.gross - o.refunded) / o.gross));
    assert.equal(rep.money.vat, vat(l[0]) + vat(l[1]) + vat(dealer));
    // Pfand ungekürzt (1.200 je Privatbestellung), Rabatte inkl. Gutschein
    assert.equal(rep.money.deposit, 1200 * 3 + Math.round(dealer.deposit * 1.19));
    assert.equal(rep.money.discount, 360 * 3);
    assert.equal(rep.money.refunds, 1030);
  });

  test("PDF: Abschnitte, Berichtsdatum, Seitenzahlen, Umlaute und €", () => {
    const p = readPdf(docs.dailyReportPdf(list(), ctx("Tagesbericht"), COMPANY, PRODUCTS, null));
    const text = allText(p);
    for (const t of ["Tagesbericht", "Berichtsdatum", "Zusammenfassung", "Bestellkennzahlen", "Umsatzkennzahlen", "Umsatzsteuer", "Artikel-Sammelliste", "Stornierungen und Erstattungen", "Kunden-Verteilung", "Seite 1 von", "EX-EST_T3", "Händler"])
      assert.ok(text.includes(t), `fehlt: ${t}`);
    assert.match(text, /\d+,\d{2}\s€/, "Beträge mit €");
    assert.ok(!text.includes("H-2026-0009"), "Bestellung vom Vortag nicht enthalten");
  });
});

/* ───────────── 7. Rechte ───────────── */

describe("Rechte", () => {
  test("Administrator und Büromitarbeiter dürfen Dokumente erstellen, Lesezugriff nicht", () => {
    assert.equal(roles.can("admin", "office.documents"), true);
    assert.equal(roles.can("buero", "office.documents"), true);
    assert.equal(roles.can("lesen", "office.documents"), false);
    assert.equal(roles.can("lesen", "office.export"), false);
    assert.equal(roles.can("lesen", "office.view"), true);
    assert.equal(roles.can(undefined, "office.documents"), false);
  });

  test("Dokument-Endpunkt prüft Anmeldung und Recht vor allem anderen, nur POST, gleiche Herkunft, no-store", async () => {
    const code = await fs.readFile(path.join(ROOT, "app/api/admin/buero/dokument/route.ts"), "utf8");
    const post = code.slice(code.indexOf("export async function POST"));
    assert.ok(post.indexOf('assertOffice("office.documents")') < post.indexOf("request.formData()"), "Recht vor dem Lesen der Anfrage");
    assert.ok(post.indexOf("sameOrigin(request)") < post.indexOf("request.formData()"));
    assert.match(code, /no-store/);
    assert.match(code, /export function GET\(\) \{\n\s+return Response\.json\([^)]*status: 405/);
    for (const page of ["lieferscheine", "versandlisten", "sammellisten", "tagesberichte"]) {
      const src = await fs.readFile(path.join(ROOT, `app/admin/buero/${page}/page.tsx`), "utf8");
      assert.match(src, /await requireOffice\(\)/, page);
    }
  });

  test("Anfrage-Prüfung: unbekannte Art, fremde Schlüssel, zu viele, Vorschau nur für Lieferscheine", () => {
    assert.equal(service.parseDocRequest({ art: "rechnung" }, NOW).ok, false);
    assert.equal(service.parseDocRequest({ art: "lieferschein", auswahl: ["../../etc/passwd"] }, NOW).ok, false);
    assert.equal(service.parseDocRequest({ art: "lieferschein", auswahl: ["s:cs_test_A1"] }, NOW).ok, true);
    assert.equal(service.parseDocRequest({ art: "lieferschein" }, NOW).ok, false);
    const many = Array.from({ length: 101 }, (_, i) => `s:cs_test_X${String(i).padStart(4, "0")}`);
    assert.equal(service.parseDocRequest({ art: "lieferschein", auswahl: many, zeitraum: "monat" }, NOW).ok, false);
    assert.equal(service.parseDocRequest({ art: "lieferschein", auswahl: many.slice(0, 6) }, NOW).ok, false, "ohne Zeitraum höchstens 5");
    assert.equal(service.parseDocRequest({ art: "versandliste", modus: "vorschau" }, NOW).ok, false);
    assert.equal(service.parseDocRequest({ art: "tagesbericht", zeitraum: "monat" }, NOW).ok, false, "Tagesbericht nur für einen Tag");
    const ok = service.parseDocRequest({ art: "versandliste", zeitraum: "tag", tag: "2026-10-20", typ: "haendler", versandbereit: "1" }, NOW);
    assert.ok(ok.ok && ok.req.range?.from === DAY.from && ok.req.filters.channel === "haendler" && ok.req.filters.ready);
  });
});

/* ───────────── 8. Ablauf mit Speicher: Vorschau, Download, Ausfälle, keine Nebenwirkungen ───────────── */

describe("Dokument-Ablauf und Nebenwirkungen", () => {
  beforeEach(async () => {
    setKvBackend(memoryBackend(() => Date.now()));
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });

  const withInvoice = () =>
    dealerOrder({
      invoice: {
        number: "RE-2026-0001",
        date: "2026-10-20",
        serviceDate: "2026-10-20",
        dueDays: 14,
        lines: [{ text: "Classic", qty: 3, unit: "Tray", price: 960, deposit: 24 }],
        shippingNet: 0,
        shippingText: "",
        discountNet: 0,
        discountText: "",
        note: "",
        vatRate: 19,
        billTo: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig", vatId: "DE123456789" },
        seller: {} as never,
        released: true,
        paid: false,
        createdAt: "",
        updatedAt: "",
      },
    });

  test("Vorschau vergibt keine Nummer; Download vergibt sie; erneuter Druck behält sie; Protokoll ohne Kundendaten", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [withInvoice()]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    const parse = (p: Record<string, string | string[]>) => {
      const r = service.parseDocRequest(p, NOW);
      assert.ok(r.ok);
      return r.req;
    };
    const pv = await service.runDocument(parse({ art: "lieferschein", modus: "vorschau", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO, ORIGIN, NOW);
    assert.ok(pv.ok, JSON.stringify(pv));
    assert.equal(pv.inline, true);
    assert.ok(allText(readPdf(pv.file)).includes("VORSCHAU"));
    assert.equal(await seqOf("2026"), undefined, "Vorschau verbraucht keine Nummer");

    const dl = await service.runDocument(parse({ art: "lieferschein", modus: "download", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO, ORIGIN, NOW);
    assert.ok(dl.ok);
    assert.equal(dl.inline, false);
    assert.equal(dl.filename, "exstase-lieferschein-LS-2026-00001.pdf");
    const pr = await service.runDocument(parse({ art: "lieferschein", modus: "druck", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO, ORIGIN, NOW);
    assert.ok(pr.ok);
    assert.ok(allText(readPdf(pr.file)).includes("LS-2026-00001"));
    const pv2 = await service.runDocument(parse({ art: "lieferschein", modus: "vorschau", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO, ORIGIN, NOW);
    assert.ok(pv2.ok && allText(readPdf(pv2.file)).includes("LS-2026-00001"), "Vorschau zeigt vorhandene Nummer");
    const book = await notes.readNotesFor(["h:a1b2c3d4e5f60718"]);
    assert.equal(await seqOf("2026"), 1);
    assert.deepEqual(
      book.get("h:a1b2c3d4e5f60718")?.events.map((e) => e.action),
      ["erstellt", "heruntergeladen", "gedruckt"],
    );
    const events = await listSecurityEvents(10);
    const docEvents = events.filter((e) => e.type === "office_document");
    assert.equal(docEvents.length, 4);
    for (const e of docEvents) assert.doesNotMatch(e.detail ?? "", /Kiosk|Ölmühle|Yılmaz|Leipzig|einkauf@/);
  });

  test("Stornierte Bestellung bekommt keinen Lieferschein", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder({ status: "storniert" })]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    const req = service.parseDocRequest({ art: "lieferschein", auswahl: ["h:a1b2c3d4e5f60718"] }, NOW);
    assert.ok(req.ok);
    const r = await service.runDocument(req.req, WHO, ORIGIN, NOW);
    assert.equal(r.ok, false);
    assert.equal(await seqOf("2026"), undefined);
  });

  test("Sammeldruck über Zeitraum: nur Bestellungen aus Zeitraum und Filter, sonst Abbruch", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder(), dealerOrder({ id: "bbbbbbbbbbbbbbb2", number: "H-2026-0008", createdAt: "2026-09-03T09:30:00.000Z" })]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    const bad = service.parseDocRequest({ art: "lieferschein", zeitraum: "tag", tag: "2026-10-20", auswahl: ["h:a1b2c3d4e5f60718", "h:bbbbbbbbbbbbbbb2"] }, NOW);
    assert.ok(bad.ok);
    const r = await service.runDocument(bad.req, WHO, ORIGIN, NOW);
    assert.ok(!r.ok && r.status === 409);
    const good = service.parseDocRequest({ art: "lieferschein", zeitraum: "monat-wahl", monat: "2026-09", auswahl: ["h:bbbbbbbbbbbbbbb2"] }, NOW);
    assert.ok(good.ok);
    const g = await service.runDocument(good.req, WHO, ORIGIN, NOW);
    assert.ok(g.ok);
    assert.ok(allText(readPdf(g.file)).includes("H-2026-0008"));
  });

  test("Versandliste, Sammelliste und Tagesbericht über den Ablauf (Tag/Monat, Händlerfilter)", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder(), dealerOrder({ id: "bbbbbbbbbbbbbbb2", number: "H-2026-0008", createdAt: "2026-10-03T09:30:00.000Z" })]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    const run = async (p: Record<string, string>) => {
      const req = service.parseDocRequest(p, NOW);
      assert.ok(req.ok, JSON.stringify(p));
      const r = await service.runDocument(req.req, WHO, ORIGIN, NOW);
      assert.ok(r.ok);
      return allText(readPdf(r.file));
    };
    const day = await run({ art: "versandliste", zeitraum: "tag", tag: "2026-10-20" });
    assert.ok(day.includes("H-2026-0007") && !day.includes("H-2026-0008"));
    const month = await run({ art: "versandliste", zeitraum: "monat-wahl", monat: "2026-10", typ: "haendler" });
    assert.ok(month.includes("H-2026-0007") && month.includes("H-2026-0008"));
    const priv = await run({ art: "versandliste", zeitraum: "monat-wahl", monat: "2026-10", typ: "privat" });
    assert.ok(!priv.includes("H-2026-0007"));
    assert.ok((await run({ art: "sammelliste", zeitraum: "monat-wahl", monat: "2026-10" })).includes("Mengen je Sorte"));
    assert.ok((await run({ art: "tagesbericht", zeitraum: "tag", tag: "2026-10-20" })).includes("Bestellkennzahlen"));
  });

  test("Redis-/Speicher-Ausfall: kein Dokument, keine Nummer, verständliche Meldung", async () => {
    process.env.VERCEL = "1";
    try {
      const v = service.parseDocRequest({ art: "versandliste", zeitraum: "heute" }, NOW);
      assert.ok(v.ok);
      const r = await service.runDocument(v.req, WHO, ORIGIN, NOW);
      assert.ok(!r.ok && r.status === 503 && /Daten fehlen/.test(r.error));
      await assert.rejects(notes.issueNotes([b2c()], "anna", "heruntergeladen", PRODUCTS, NOW));
      await assert.rejects(notes.readNotesFor([b2c().key]));
    } finally {
      delete process.env.VERCEL;
    }
  });

  test("Keine Änderung an Bestellungen, Rechnungen, Produkten/Preisen; kein Lager, keine Übertragung nach außen", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [withInvoice()]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.orders, { cs_test_A1: { status: "offen" } });
    await store.setJSON(store.KEYS.products, { classic: { variants: { "v-1": { available: true } } } });
    const file = path.join(dir, ".data", "store.json");
    const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      throw new Error("kein Netz im Test");
    }) as typeof fetch;
    try {
      for (const p of [
        { art: "lieferschein", modus: "download", auswahl: ["h:a1b2c3d4e5f60718"] },
        { art: "lieferschein", modus: "druck", auswahl: ["h:a1b2c3d4e5f60718"], bemerkung: "Bitte Rampe 3" },
        { art: "versandliste", zeitraum: "heute" },
        { art: "sammelliste", zeitraum: "heute" },
        { art: "tagesbericht", zeitraum: "heute" },
      ]) {
        const req = service.parseDocRequest(p, NOW);
        assert.ok(req.ok);
        { const rr = await service.runDocument(req.req, WHO, ORIGIN, NOW); assert.ok(rr.ok, p.art + JSON.stringify(rr)); }
      }
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.deepEqual(calls, [], "keine Netzwerkaufrufe (keine Logistik-/Fremdsysteme, keine E-Mails)");
    const afterState = JSON.parse(await fs.readFile(file, "utf8"));
    const changed = Object.keys(afterState).filter((k) => JSON.stringify(afterState[k]) !== JSON.stringify(snapshot[k]));
    assert.deepEqual(
      changed.filter((k) => !k.startsWith("tt:ver:")).sort(),
      [store.KEYS.officeNoteSeq, notes.noteKey("h:a1b2c3d4e5f60718")].sort(),
      "geändert werden nur Lieferschein-Zähler und der Lieferschein dieser Bestellung",
    );
    assert.deepEqual(afterState[store.KEYS.dealerOrders], snapshot[store.KEYS.dealerOrders], "Bestellung und Rechnung unverändert (kein Versandstatus)");
    assert.deepEqual(afterState[store.KEYS.orders], snapshot[store.KEYS.orders]);
    assert.deepEqual(afterState[store.KEYS.products], snapshot[store.KEYS.products]);
  });

  test("Keine Lager- oder Logistik-Funktionen im neuen Code", async () => {
    for (const f of ["lib/office/pdf.ts", "lib/office/documents.ts", "lib/office/shipping.ts", "lib/office/delivery-notes.ts", "lib/office/documents-service.ts", "app/api/admin/buero/dokument/route.ts"]) {
      const code = await fs.readFile(path.join(ROOT, f), "utf8");
      assert.doesNotMatch(code, /\b(stock|inventory|setStock|reserve|dhl\.com|api\.dhl|sendcloud|shipcloud|sendMail|nodemailer)\b/i, f);
      assert.doesNotMatch(code, /\bfetch\(/, `${f}: keine Netzwerkaufrufe`);
      assert.doesNotMatch(code, /setOrderMeta|updateDealerOrder|setDealerOrderStatus|createInvoice/, `${f}: ändert keine Bestellungen/Rechnungen`);
    }
  });
});

/* ───────────── Master-Auftrag AP1: Absender auf Lieferscheinen festschreiben ───────────── */

describe("Lieferschein: Firmendaten zum Ausstellungszeitpunkt", () => {
  beforeEach(async () => {
    setKvBackend(memoryBackend(() => Date.now()));
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });
  const OLD = { ...COMPANY, name: "exstase Großhandel GmbH", owner: "Geschäftsführer: Herr Christopher Walich", phone: "+49 211 15 77 59 - 0" };

  test("Neue Lieferscheine speichern den Absender; Archivkopie druckt den damaligen, nicht den heutigen Absender", () => {
    const o = b2c({ id: "cs_test_S1" });
    const n = notes.applyIssueOne(null, o, "LS-2026-00050", "anna", "heruntergeladen", NOW, PRODUCTS, undefined, OLD);
    const v1 = n.versions?.[0];
    assert.equal(v1?.basis.seller?.owner, "Geschäftsführer: Herr Christopher Walich");
    const archived = notes.orderFromBasis(o.key, v1!.basis);
    const text = flatText(readPdf(docs.deliveryNotesPdf([{ order: archived, note: { number: n.number, version: 1, createdAt: v1!.at, remark: "", archive: true, seller: v1!.basis.seller } }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Herr Christopher Walich"), "damaliger Absender");
    assert.ok(!text.includes("Orhan Yilmaz"), "heutige Firmendaten werden nicht nachträglich eingesetzt");
  });

  test("Geänderte Firmendaten: gleiche Nummer, neue Version – die alte Fassung bleibt erhalten", () => {
    const o = b2c({ id: "cs_test_S2" });
    let n = notes.applyIssueOne(null, o, "LS-2026-00051", "anna", "heruntergeladen", NOW, PRODUCTS, undefined, OLD);
    n = notes.applyIssueOne(n, o, null, "anna", "heruntergeladen", NOW + 1000, PRODUCTS, undefined, OLD);
    assert.equal(n.version, 1, "unveränderter Absender → keine neue Version");
    n = notes.applyIssueOne(n, o, null, "anna", "gedruckt", NOW + 2000, PRODUCTS, undefined, COMPANY);
    assert.equal(n.number, "LS-2026-00051");
    assert.equal(n.version, 2);
    assert.equal(n.versions?.[0].basis.seller?.name, "exstase Großhandel GmbH");
    assert.equal(n.versions?.[1].basis.seller?.name, "Exstase Großhandel GmbH");
  });

  test("Lieferscheine ohne gespeicherten Absender (vor AP1) behalten ihren Fingerabdruck", () => {
    const o = b2c({ id: "cs_test_S3" });
    const legacy = notes.applyIssueOne(null, o, "LS-2026-00052", "anna", "heruntergeladen", NOW, PRODUCTS);
    assert.equal(legacy.versions?.[0].basis.seller, undefined);
    assert.equal(notes.noteFingerprint(o, "", PRODUCTS), legacy.fp, "alte Fingerabdrücke unverändert gültig");
  });

  test("Sammeldruck: jeder Lieferschein mit eigenem Absender im Fuß", () => {
    const a = b2c({ id: "cs_test_S4" });
    const b = b2c({ id: "cs_test_S5" });
    const text = allText(readPdf(docs.deliveryNotesPdf([{ order: a, note: { ...noteInfoOf("LS-2026-00060"), seller: OLD } }, { order: b, note: noteInfoOf("LS-2026-00061") }], COMPANY, PRODUCTS, null, NOW)));
    assert.ok(text.includes("Herr Christopher Walich"));
    assert.ok(text.includes("Christopher Walich, Orhan Yilmaz"));
  });
  const noteInfoOf = (number: string) => ({ number, version: 1, createdAt: new Date(NOW).toISOString(), remark: "" });
});
