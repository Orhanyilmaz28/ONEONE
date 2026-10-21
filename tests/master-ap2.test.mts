/**
 * Master-Auftrag AP2 (Phase 3C, Lückenschluss): Mixpaket-Zusammensetzung zum Kaufzeitpunkt.
 * Rein – ohne Netz, ohne Stripe, ohne Datenbank.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");
const snap = await import("../lib/mix-snapshot");
const model = await import("../lib/office/model");
const shipping = await import("../lib/office/shipping");
const wf = await import("../lib/office/workflow");
type Product = import("../lib/types").Product;
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8")).products as Product[];

const mixNow: Product = {
  handle: "mix-test",
  title: "Mix-Test",
  descriptionHtml: "",
  tags: [],
  collections: ["mixpakete"],
  images: [],
  options: [],
  variants: [{ id: "v-mix", title: "2 Trays", price: 3600, available: true, options: {}, cans: 48 }],
  createdAt: "2026-01-01",
  // heutige Zusammensetzung (nach einer späteren Änderung)
  contents: [
    ["classic", 1],
    ["kiwi-lemon", 1],
  ],
};
const PRODUCTS = new Map<string, Product>([...catalog, mixNow].map((p) => [p.handle, p]));

function session(meta: Record<string, string>) {
  return {
    id: "cs_test_MIX1",
    created: Math.floor(Date.parse("2026-10-20T08:00:00Z") / 1000),
    amount_total: 3600 + 1200 + 590,
    amount_subtotal: 3600 + 1200,
    payment_status: "paid",
    metadata: meta,
    customer_details: { name: "Test Kunde", email: "t@example.de", address: { line1: "Weg 1", postal_code: "47638", city: "Straelen", country: "DE" } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: 0, amount_tax: 0 },
  };
}
const LINES = [
  { description: "Mix-Test", quantity: 1, amount_total: 3600, amount_subtotal: 3600, amount_discount: 0, price: { unit_amount: 3600 } },
  { description: "Einwegpfand", quantity: 48, amount_total: 1200, amount_subtotal: 1200, amount_discount: 0, price: { unit_amount: 25 } },
];

describe("Mixpaket-Zusammensetzung zum Kaufzeitpunkt", () => {
  test("Kodieren und Lesen (ungültige Teile werden ignoriert, nichts geraten)", () => {
    const raw = snap.encodeMixSnapshot({ "mix-test": [["classic", 1], ["tropical", 1]] });
    assert.equal(raw, "mix-test=classic*1+tropical*1");
    assert.deepEqual([...snap.decodeMixSnapshot(raw)], [["mix-test", [["classic", 1], ["tropical", 1]]]]);
    assert.equal(snap.decodeMixSnapshot("mix-test=classic*0").size, 0);
    assert.equal(snap.decodeMixSnapshot("x=<script>*1").size, 0);
    assert.equal(snap.decodeMixSnapshot(undefined).size, 0);
    assert.equal(snap.encodeMixSnapshot({}), null);
    const huge = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`mix-${i}`, [["classic", 1], ["tropical", 1]] as [string, number][]]));
    assert.equal(snap.encodeMixSnapshot(huge), null, "über 500 Zeichen → lieber nichts speichern als abgeschnitten");
  });

  test("Bestellung mit gespeicherter Zusammensetzung zeigt den damaligen Inhalt, nicht die heutigen Produktdaten", () => {
    const o = model.fromStripe(session({ items: "mix-test:1", mix: "mix-test=classic*1+tropical*1" }), LINES, undefined, PRODUCTS, "EX-MIX1");
    assert.deepEqual(o.lines[0].mixSnapshot, [["classic", 1], ["tropical", 1]]);
    assert.equal(shipping.lineContents(o.lines[0], PRODUCTS), "24 Classic, 24 Tropical");
    const units = model.unitsBySort(o.lines[0], PRODUCTS)?.map((u) => u.handle);
    assert.deepEqual(units, ["classic", "tropical"]);
    const c = wf.releaseCheck(o, null, PRODUCTS);
    assert.ok(!c.warnings.some((w) => w.includes("Mixpaket-Inhalt")));
  });

  test("Ohne gespeicherte Zusammensetzung (alle bisherigen Bestellungen): Verhalten unverändert", () => {
    const o = model.fromStripe(session({ items: "mix-test:1" }), LINES, undefined, PRODUCTS, "EX-MIX1");
    assert.equal(o.lines[0].mixSnapshot, undefined);
    assert.equal(shipping.lineContents(o.lines[0], PRODUCTS), "24 Classic, 24 Kiwi Lemon".replace("Kiwi Lemon", model.unitsBySort(o.lines[0], PRODUCTS)?.[1].sort ?? ""));
  });

  test("Checkout ist unverändert (Schreiben der Zusammensetzung braucht Freigabe)", async () => {
    const code = await fs.readFile(path.join(ROOT, "app/api/checkout/route.ts"), "utf8");
    assert.doesNotMatch(code, /encodeMixSnapshot|mix-snapshot/);
  });
});
