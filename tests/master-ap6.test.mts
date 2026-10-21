/**
 * AP6 – Sonderprüfung Stripe, Gutscheine, Einwegpfand. 11 isolierte Testfälle (ohne Stripe-Netz):
 * heutiges Verhalten (Gutschein ohne applies_to → Rabatt auch auf Pfand, Simulation) gegen die vorbereitete,
 * abgeschaltete Korrektur (Rabatt nur auf Waren). Geprüft je Fall: Artikelwert, Rabatt, Pfand, Steuer, Versand,
 * Zahlungsbetrag, Rechnungsbetrag (= Stripe-Positionen), Büro-Exportbetrag (fromStripe), Erstattungen.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "CHECKOUT_DEPOSIT_FIX"]) delete process.env[k];
const ROOT = path.join(import.meta.dirname, "..");
const fix = await import("../lib/checkout-deposit-fix");
const { mixDiscount } = await import("../lib/mix");
const model = await import("../lib/office/model");
const kpis = await import("../lib/office/kpis");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));
type Product = import("../lib/types").Product;
type GoodsLine = import("../lib/checkout-deposit-fix").GoodsLine;

const single: Product = { handle: "einzeldose", title: "Einzeldose", descriptionHtml: "", tags: [], collections: ["energy"], images: [], options: [], variants: [{ id: "v1", title: "1 Dose", price: 199, available: true, options: {}, cans: 1 }], createdAt: "2026-01-01" };
const mix: Product = { handle: "mix-2", title: "Mixpaket 2 Trays", descriptionHtml: "", tags: [], collections: ["mixpakete"], images: [], options: [], variants: [{ id: "vm", title: "2 Trays", price: 3500, available: true, options: {}, cans: 48 }], createdAt: "2026-01-01", contents: [["classic", 1], ["tropical", 1]] };
const PRODUCTS = new Map<string, Product>([...(catalogData.products as Product[]), single, mix].map((p) => [p.handle, p]));
const L = (handle: string, quantity: number): GoodsLine => {
  const p = PRODUCTS.get(handle) as Product;
  return { handle, title: p.title, unitAmount: p.variants[0].price, quantity, cansPerUnit: p.variants[0].cans ?? 1 };
};
const SHIP = 590;
const vatOf = (gross: number) => Math.round(gross - gross / 1.19);

/** Stripe-Sitzung so, wie Stripe sie heute liefern würde (Simulation) bzw. mit Korrektur */
function session(lines: GoodsLine[], discount: number, mode: "heute" | "korrektur", refunded = 0, ref?: string) {
  const items = lines.map((l) => `${l.handle}:${l.quantity}`).join(",");
  let stripeLines: { description: string; quantity: number; amount_total: number; amount_subtotal: number; amount_discount: number; price: { unit_amount: number } }[];
  let totalDiscount: number;
  if (mode === "heute") {
    const s = fix.simulateCurrent(lines, discount);
    stripeLines = [
      ...s.lines.map((x, i) => ({ description: x.title, quantity: x.quantity, amount_total: x.total, amount_subtotal: x.subtotal, amount_discount: x.discount, price: { unit_amount: lines[i].unitAmount } })),
      { description: "Einwegpfand", quantity: s.deposit.cans, amount_total: s.deposit.total, amount_subtotal: s.deposit.subtotal, amount_discount: s.deposit.discount, price: { unit_amount: 25 } },
    ];
    totalDiscount = discount;
  } else {
    const k = fix.discountedGoodsLines(lines, discount);
    // Zusammengelegte Ansicht je Produkt (Stripe zeigt die geteilten Zeilen einzeln; für den Büroabgleich zählt die Summe)
    stripeLines = [
      ...k.lines.map((x) => ({ description: x.title, quantity: x.quantity, amount_total: x.unitAmount * x.quantity, amount_subtotal: x.unitAmount * x.quantity, amount_discount: 0, price: { unit_amount: x.unitAmount } })),
      { description: "Einwegpfand", quantity: k.deposit.cans, amount_total: k.deposit.total, amount_subtotal: k.deposit.total, amount_discount: 0, price: { unit_amount: 25 } },
    ];
    totalDiscount = 0; // Rabatt steckt im Positionspreis
  }
  const subtotal = stripeLines.reduce((n, l) => n + l.amount_subtotal, 0);
  const total = stripeLines.reduce((n, l) => n + l.amount_total, 0) + SHIP;
  return {
    s: {
      id: `cs_test_${mode}${Math.random().toString(36).slice(2, 8)}`,
      created: Math.floor(Date.parse("2026-10-20T10:00:00Z") / 1000),
      amount_total: total,
      amount_subtotal: subtotal,
      payment_status: "paid",
      metadata: { items: mode === "heute" ? items : "", ...(ref ? { ref, refId: "inf1" } : {}) },
      customer_details: { name: "Test", email: "t@example.de" },
      shipping_cost: { amount_total: SHIP },
      total_details: { amount_discount: totalDiscount, amount_tax: 0 },
      payment_intent: { latest_charge: { amount_refunded: refunded, refunded: refunded >= total, payment_method_details: { type: "card" } } },
    } as import("../lib/office/model").StripeSessionLike,
    lines: stripeLines,
    total,
  };
}

type Case = { name: string; lines: GoodsLine[]; discount: (l: GoodsLine[]) => number; refund?: (total: number) => number; ref?: string };
const goodsOf = (l: GoodsLine[]) => l.reduce((n, x) => n + x.unitAmount * x.quantity, 0);
const mixOf = (l: GoodsLine[]) => mixDiscount(l.map((x) => ({ handle: x.handle, quantity: x.quantity, price: x.unitAmount }))).discount;
const CASES: Case[] = [
  { name: "1 Einzeldose mit Pfand (Testprodukt, im Katalog gibt es keine Einzeldose)", lines: [L("einzeldose", 1)], discount: () => 0 },
  { name: "1 × 24er-Tray", lines: [L("classic", 1)], discount: () => 0 },
  { name: "Mehrere Trays einer Sorte (kein Mix-Rabatt)", lines: [L("classic", 4)], discount: mixOf },
  { name: "Gemischte Sorten (Mix-Rabatt 3 Trays = 4 %)", lines: [L("classic", 2), L("tropical", 1)], discount: mixOf },
  { name: "Mixpaket", lines: [L("mix-2", 1)], discount: mixOf },
  { name: "Prozent-Rabatt (Influencer 10 %)", lines: [L("classic", 2), L("lime", 1)], discount: (l) => Math.round(goodsOf(l) * 0.1), ref: "ANNA10" },
  { name: "Festbetrag-Rabatt (5,00 €, z. B. Stripe-Aktionscode)", lines: [L("classic", 1), L("kiwi-lemon", 1)], discount: () => 500 },
  { name: "Influencer-Code 15 % (höher als Mix-Rabatt)", lines: [L("classic", 3), L("tropical", 3)], discount: (l) => Math.max(mixOf(l), Math.round(goodsOf(l) * 0.15)), ref: "MAX15" },
  { name: "Mehrere Pfandartikel (Dosen + Flaschen) mit Mix-Rabatt", lines: [L("classic", 2), L("wasser-still", 3), L("ice-coffee-latte", 1)], discount: mixOf },
  { name: "Teilrückerstattung (10,00 €)", lines: [L("classic", 2), L("tropical", 1)], discount: mixOf, refund: () => 1000 },
  { name: "Vollständige Rückerstattung", lines: [L("classic", 2), L("tropical", 1)], discount: mixOf, refund: (t) => t },
];

describe("AP6: Verteilung", () => {
  test("allocate: Summe exakt, anteilig, nie negativ", () => {
    assert.deepEqual(fix.allocate([3600, 1200], 360), [270, 90]);
    assert.deepEqual(fix.allocate([1000, 1000, 1000], 100), [34, 33, 33]);
    assert.deepEqual(fix.allocate([500], 900), [500]);
    assert.deepEqual(fix.allocate([0, 0], 50), [0, 0]);
  });
  test("Korrektur ist abgeschaltet und wird vom Checkout nicht benutzt", async () => {
    assert.equal(fix.depositFixEnabled({}), false);
    assert.equal(fix.depositFixEnabled({ CHECKOUT_DEPOSIT_FIX: "1" }), true);
    const checkout = await fs.readFile(path.join(ROOT, "app/api/checkout/route.ts"), "utf8");
    assert.ok(!checkout.includes("checkout-deposit-fix"), "Checkout unverändert");
    assert.match(checkout, /coupons\.create\(\{\s*amount_off: discount/);
    assert.ok(!/applies_to/.test(checkout), "Ursache im Code: Gutschein ohne applies_to");
  });
});

describe("AP6: 11 Testfälle", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const discount = c.discount(c.lines);
      const goods = goodsOf(c.lines);
      const cans = c.lines.reduce((n, l) => n + l.cansPerUnit * l.quantity, 0);
      const expected = fix.expectedTotal(c.lines, discount, SHIP);
      for (const mode of ["heute", "korrektur"] as const) {
        const first = session(c.lines, discount, mode);
        const refund = c.refund ? c.refund(first.total) : 0;
        const { s, lines, total } = refund ? session(c.lines, discount, mode, refund, c.ref) : { ...first, s: { ...first.s, metadata: { ...first.s.metadata, ...(c.ref ? { ref: c.ref, refId: "inf1" } : {}) } } };
        // Zahlungsbetrag = Warenkorb (Ware − Rabatt + Pfand + Versand) – in beiden Wegen gleich
        assert.equal(total, expected, `${mode}: Zahlungsbetrag`);
        // Rechnung (Stripe-Positionen) summiert sich zum Zahlungsbetrag
        assert.equal(lines.reduce((n, l) => n + l.amount_total, 0) + SHIP, total, `${mode}: Rechnungssumme`);
        const depositLine = lines.find((l) => l.description === "Einwegpfand");
        const o = model.fromStripe(s, lines, { status: "offen" }, PRODUCTS, "EX-TEST01");
        // Büro-Export: Pfand immer voll (Vorsteuerung über amount_subtotal), Brutto = Zahlung
        assert.equal(o.deposit, cans * 25, `${mode}: Büro-Pfand`);
        assert.equal(o.gross, total, `${mode}: Büro-Brutto`);
        assert.equal(o.vat, vatOf(total), `${mode}: USt (19 % enthalten)`);
        assert.equal(o.shipping, SHIP);
        assert.equal(o.refunded, refund);
        assert.equal(kpis.revenueGross(o), total - refund, `${mode}: Umsatz nach Erstattung`);
        if (mode === "heute") {
          assert.equal(o.goods - o.discount + o.deposit + SHIP, total, "heute: Büro-Rechnung stimmt in Summe");
          // Ursache sichtbar: Pfand-Position auf der Stripe-Rechnung rabattiert, sobald es Rabatt gibt
          if (discount > 0) assert.ok((depositLine?.amount_discount ?? 0) > 0 && (depositLine?.amount_total ?? 0) < cans * 25, "heute: Pfand rabattiert");
          else assert.equal(depositLine?.amount_total, cans * 25);
        } else {
          assert.equal(depositLine?.amount_total, cans * 25, "Korrektur: Pfand-Position immer voll");
          assert.equal(depositLine?.amount_discount, 0);
          assert.equal(o.goods + o.deposit + SHIP, total, "Korrektur: Rabatt im Warenpreis");
          // jede Teilzeile ganzzahlig, Summe Ware exakt
          assert.equal(lines.filter((l) => l.description !== "Einwegpfand").reduce((n, l) => n + l.amount_total, 0), goods - discount);
        }
      }
    });
  }
});
