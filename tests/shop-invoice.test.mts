/**
 * Eigene Rechnung für Privatbestellungen: MwSt. je Position und Satz, Pflichtangaben, fortlaufende Nummer,
 * festgeschriebene Fassung, Sperren (storniert, unbezahlt, Beträge passen nicht, Firmendaten fehlen).
 * Ohne Netz und ohne echte Datenbank (Redis-Ersatz im Speicher).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-re-"));
process.chdir(dir);
after(() => fs.rm(dir, { recursive: true, force: true }));

const { memoryBackend, setKvBackend } = await import("../lib/kv");
setKvBackend(memoryBackend(() => Date.now()));
const inv = await import("../lib/office/invoices");
const docs = await import("../lib/office/documents");
const tax = await import("../lib/cart-tax");

type OfficeOrder = import("../lib/office/model").OfficeOrder;
type Product = import("../lib/types").Product;

const NOW = Date.parse("2026-10-22T10:00:00Z");
const SELLER = { name: "Exstase Großhandel GmbH", brand: "EXSTASE", owner: "GF: Christopher Walich, Orhan Yilmaz", street: "Carl-Kühne-Str. 4", city: "47638 Straelen", country: "Deutschland", email: "hello@exstase.com", phone: "0211 157 759-0", vatId: "DE311899184", register: "AG Düsseldorf HRB 90042" };
const product = (handle: string, productType: string): Product => ({ handle, title: handle, productType, descriptionHtml: "", tags: [], collections: [], images: [], options: [], variants: [{ id: `v-${handle}`, title: "24er Tray", price: 2190, available: true, options: {}, cans: 24 }], createdAt: "2026-01-01" });
const PRODUCTS = new Map([["classic", product("classic", "Energy Drink")], ["ice-coffee-latte", product("ice-coffee-latte", "Ice Coffee")]]);

function order(over: Partial<OfficeOrder> = {}): OfficeOrder {
  return {
    key: "s:cs_test_RE0001",
    channel: "privat",
    number: "EX-RE0001",
    createdAt: NOW - 86_400_000,
    customerName: "Max Muster",
    company: "",
    contact: "",
    email: "max@example.com",
    phone: "",
    vatId: "",
    billing: { name: "Max Muster", company: "", line1: "Hauptstr. 1", line2: "", zip: "40210", city: "Düsseldorf", country: "DE" },
    delivery: null,
    lines: [{ sku: "D31031", handle: "classic", product: "Classic", sort: "Classic", quantity: 1, unit: "24er Tray", unitsPerPack: 24, unitPrice: 1800, discount: 0, total: 1800 }],
    priceBasis: "brutto",
    goods: 1800,
    discount: 0,
    deposit: 600,
    depositUnits: 24,
    shipping: 590,
    net: 2513,
    vat: 477,
    vatSource: "berechnet",
    gross: 2990,
    refunded: 0,
    paymentMethod: "Karte",
    paymentStatus: "bezahlt",
    processing: "offen",
    shippingStatus: "nicht_versendet",
    tracking: "",
    carrier: "",
    customerNote: "",
    internalNote: "",
    invoiceNumber: "",
    warnings: [],
    ...over,
  };
}

describe("Eigene Rechnung (Privatbestellung)", () => {
  test("Beispiel der Analyse: 18,00 + 6,00 Pfand + 5,90 Versand = 29,90 €, davon 4,77 € MwSt.", () => {
    const b = inv.invoiceBasis(order(), PRODUCTS, SELLER);
    assert.equal(b.gross, 2990);
    assert.equal(b.vat, 477);
    assert.deepEqual(b.byRate, [{ rate: 19, gross: 2990, net: 2513, vat: 477 }]);
    assert.deepEqual(b.positions.map((p) => [p.text, p.quantity, p.unitGross, p.rate, p.gross]), [
      ["Classic", 1, 1800, 19, 1800],
      ["Einwegpfand", 24, 25, 19, 600],
      ["Versand", 1, 590, 19, 590],
    ]);
    assert.deepEqual(b.recipient, ["Max Muster", "Hauptstr. 1", "40210 Düsseldorf"]);
  });

  test("Satz je Produkt: Pfand und Versand folgen dem Satz der Ware (für den Fall Eiskaffee 7 %)", () => {
    tax.VAT_BY_PRODUCT_TYPE["Ice Coffee"] = 7;
    try {
      const o = order({
        lines: [
          { sku: "", handle: "classic", product: "Classic", sort: "Classic", quantity: 1, unit: "24er Tray", unitsPerPack: 24, unitPrice: 2190, discount: 0, total: 2190 },
          { sku: "", handle: "ice-coffee-latte", product: "Ice Coffee Latte", sort: "Latte", quantity: 1, unit: "24er Tray", unitsPerPack: 24, unitPrice: 2190, discount: 0, total: 2190 },
        ],
        deposit: 1200,
        shipping: 590,
        gross: 2190 * 2 + 1200 + 590,
      });
      const b = inv.invoiceBasis(o, PRODUCTS, SELLER);
      assert.equal(b.gross, o.gross);
      assert.deepEqual(b.byRate.map((r) => r.rate), [19, 7]);
      assert.equal(b.byRate.reduce((n, r) => n + r.net + r.vat, 0), o.gross);
      assert.ok(b.positions.some((p) => p.text === "Einwegpfand" && p.rate === 7));
    } finally {
      delete tax.VAT_BY_PRODUCT_TYPE["Ice Coffee"];
    }
  });

  test("Sperren: storniert, unbezahlt, Beträge passen nicht, Händler, Firmendaten fehlen", () => {
    assert.deepEqual(inv.invoiceBlockers(order(), SELLER), []);
    assert.ok(inv.invoiceBlockers(order({ processing: "storniert" }), SELLER).length);
    assert.ok(inv.invoiceBlockers(order({ paymentStatus: "offen" }), SELLER).length);
    assert.ok(inv.invoiceBlockers(order({ gross: 3000 }), SELLER).some((x) => x.includes("passen nicht")));
    assert.ok(inv.invoiceBlockers(order({ channel: "haendler" }), SELLER).length);
    assert.ok(inv.invoiceBlockers(order(), { ...SELLER, vatId: "" }).some((x) => x.includes("USt-IdNr.")));
    assert.ok(inv.invoiceBlockers(order(), { ...SELLER, vatId: "[USt-IdNr.]", street: "[Straße]" }).some((x) => x.includes("USt-IdNr.") && x.includes("Straße")));
  });

  test("Nummer fortlaufend, Fassung festgeschrieben, PDF wird erzeugt", async () => {
    const a = await inv.issueInvoice(order(), PRODUCTS, SELLER, "Admin", "heruntergeladen", NOW);
    assert.equal(a.number, "RE-2026-00001");
    // erneuter Abruf nach Änderung an der Bestellung: dieselbe Nummer, dieselbe Fassung
    const again = await inv.issueInvoice(order({ customerName: "Geändert" }), PRODUCTS, SELLER, "Büro", "gedruckt", NOW + 1000);
    assert.equal(again.number, "RE-2026-00001");
    assert.deepEqual(again.basis, a.basis);
    assert.deepEqual(again.events.map((e) => e.action), ["erstellt", "heruntergeladen", "gedruckt"]);
    const b = await inv.issueInvoice(order({ key: "s:cs_test_RE0002", number: "EX-RE0002" }), PRODUCTS, SELLER, "Admin", "heruntergeladen", NOW);
    assert.equal(b.number, "RE-2026-00002");
    const file = docs.invoicePdf(a, null, NOW);
    assert.equal(file.subarray(0, 5).toString(), "%PDF-");
    const preview = docs.invoicePdf({ number: null, createdAt: new Date(NOW).toISOString(), basis: a.basis }, null, NOW);
    assert.ok(preview.length > 500);
  });
});

test("„per E-Mail“ wird erst nach dem Versand vermerkt", async () => {
  const o = order({ key: "s:cs_test_RE0003", number: "EX-RE0003" });
  const a = await inv.issueInvoice(o, PRODUCTS, SELLER, "Shop (automatisch)", null, NOW);
  assert.deepEqual(a.events.map((e) => e.action), ["erstellt"]);
  await inv.noteInvoiceEvent(o.key, "per E-Mail", "Shop (automatisch)", NOW + 1);
  const b = await inv.readInvoice(o.key);
  assert.deepEqual(b?.events.map((e) => e.action), ["erstellt", "per E-Mail"]);
  assert.equal(b?.number, a.number);
});
