/**
 * Phase 3A – Büroverwaltung: Zeiträume (Berliner Zeit, ISO-Wochen, Zeitumstellung), gemeinsames Bestellmodell,
 * Filter, Kennzahlen, Excel-Export (Inhalt und Dateiformat), Rollen/Anmeldung, Ausfälle.
 * Läuft ohne Netz, ohne Stripe und ohne echte Datenbank (Datei-Speicher in einem Temp-Ordner, Redis-Ersatz im Speicher).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { inflateRawSync } from "node:zlib";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO", "ADMIN_REQUIRE_2FA"]) delete process.env[k];
process.env.ADMIN_PASSWORD = "richtig-langes-passwort";
process.env.ADMIN_2FA_KEY = "test-schluessel-test-schluessel-test-schluessel-1234";
process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0000";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-office-"));
process.chdir(dir);

const time = await import("../lib/office/time");
const model = await import("../lib/office/model");
const filters = await import("../lib/office/filters");
const kpis = await import("../lib/office/kpis");
const xlsx = await import("../lib/office/xlsx");
const exp = await import("../lib/office/export");
const roles = await import("../lib/office/roles");
const users = await import("../lib/office/users");
const { resolvePrincipal } = await import("../lib/office/principal");
const { loadOfficeOrders } = await import("../lib/office/source");
const { memoryBackend, setKvBackend } = await import("../lib/kv");
const { setClock } = await import("../lib/admin-security/clock");
const sessions = await import("../lib/admin-security/sessions");
const flow = await import("../lib/admin-security/flow");
const twofa = await import("../lib/admin-security/two-factor");
const totpMod = await import("../lib/admin-security/totp");
const { listSecurityEvents } = await import("../lib/admin-security/audit");
const store = await import("../lib/store");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const catalogData = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "..", "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;
type DealerOrder = import("../lib/dealer-orders").DealerOrder;

after(() => fs.rm(dir, { recursive: true, force: true }));

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

const T = (iso: string) => Date.parse(iso);
const sec = (iso: string) => Math.floor(T(iso) / 1000);

function session(over: Partial<import("../lib/office/model").StripeSessionLike> = {}) {
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
  };
}
const LINES = [
  { description: "Classic", quantity: 2, amount_total: 3300, amount_subtotal: 3600, amount_discount: 300, price: { unit_amount: 1800 } },
  { description: "Einwegpfand", quantity: 48, amount_total: 1140, amount_subtotal: 1200, amount_discount: 60, price: { unit_amount: 25 } },
];

function b2c(over: Parameters<typeof session>[0] = {}, lines = LINES, status: import("../lib/orders").OrderStatus = "offen") {
  const s = session(over);
  return model.fromStripe(s, lines, { status }, PRODUCTS, `EX-${s.id.slice(-6).toUpperCase()}`);
}

const rows = [
  { handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
  { handle: "tropical", title: "Tropical", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
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
    history: [],
    calc,
    delivery: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
    reference: "PO-77",
    note: "Bitte vor 10 Uhr",
    ...over,
  };
}
const DEALER = { id: "d1", company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", email: "einkauf@kiosk.de", phone: "0341 123", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig", vatId: "DE123456789" } as never;

/* ───────────── XLSX lesen (für die Prüfung) ───────────── */

function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let eocd = buf.length - 22;
  while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const lnlen = buf.readUInt16LE(off + 26);
    const lelen = buf.readUInt16LE(off + 28);
    const data = inflateRawSync(buf.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize));
    assert.equal(xlsx.crc32(data), buf.readUInt32LE(p + 16), `CRC ${name}`);
    out.set(name, data.toString("utf8"));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

/** Zellen eines Blatts: ref → { t: Typ, s: Stil, v: Wert } */
function cells(xml: string) {
  const map = new Map<string, { t?: string; s?: string; v: string }>();
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?(?: t="(\w+)")?>(.*?)<\/c>/g)) {
    const inner = m[4];
    const v = m[3] === "inlineStr" ? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "") : (/<v>(.*?)<\/v>/.exec(inner)?.[1] ?? "");
    map.set(m[1], { s: m[2], t: m[3], v: v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') });
  }
  return map;
}
const headerIndex = (xml: string, header: string) => {
  const c = cells(xml);
  for (const [ref, cell] of c) if (/^[A-Z]+1$/.test(ref) && cell.v === header) return ref.replace("1", "");
  throw new Error(`Spalte ${header} fehlt`);
};

const CTX = (range = time.dayRange({ y: 2026, m: 10, d: 20 })) => ({ range, filters: ["Alle Kunden"], createdBy: "Administrator", now: T("2026-10-20T12:00:00Z"), siteUrl: "https://shop.example", products: PRODUCTS });

/* ───────────── 1. Zeiträume ───────────── */

describe("Zeiträume (Europe/Berlin)", () => {
  const NOW = T("2026-10-20T10:00:00Z"); // Dienstag

  test("Heute/Gestern beginnen um 00:00 Uhr deutscher Zeit (Sommerzeit = 22:00 UTC am Vortag)", () => {
    const r = time.resolveRange({ preset: "heute" }, NOW);
    assert.ok(r.ok);
    assert.equal(new Date(r.range.from).toISOString(), "2026-10-19T22:00:00.000Z");
    assert.equal(new Date(r.range.to).toISOString(), "2026-10-20T22:00:00.000Z");
    const g = time.resolveRange({ preset: "gestern" }, NOW);
    assert.ok(g.ok);
    assert.equal(new Date(g.range.from).toISOString(), "2026-10-18T22:00:00.000Z");
  });

  test("Zeitumstellung: 29.03.2026 hat 23 Stunden, 25.10.2026 hat 25 Stunden", () => {
    const spring = time.dayRange({ y: 2026, m: 3, d: 29 });
    assert.equal((spring.to - spring.from) / 3_600_000, 23);
    assert.equal(new Date(spring.from).toISOString(), "2026-03-28T23:00:00.000Z");
    const autumn = time.dayRange({ y: 2026, m: 10, d: 25 });
    assert.equal((autumn.to - autumn.from) / 3_600_000, 25);
    assert.equal(new Date(autumn.to).toISOString(), "2026-10-25T23:00:00.000Z");
  });

  test("Bestellung um 23:30 Uhr deutscher Zeit zählt zu diesem Tag, nicht zum UTC-Tag", () => {
    const at = T("2026-10-25T22:30:00Z"); // 23:30 MEZ am 25.10.
    const d25 = time.dayRange({ y: 2026, m: 10, d: 25 });
    assert.ok(at >= d25.from && at < d25.to);
    assert.equal(time.berlinDayKey(at), "2026-10-25");
    assert.equal(time.berlinDayKey(T("2026-10-25T23:00:00Z")), "2026-10-26");
  });

  test("ISO-Wochen: Montag–Sonntag, Jahreswechsel und 53-Wochen-Jahr", () => {
    assert.deepEqual(time.isoWeek({ y: 2026, m: 10, d: 20 }), { year: 2026, week: 43 });
    assert.deepEqual(time.isoWeek({ y: 2024, m: 12, d: 30 }), { year: 2025, week: 1 });
    assert.deepEqual(time.isoWeek({ y: 2027, m: 1, d: 1 }), { year: 2026, week: 53 });
    assert.equal(time.isoWeeksInYear(2026), 53);
    assert.equal(time.isoWeeksInYear(2025), 52);
    const w = time.resolveRange({ preset: "woche" }, NOW);
    assert.ok(w.ok);
    assert.equal(new Date(w.range.from).toISOString(), "2026-10-18T22:00:00.000Z"); // Mo 19.10. 00:00
    // Woche mit Zeitumstellung (KW 43: 19.–25.10.) ist 7 Tage + 1 Stunde lang
    assert.equal((w.range.to - w.range.from) / 3_600_000, 7 * 24 + 1);
    const lw = time.resolveRange({ preset: "letzte-woche" }, NOW);
    assert.ok(lw.ok);
    assert.equal(new Date(lw.range.from).toISOString(), "2026-10-11T22:00:00.000Z");
  });

  test("Monat, Jahr, bestimmter Tag/KW/Monat/Jahr, individueller Zeitraum", () => {
    const m = time.resolveRange({ preset: "monat" }, NOW);
    assert.ok(m.ok);
    assert.equal(new Date(m.range.from).toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(new Date(m.range.to).toISOString(), "2026-10-31T23:00:00.000Z");
    const lm = time.resolveRange({ preset: "letzter-monat" }, T("2026-01-10T10:00:00Z"));
    assert.ok(lm.ok && lm.range.label === "Dezember 2025");
    const y = time.resolveRange({ preset: "jahr" }, NOW);
    assert.ok(y.ok);
    assert.equal(new Date(y.range.from).toISOString(), "2025-12-31T23:00:00.000Z");
    const ly = time.resolveRange({ preset: "letztes-jahr" }, NOW);
    assert.ok(ly.ok && ly.range.label === "Jahr 2025");
    const kw = time.resolveRange({ preset: "kw", week: "2026-W01" }, NOW);
    assert.ok(kw.ok);
    assert.equal(new Date(kw.range.from).toISOString(), "2025-12-28T23:00:00.000Z"); // Mo 29.12.2025
    assert.ok(time.resolveRange({ preset: "monat-wahl", month: "2026-02" }, NOW).ok);
    assert.ok(time.resolveRange({ preset: "jahr-wahl", year: "2025" }, NOW).ok);
    const c = time.resolveRange({ preset: "zeitraum", from: "2026-10-01", to: "2026-10-03" }, NOW);
    assert.ok(c.ok);
    assert.equal(c.range.to - c.range.from, 3 * 86_400_000);
  });

  test("Ungültige Angaben ergeben eine Fehlermeldung statt eines falschen Zeitraums", () => {
    for (const bad of [
      { preset: "tag", day: "2026-02-30" },
      { preset: "kw", week: "2025-W53" },
      { preset: "monat-wahl", month: "2026-13" },
      { preset: "jahr-wahl", year: "1999" },
      { preset: "zeitraum", from: "2026-10-05", to: "2026-10-01" },
      { preset: "zeitraum", from: "2020-01-01", to: "2026-01-01" },
    ]) {
      assert.equal(time.resolveRange(bad, NOW).ok, false, JSON.stringify(bad));
    }
  });
});

/* ───────────── 2. Bestellmodell ───────────── */

describe("Gemeinsames Bestellmodell", () => {
  test("Privatbestellung: Adressen, Mengen, Verpackungseinheit, Pfand, Rabatt, Versand, USt", () => {
    const o = b2c();
    assert.equal(o.channel, "privat");
    assert.equal(o.key, "s:cs_test_A1");
    assert.equal(o.customerName, "Jürgen Müßig");
    assert.deepEqual(o.billing, { name: "Jürgen Müßig", company: "", line1: "Hauptstraße 1", line2: "", zip: "01067", city: "Dresden", country: "DE" });
    assert.equal(o.delivery?.line2, "Hinterhaus");
    assert.equal(o.lines.length, 1);
    const l = o.lines[0];
    assert.equal(l.handle, "classic");
    assert.equal(l.quantity, 2);
    assert.equal(l.unit, "24er Tray");
    assert.equal(l.unitsPerPack, 24);
    assert.equal(l.unitPrice, 1800);
    assert.equal(o.deposit, 1200);
    assert.equal(o.depositUnits, 48);
    assert.equal(model.expectedDeposit(48), o.deposit);
    assert.equal(o.goods, 3600);
    assert.equal(o.discount, 360);
    assert.equal(o.shipping, 590);
    assert.equal(o.gross, 5030);
    assert.equal(o.vatSource, "berechnet");
    assert.equal(o.vat, Math.round(5030 - 5030 / 1.19));
    assert.equal(o.net + o.vat, o.gross);
    assert.equal(o.paymentMethod, "Karte");
    assert.equal(o.paymentStatus, "bezahlt");
  });

  test("USt aus Stripe Tax wird übernommen, wenn vorhanden", () => {
    const o = b2c({ total_details: { amount_discount: 0, amount_tax: 803 } });
    assert.equal(o.vat, 803);
    assert.equal(o.vatSource, "stripe");
  });

  test("Teil- und Vollerstattung", () => {
    const part = b2c({ payment_intent: { latest_charge: { amount_refunded: 1000, refunded: false, payment_method_details: { type: "paypal" } } } });
    assert.equal(part.paymentStatus, "teilweise_erstattet");
    assert.equal(part.refunded, 1000);
    assert.equal(part.paymentMethod, "PayPal");
    const full = b2c({ payment_intent: { latest_charge: { amount_refunded: 5030, refunded: true } } });
    assert.equal(full.paymentStatus, "erstattet");
  });

  test("Fehlende Kundendaten bleiben leer – nichts wird erfunden", () => {
    const o = model.fromStripe({ id: "cs_test_LEER", created: sec("2026-10-20T08:00:00Z"), payment_status: "paid" }, [], undefined, PRODUCTS, "EX-LEER");
    assert.equal(o.customerName, "");
    assert.equal(o.email, "");
    assert.equal(o.phone, "");
    assert.equal(o.billing, null);
    assert.equal(o.delivery, null);
    assert.equal(o.depositUnits, null);
    assert.equal(o.gross, 0);
    assert.ok(o.warnings.some((w) => w.includes("Artikelpositionen")));
  });

  test("Unbekannte Verpackungseinheit wird gekennzeichnet statt geraten", () => {
    const o = b2c({ metadata: {} }, [{ description: "Altes Produkt", quantity: 1, amount_total: 999, price: { unit_amount: 999 } }]);
    assert.equal(o.lines[0].unit, "");
    assert.equal(o.lines[0].unitsPerPack, null);
    assert.equal(o.lines[0].sku, "");
    assert.ok(o.warnings.some((w) => w.includes("Verpackungseinheit")));
  });

  test("Händlerbestellung: Firma, Ansprechpartner, Rechnungs-/Lieferadresse, netto, Pfand, Versand, USt", () => {
    const d = dealerOrder();
    const o = model.fromDealer(d, DEALER, PRODUCTS);
    assert.equal(o.channel, "haendler");
    assert.equal(o.company, "Kiosk Ölmühle GmbH");
    assert.equal(o.contact, "Ayşe Yılmaz");
    assert.equal(o.billing?.line1, "Rechnungsweg 1");
    assert.equal(o.delivery?.line1, "Industriestr. 5");
    assert.equal(o.vatId, "DE123456789");
    assert.equal(o.priceBasis, "netto");
    assert.equal(o.lines.length, 2);
    assert.equal(o.lines[0].quantity, 3);
    assert.equal(o.lines[0].unitsPerPack, 24);
    assert.equal(o.lines[0].unitPrice, 960); // 0,40 € × 24
    assert.equal(o.deposit, 5 * 24 * 25);
    assert.equal(o.shipping, 1000); // 11,90 brutto → 10,00 netto
    assert.equal(o.net, d.calc.net);
    assert.equal(o.vat, d.calc.vat);
    assert.equal(o.gross, d.calc.gross);
    assert.equal(o.paymentMethod, "Rechnung");
    assert.equal(o.paymentStatus, "offen");
    assert.match(o.customerNote, /PO-77/);
    assert.match(o.customerNote, /vor 10 Uhr/);
  });

  test("Händlerbestellung mit Rechnung: Beträge und Zahlstatus laut Rechnung", () => {
    const d = dealerOrder({
      status: "bestätigt",
      invoice: {
        number: "RE-2026-0003",
        date: "2026-10-20",
        serviceDate: "2026-10-20",
        dueDays: 14,
        lines: [{ text: "Classic", qty: 3, unit: "Tray", price: 960, deposit: 24 }],
        shippingNet: 0,
        shippingText: "",
        discountNet: 100,
        discountText: "Treue",
        note: "",
        vatRate: 19,
        billTo: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig", vatId: "DE123456789" },
        seller: {} as never,
        released: true,
        paid: true,
        createdAt: "",
        updatedAt: "",
      },
    });
    const o = model.fromDealer(d, DEALER, PRODUCTS);
    assert.equal(o.invoiceNumber, "RE-2026-0003");
    assert.equal(o.paymentStatus, "bezahlt");
    assert.equal(o.processing, "in_bearbeitung");
    assert.equal(o.discount, 100);
    assert.equal(o.net, 2880 + 1800 - 100);
    assert.equal(o.vatSource, "rechnung");
  });

  test("Palette: Versand nach Absprache wird nicht als 0 € ausgegeben", () => {
    const d = dealerOrder({}, { classic: 100, tropical: 20 });
    const o = model.fromDealer(d, DEALER, PRODUCTS);
    assert.equal(o.shipping, null);
    assert.ok(o.warnings.some((w) => w.includes("nach Absprache")));
  });

  test("Tray-Umrechnung: 1 Tray = 24 Dosen, 1 Palette = 120 Trays = 2.880 Dosen", () => {
    const info = model.packInfo("classic");
    assert.deepEqual(info, { perTray: 24, traysPerPallet: 120, unitName: "Dosen" });
    assert.deepEqual(model.splitUnits(2880, info), { trays: 120, rest: 0, pallets: 1 });
    assert.deepEqual(model.splitUnits(50, info), { trays: 2, rest: 2, pallets: 50 / 2880 });
    const water = model.packInfo("wasser-still");
    assert.equal(water.perTray, 12);
    assert.equal(water.unitName, "Flaschen");
  });

  test("Mixpaket wird für die Sammelliste in Sorten zerlegt", () => {
    const line = { sku: "", handle: "mix-test", product: "Mix-Test", sort: "Mix-Test", quantity: 3, unit: "2 Trays", unitsPerPack: 48, unitPrice: 3600, discount: 0, total: 10800 };
    assert.deepEqual(model.unitsBySort(line, PRODUCTS), [
      { handle: "classic", sort: "Classic", units: 72 },
      { handle: "tropical", sort: "Tropical", units: 72 },
    ]);
  });

  test("Eindeutige Links: Schlüssel ↔ URL", () => {
    const o = b2c();
    assert.equal(model.officeUrl(o), "/admin/buero/bestellungen/s-cs_test_A1");
    assert.equal(model.slugToKey("s-cs_test_A1"), "s:cs_test_A1");
    assert.equal(model.slugToKey("h-a1b2c3d4e5f60718"), "h:a1b2c3d4e5f60718");
    assert.equal(model.slugToKey("x-../../etc"), null);
    assert.equal(model.originalUrl(o), "/admin/bestellungen/cs_test_A1");
    // Händlerbestellungen haben keine eigene Detailseite: Sprung zum Eintrag in der Händler-Bestellliste
    assert.equal(model.originalUrl({ key: "h:a1b2c3d4e5f60718" }), "/admin/haendler/bestellungen#a1b2c3d4e5f60718");
  });
});

/* ───────────── 3. Filter und Kennzahlen ───────────── */

function sample(): OfficeOrder[] {
  return [
    b2c({ id: "cs_test_P1", created: sec("2026-10-20T08:00:00Z") }),
    b2c({ id: "cs_test_P2", created: sec("2026-10-19T08:00:00Z"), payment_intent: { latest_charge: { amount_refunded: 1030 } } }, LINES, "versendet"),
    b2c({ id: "cs_test_P3", created: sec("2026-10-05T08:00:00Z") }, LINES, "storniert"),
    b2c({ id: "cs_test_P4", created: sec("2026-10-20T09:00:00Z"), payment_status: "unpaid" }),
    model.fromDealer(dealerOrder({ id: "aaaaaaaaaaaaaaa1", number: "H-2026-0001", createdAt: "2026-10-20T06:00:00.000Z", status: "bestätigt" }), DEALER, PRODUCTS),
    model.fromDealer(dealerOrder({ id: "aaaaaaaaaaaaaaa2", number: "H-2026-0002", createdAt: "2026-09-10T06:00:00.000Z" }, { tropical: 4 }), DEALER, PRODUCTS),
  ];
}

describe("Filter", () => {
  const F = (p: Record<string, string>) => filters.applyFilters(sample(), filters.parseFilters(p), PRODUCTS).map((o) => o.number);

  test("Nur Privat / nur Händler / alle", () => {
    assert.equal(F({}).length, 6);
    assert.equal(F({ typ: "privat" }).length, 4);
    assert.deepEqual(F({ typ: "haendler" }), ["H-2026-0001", "H-2026-0002"]);
  });

  test("Zahlung, Status und Kombinationen", () => {
    assert.deepEqual(F({ zahlung: "unbezahlt", typ: "privat" }), ["EX-EST_P4"]);
    assert.ok(F({ zahlung: "bezahlt" }).includes("EX-EST_P2"));
    assert.deepEqual(F({ status: "storniert" }), ["EX-EST_P3"]);
    assert.deepEqual(F({ status: "versendet" }), ["EX-EST_P2"]);
    assert.deepEqual(F({ status: "in_bearbeitung" }), ["H-2026-0001"]);
    assert.deepEqual(F({ status: "freigegeben" }), []);
    assert.deepEqual(F({ typ: "haendler", zahlung: "unbezahlt", status: "offen" }), ["H-2026-0002"]);
    assert.deepEqual(F({ zahlung: "erstattet" }), ["EX-EST_P2"]);
    assert.equal(F({ status: "nicht_storniert" }).length, 5);
  });

  test("Kunde, Produkt, Sorte, Suche (ohne Umlaut-Probleme)", () => {
    assert.equal(F({ kunde: "olmuhle" }).length, 2);
    assert.equal(F({ kunde: "jürgen" }).length, 4);
    assert.deepEqual(F({ produkt: "tropical" }), ["H-2026-0001", "H-2026-0002"]);
    assert.deepEqual(F({ sorte: "tropical", typ: "haendler" }), ["H-2026-0001", "H-2026-0002"]);
    assert.deepEqual(F({ q: "H-2026-0002" }), ["H-2026-0002"]);
    assert.deepEqual(F({ q: "h20260002" }), ["H-2026-0002"]);
    assert.equal(F({ q: "04109" }).length, 2);
    assert.equal(F({ produkt: "../../x" }).length, 6, "ungültiges Kürzel wird ignoriert");
  });

  test("Protokoll-Zusammenfassung enthält keine Kundennamen", () => {
    const s = filters.filterSummaryForLog(filters.parseFilters({ kunde: "Jürgen Müßig", q: "jm@example.de", typ: "privat" }));
    assert.doesNotMatch(s, /Jürgen|example/);
    assert.match(s, /Kundenfilter/);
  });
});

describe("Kennzahlen", () => {
  const NOW = T("2026-10-20T10:00:00Z");
  const month = time.monthRange(2026, 10);

  test("Umsatz ohne Stornos, abzüglich Erstattungen; Privat erst nach Zahlung", () => {
    const k = kpis.computeKpis(sample(), month, NOW);
    const d1 = model.fromDealer(dealerOrder({ status: "bestätigt" }), DEALER, PRODUCTS);
    // P1 (5030) + P2 (5030 − 1030) + H-0001; P3 storniert, P4 unbezahlt, H-0002 im September
    assert.equal(k.money.gross, 5030 + 4000 + d1.gross);
    assert.equal(k.revenue.month.gross, k.money.gross);
    assert.equal(k.revenue.month.orders, 3);
    assert.equal(k.money.refunds, 1030);
    assert.equal(k.counts.cancelled, 1);
    assert.equal(k.counts.unpaid, 2); // P4 (Zahlung ausstehend) + H-0001 (Rechnung noch nicht bezahlt)
    assert.equal(k.counts.dealer, 1);
    assert.equal(k.counts.private, 4);
    assert.equal(k.counts.inProgress, 1);
    assert.equal(k.counts.shipped, 1);
    assert.equal(k.counts.released, null);
    assert.equal(k.cancelledNotRefunded, 1);
  });

  test("Tag, Woche, Monat, Jahr", () => {
    const k = kpis.computeKpis(sample(), month, NOW);
    assert.equal(k.counts.today, 3); // P1, P4, H-0001 (06:00 UTC = 08:00 Uhr)
    assert.equal(k.counts.week, 4); // + P2 (Montag)
    assert.equal(k.counts.month, 5);
    assert.equal(k.revenue.year.orders, 4); // + H-0002 im September
  });

  test("Rabatt, Versand und Pfand: Händlerwerte netto → brutto", () => {
    const d = model.fromDealer(dealerOrder(), DEALER, PRODUCTS);
    const k = kpis.computeKpis([b2c(), d], month, NOW);
    assert.equal(k.money.discount, 360);
    assert.equal(k.money.shipping, 590 + Math.round(1000 * 1.19));
    assert.equal(k.money.deposit, 1200 + Math.round(3000 * 1.19));
  });
});

/* ───────────── 4. Excel ───────────── */

describe("Excel-Export", () => {
  const orders = sample();

  test("Vollständiger Büroexport: 5 Blätter, Kopfzeile fixiert, Autofilter, Spaltenbreiten, Formate", () => {
    const sheets = exp.buildSheets("voll", orders, CTX(time.monthRange(2026, 10)));
    assert.deepEqual(
      sheets.map((s) => s.name),
      ["Bestellungen", "Artikelpositionen", "Versandliste", "Artikel-Sammelliste", "Zusammenfassung"],
    );
    const files = unzip(xlsx.buildXlsx(sheets, { created: new Date(CTX().now) }));
    assert.ok(files.has("[Content_Types].xml") && files.has("xl/workbook.xml") && files.has("xl/styles.xml"));
    const wb = files.get("xl/workbook.xml") ?? "";
    for (const n of ["Bestellungen", "Artikelpositionen", "Versandliste", "Artikel-Sammelliste", "Zusammenfassung"]) assert.match(wb, new RegExp(`name="${n}"`));
    const s1 = files.get("xl/worksheets/sheet1.xml") ?? "";
    assert.match(s1, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
    assert.match(s1, /<autoFilter ref="A1:[A-Z]+7"\/>/);
    assert.match(s1, /<col min="1" max="1" width="\d+" customWidth="1"\/>/);
    assert.match(files.get("xl/styles.xml") ?? "", /#,##0.00\\ &quot;€&quot;/);
  });

  test("Zahlen als Zahlen, Beträge in Euro, Datum als Excel-Datum, PLZ/Bestellnummer als Text, Umlaute", () => {
    const files = unzip(xlsx.buildXlsx(exp.buildSheets("voll", orders, CTX())));
    const xml = files.get("xl/worksheets/sheet1.xml") ?? "";
    const c = cells(xml);
    const row = (col: string) => c.get(`${headerIndex(xml, col)}2`);
    assert.equal(row("Bestellnummer")?.t, "inlineStr");
    assert.equal(row("Bestellnummer")?.v, "EX-EST_P1");
    const zip = c.get(`${headerIndex(xml, "Rechnung PLZ")}2`);
    assert.equal(zip?.t, "inlineStr");
    assert.equal(zip?.v, "01067");
    assert.equal(row("Gesamtbetrag brutto")?.t, undefined);
    assert.equal(row("Gesamtbetrag brutto")?.v, "50.3");
    assert.equal(row("Gesamtbetrag brutto")?.s, "4");
    const date = Number(row("Datum/Uhrzeit")?.v);
    // 20.10.2026 10:00 Uhr deutscher Zeit (08:00 UTC)
    assert.ok(Math.abs(date - (46315 + 10 / 24)) < 1e-6, String(date));
    assert.equal(row("Kundenname")?.v, "Jürgen Müßig");
    assert.equal(row("Positionen")?.v, "1");
  });

  test("Alle passenden Bestellungen werden exportiert (nicht nur eine Seite)", () => {
    const many = Array.from({ length: 237 }, (_, i) => b2c({ id: `cs_test_M${String(i).padStart(4, "0")}`, created: sec("2026-10-20T08:00:00Z") - i * 60 }));
    const files = unzip(xlsx.buildXlsx(exp.buildSheets("einfach", many, CTX())));
    const rowsCount = (files.get("xl/worksheets/sheet1.xml") ?? "").match(/<row /g)?.length;
    assert.equal(rowsCount, 238);
  });

  test("Versandliste ohne Preise und interne Daten", () => {
    const sheet = exp.shippingSheet(orders, PRODUCTS);
    const headers = sheet.columns.map((c) => c.header).join("|");
    assert.doesNotMatch(headers, /Preis|Betrag|Rabatt|Provision|Netto|USt|Intern|Einkauf|Umsatz/);
    assert.ok(sheet.columns.every((c) => c.type !== "money"));
    // Phase 3B: eine Zeile je Artikelposition, Straße und Hausnummer getrennt
    const col = (h: string) => sheet.columns.findIndex((c) => c.header === h);
    const first = sheet.rows[0] as unknown[];
    assert.equal(first[col("Straße")], "Lieferweg");
    assert.equal(first[col("Hausnummer")], "2");
    assert.equal(first[col("Adresszusatz")], "Hinterhaus");
    assert.equal(first[col("Menge")], 2);
    assert.equal(first[col("Verpackungseinheit")], "24er Tray");
    assert.equal(first[col("Inhalt (Dosen/Flaschen)")], "48 Dosen");
    assert.equal(sheet.rows.length, orders.reduce((n, o) => n + Math.max(1, o.lines.length), 0));
  });

  test("Artikel-Sammelliste: Dosen, Trays, Paletten – ohne Stornos, Mixpakete zerlegt", () => {
    const list = [...orders, b2c({ id: "cs_test_MIX", metadata: { items: "mix-test:1" } }, [{ description: "Mix-Test", quantity: 1, amount_total: 3600, price: { unit_amount: 3600 } }])];
    const { rows: r } = exp.collectUnits(list, PRODUCTS);
    const classic = r.find((x) => x.handle === "classic");
    const tropical = r.find((x) => x.handle === "tropical");
    // classic: P1, P2, P4 je 48 (P3 storniert) + H-0001 72 + Mix 24
    assert.equal(classic?.units, 48 * 3 + 72 + 24);
    assert.equal(classic?.haendler, 72);
    // tropical: H-0001 48 + H-0002 96 + Mix 24
    assert.equal(tropical?.units, 48 + 96 + 24);
    const sheet = exp.collectSheet([model.fromDealer(dealerOrder({}, { classic: 120 }), DEALER, PRODUCTS)], PRODUCTS);
    const row = sheet.rows[0] as unknown[];
    assert.deepEqual(row.slice(1, 9), ["Classic", "Dosen", 2880, 24, 120, 0, 120, 1]);
  });

  test("Tagesbericht: ein Tag je Zeile plus Summe", () => {
    const s = exp.dailySheet(orders, time.resolveRange({ preset: "zeitraum", from: "2026-10-19", to: "2026-10-20" }, Date.now()).ok ? time.dayRange({ y: 2026, m: 10, d: 19 }) : time.dayRange({ y: 2026, m: 10, d: 19 }));
    assert.equal(s.rows.length, 2);
    const twoDays = exp.dailySheet(orders, { from: time.dayRange({ y: 2026, m: 10, d: 19 }).from, to: time.dayRange({ y: 2026, m: 10, d: 20 }).to, label: "" });
    assert.equal(twoDays.rows.length, 3);
    const last = twoDays.rows[2] as { cells: unknown[]; bold: boolean };
    assert.equal(last.bold, true);
    assert.equal(last.cells[0], "Gesamt");
  });

  test("Schutz vor Formel-Injection", () => {
    const evil = b2c({ customer_details: { name: '=HYPERLINK("http://boese.example","Klick")', email: "@SUM(A1)", phone: "+49 151 1", address: { line1: "-2+3", postal_code: "\t=1", city: "\r=1" } } });
    const files = unzip(xlsx.buildXlsx(exp.buildSheets("voll", [evil], CTX())));
    const xml = files.get("xl/worksheets/sheet1.xml") ?? "";
    assert.doesNotMatch(xml, /<f>/, "nie eine Formel");
    const c = cells(xml);
    const name = c.get(`${headerIndex(xml, "Kundenname")}2`);
    assert.equal(name?.t, "inlineStr");
    assert.ok(name?.v.startsWith("'="), name?.v);
    assert.equal(name?.s, "2", "Textkennzeichen (quotePrefix)");
    const mail = c.get(`${headerIndex(xml, "E-Mail")}2`);
    assert.ok(mail?.v.startsWith("'@"));
    const phone = c.get(`${headerIndex(xml, "Telefon")}2`);
    assert.equal(phone?.v, "+49 151 1", "Telefonnummer bleibt lesbar");
    assert.equal(phone?.s, "13");
    const street = c.get(`${headerIndex(xml, "Rechnung Straße")}2`);
    assert.equal(street?.s, "2");
    assert.match(files.get("xl/styles.xml") ?? "", /quotePrefix="1"/);
    assert.equal(xlsx.guardText("\u0000Kontroll\u0007zeichen").text, "Kontrollzeichen");
  });

  test("Sehr lange Texte werden an der Excel-Grenze sicher gekürzt, Blattnamen gültig", () => {
    assert.equal(xlsx.guardText("x".repeat(40_000)).text.length, xlsx.MAX_CELL);
    const used = new Set<string>();
    assert.equal(xlsx.safeSheetName("Bestellungen: [Test]/?*", used), "Bestellungen   Test");
    assert.equal(xlsx.safeSheetName("Bestellungen   Test", used), "Bestellungen   Test 2");
  });

  test("Große Datenmengen: 10.000 Bestellungen in vertretbarer Zeit und Größe", () => {
    const big = Array.from({ length: 10_000 }, (_, i) => b2c({ id: `cs_test_B${String(i).padStart(6, "0")}`, created: sec("2026-10-20T08:00:00Z") - i * 30 }));
    const t0 = performance.now();
    const file = xlsx.buildXlsx(exp.buildSheets("voll", big, CTX(time.monthRange(2026, 10))));
    const ms = performance.now() - t0;
    assert.ok(ms < 20_000, `${Math.round(ms)} ms`);
    assert.ok(file.length < 15 * 1024 * 1024, `${file.length} Bytes`);
    const files = unzip(file);
    assert.equal((files.get("xl/worksheets/sheet1.xml") ?? "").match(/<row /g)?.length, 10_001);
  });

  test("Dateiname nur ASCII, mit Datum in deutscher Zeit", () => {
    assert.equal(exp.exportFilename("voll", T("2026-10-20T22:30:00Z")), "exstase-voll-2026-10-21-0030.xlsx");
  });
});

/* ───────────── 5. Rollen, Anmeldung, Berechtigungen ───────────── */

let t = T("2026-10-20T10:00:00Z");
const O = { ip: "203.0.113.9", ua: "Test" };

describe("Rollen und Büro-Zugänge", () => {
  beforeEach(async () => {
    t = T("2026-10-20T10:00:00Z");
    setClock(() => t);
    setKvBackend(memoryBackend(() => t));
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });

  test("Berechtigungen je Rolle", () => {
    assert.ok(roles.can("admin", "office.users"));
    assert.ok(roles.can("buero", "office.export"));
    assert.ok(!roles.can("buero", "office.users"));
    assert.ok(roles.can("lesen", "office.view"));
    assert.ok(!roles.can("lesen", "office.export"), "Lesezugriff darf nicht exportieren");
    assert.ok(!roles.can(null, "office.view"));
  });

  test("Zugang anlegen: Regeln für Benutzername, Passwort und Rolle", async () => {
    await assert.rejects(users.createUser({ username: "a", name: "A", role: "buero", password: "x".repeat(12) }), users.OfficeUserError);
    await assert.rejects(users.createUser({ username: "anna", name: "Anna", role: "admin", password: "x".repeat(12) }), users.OfficeUserError);
    await assert.rejects(users.createUser({ username: "anna", name: "Anna", role: "buero", password: "kurz" }), users.OfficeUserError);
    await assert.rejects(users.createUser({ username: "anna", name: "Anna", role: "buero", password: process.env.ADMIN_PASSWORD ?? "" }), users.OfficeUserError);
    const u = await users.createUser({ username: "Anna.Buero", name: "Anna", role: "buero", password: "sicheres-passwort-1" });
    assert.equal(u.username, "anna.buero");
    assert.match(u.passwordHash, /^scrypt\$/);
    assert.ok(!JSON.stringify(u).includes("sicheres-passwort-1"));
    await assert.rejects(users.createUser({ username: "anna.buero", name: "Doppelt", role: "lesen", password: "sicheres-passwort-2" }), users.OfficeUserError);
  });

  test("Anmeldung Büro-Zugang: Passwort → 2FA-Einrichtung (Pflicht) → volle Sitzung mit Rolle", async () => {
    const u = await users.createUser({ username: "anna", name: "Anna", role: "buero", password: "sicheres-passwort-1" });
    const bad = await flow.passwordStep("falsch-falsch-falsch", O, "anna");
    assert.deepEqual(bad, { ok: false, error: "invalid" });
    const unknown = await flow.passwordStep("sicheres-passwort-1", O, "niemand");
    assert.deepEqual(unknown, { ok: false, error: "invalid" });
    const r = await flow.passwordStep("sicheres-passwort-1", O, "anna");
    assert.ok(r.ok && r.next === "setup");
    const pending = await sessions.readSession(r.ok ? r.token : "");
    assert.equal(pending?.stage, "setup");
    assert.equal(await resolvePrincipal(pending), null, "ohne 2FA kein Zugriff");
    const { secret } = await twofa.startSetup(pending?.id ?? "", "Büro-Zugang");
    const done = await flow.finishSetupStep(pending as never, totpMod.totp(secret, t), O);
    assert.ok(done.ok);
    assert.equal(done.ok && done.recoveryCodes.length, 10);
    assert.equal(await twofa.twoFactorEnabled(), false, "Administrator-2FA bleibt unberührt");
    const full = await sessions.readSession(done.ok ? done.token : "");
    const p = await resolvePrincipal(full);
    assert.deepEqual(p, { role: "buero", name: "Anna", userId: u.id, username: "anna" });

    // nächste Anmeldung: zweiter Faktor nötig, Code nur einmal gültig
    t += 60_000;
    const again = await flow.passwordStep("sicheres-passwort-1", O, "anna");
    assert.ok(again.ok && again.next === "2fa");
    const code = totpMod.totp(secret, t);
    const ok2 = await flow.secondFactorStep(again.ok ? again.token : "", code, "totp", O);
    assert.ok(ok2.ok);
    const replay = await flow.passwordStep("sicheres-passwort-1", O, "anna");
    const reused = await flow.secondFactorStep(replay.ok ? replay.token : "", code, "totp", O);
    assert.deepEqual(reused, { ok: false, error: "invalid" });
    // Wiederherstellungscode genau einmal
    const rc = done.ok ? done.recoveryCodes[0] : "";
    const viaCode = await flow.secondFactorStep(replay.ok ? replay.token : "", rc, "recovery", O);
    assert.ok(viaCode.ok);
    const replay2 = await flow.passwordStep("sicheres-passwort-1", O, "anna");
    assert.deepEqual(await flow.secondFactorStep(replay2.ok ? replay2.token : "", rc, "recovery", O), { ok: false, error: "invalid" });
    const events = await listSecurityEvents(50);
    assert.ok(events.some((e) => e.type === "login_success" && e.detail?.includes("Büro anna")));
    assert.ok(!JSON.stringify(events).includes("sicheres-passwort"));
  });

  test("Sperren, Rollenwechsel oder Löschen beendet laufende Sitzungen sofort", async () => {
    const u = await users.createUser({ username: "ben", name: "Ben", role: "lesen", password: "sicheres-passwort-1" });
    const { token } = await sessions.createSession("full", { ...O, userId: u.id, uv: u.version });
    assert.equal((await resolvePrincipal(await sessions.readSession(token)))?.role, "lesen");
    await users.updateUser(u.id, { role: "buero" });
    assert.equal(await resolvePrincipal(await sessions.readSession(token)), null);
    assert.equal(await sessions.readSession(token), null, "Sitzung gelöscht");
    const u2 = await users.getUser(u.id);
    const s2 = await sessions.createSession("full", { ...O, userId: u.id, uv: u2?.version });
    await users.updateUser(u.id, { active: false });
    assert.equal(await resolvePrincipal(await sessions.readSession(s2.token)), null);
    assert.equal(await users.verifyLogin("ben", "sicheres-passwort-1"), null, "gesperrt");
    const u3 = await users.updateUser(u.id, { active: true });
    const s3 = await sessions.createSession("full", { ...O, userId: u.id, uv: u3.version });
    await users.deleteUser(u.id);
    assert.equal(await resolvePrincipal(await sessions.readSession(s3.token)), null);
  });

  test("Administrator-Sitzung bleibt Administrator; Büro-Sitzungen hängen nicht am Administrator-Passwort", async () => {
    const { token } = await sessions.createSession("full", O);
    assert.equal((await resolvePrincipal(await sessions.readSession(token)))?.role, "admin");
    const u = await users.createUser({ username: "cara", name: "Cara", role: "buero", password: "sicheres-passwort-1" });
    const staff = await sessions.createSession("full", { ...O, userId: u.id, uv: u.version });
    assert.equal(staff.session.pw, undefined);
    const old = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "ganz-neues-admin-passwort";
    assert.equal(await sessions.readSession(token), null, "Admin-Sitzung endet bei neuem Admin-Passwort");
    assert.ok(await sessions.readSession(staff.token), "Büro-Sitzung bleibt");
    process.env.ADMIN_PASSWORD = old;
  });

  test("Datenspeicher nicht erreichbar → Büro-Zugang gilt als nicht angemeldet (fail closed)", async () => {
    const u = await users.createUser({ username: "dora", name: "Dora", role: "buero", password: "sicheres-passwort-1" });
    const { token } = await sessions.createSession("full", { ...O, userId: u.id, uv: u.version });
    const s = await sessions.readSession(token);
    process.env.VERCEL = "1"; // ohne Redis auf Vercel: kein Speicher
    try {
      assert.equal(await resolvePrincipal(s), null);
    } finally {
      delete process.env.VERCEL;
    }
  });

  test("Begrenzung je Benutzername", async () => {
    await users.createUser({ username: "emil", name: "Emil", role: "buero", password: "sicheres-passwort-1" });
    for (let i = 0; i < 10; i++) await flow.passwordStep("falsch-falsch-falsch", { ip: `198.51.100.${i}`, ua: "x" }, "emil");
    const r = await flow.passwordStep("sicheres-passwort-1", { ip: "198.51.100.200", ua: "x" }, "emil");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error, "rate_limited");
  });
});

/* ───────────── 6. Laden, Ausfälle, keine Nebenwirkungen ───────────── */

describe("Datenquelle und Nebenwirkungen", () => {
  beforeEach(async () => {
    setKvBackend(memoryBackend(() => Date.now()));
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });

  test("Händlerbestellungen werden aus dem Speicher geladen und nach Zeitraum gefiltert", async () => {
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder(), dealerOrder({ id: "bbbbbbbbbbbbbbbb", number: "H-2026-0099", createdAt: "2026-08-01T10:00:00.000Z" })]);
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.officeExported, { "h:a1b2c3d4e5f60718": { first: "2026-10-20T11:00:00.000Z", last: "2026-10-20T11:00:00.000Z", count: 1 } });
    const r = time.monthRange(2026, 10);
    const loaded = await loadOfficeOrders(r.from, r.to, PRODUCTS);
    assert.equal(loaded.complete, true);
    assert.equal(loaded.source, "none");
    assert.deepEqual(
      loaded.orders.map((o) => o.number),
      ["H-2026-0007"],
    );
    assert.equal(loaded.orders[0].exportedAt, "2026-10-20T11:00:00.000Z");
  });

  test("Redis-Ausfall: Ergebnis ist als unvollständig markiert, keine stille leere Liste", async () => {
    process.env.VERCEL = "1";
    try {
      const r = time.monthRange(2026, 10);
      const loaded = await loadOfficeOrders(r.from, r.to, PRODUCTS);
      assert.equal(loaded.complete, false);
      assert.ok(loaded.errors.some((e) => e.includes("Redis")));
    } finally {
      delete process.env.VERCEL;
    }
  });

  test("Kein Lagerbestand, keine Änderung an Bestellungen, keine Übertragung nach außen", async () => {
    const before = [dealerOrder()];
    await store.setJSON(store.KEYS.dealerOrders, before);
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
      const r = time.monthRange(2026, 10);
      const loaded = await loadOfficeOrders(r.from, r.to, PRODUCTS);
      const sheets = exp.buildSheets("voll", loaded.orders, CTX(r));
      xlsx.buildXlsx(sheets);
      const { markExported } = await import("../lib/office/service");
      await markExported(
        loaded.orders.map((o) => o.key),
        "2026-10-20T12:00:00.000Z",
      );
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.deepEqual(calls, [], "keine Netzwerkaufrufe (keine Logistik-/Fremdsysteme)");
    const after = JSON.parse(await fs.readFile(file, "utf8"));
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(snapshot[k]));
    // geändert werden darf nur der Export-Vermerk (und dessen Versionszähler)
    assert.deepEqual(changed.filter((k) => !k.startsWith("tt:ver:")), [store.KEYS.officeExported]);
    assert.deepEqual(after[store.KEYS.dealerOrders], snapshot[store.KEYS.dealerOrders]);
    assert.deepEqual(after[store.KEYS.products], snapshot[store.KEYS.products]);
    assert.equal(after[store.KEYS.officeExported]["h:a1b2c3d4e5f60718"].count, 1);
  });

  test("Keine Lager- oder Logistik-Funktionen im Büro-Code", async () => {
    const files = ["lib/office/model.ts", "lib/office/source.ts", "lib/office/service.ts", "lib/office/export.ts"];
    for (const f of files) {
      const code = await fs.readFile(path.join(import.meta.dirname, "..", f), "utf8");
      assert.doesNotMatch(code, /\b(stock|inventory|lagerbestand\s*=|setStock|dhl\.com|api\.dhl|sendcloud|shipcloud)\b/i, f);
      assert.doesNotMatch(code, /\bfetch\(/, `${f}: keine direkten Netzwerkaufrufe`);
    }
  });
});
