/**
 * Pfand-Korrektur A im echten Checkout-Code (ohne Stripe-Netz: sessions.create wird abgefangen).
 * Geprüft: kein Gutschein, Rabatt nur auf Waren im Positionspreis, Pfand voll 0,25 €/Dose, Summe = Warenkorb,
 * Metadaten je Stripe-Position + Rabatt für das Büro, Aktionscodes nur ohne eigenen Rabatt.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, mock, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_INVOICES", "STRIPE_AUTOMATIC_TAX"]) delete process.env[k];
process.env.STRIPE_SECRET_KEY = "sk_test_nur_lokal";
const ROOT = path.join(import.meta.dirname, "..");
// Die Route lädt Stripe als CommonJS – deshalb hier dieselbe Klasse über require holen (sonst greift das Abfangen nicht)
const Stripe = createRequire(import.meta.url)("stripe") as typeof import("stripe").default;
const { POST } = await import("../app/api/checkout/route");
const { mixDiscount } = await import("../lib/mix");
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8")).products as import("../lib/types").Product[];

// Abfangen aller Stripe-Aufrufe der Klasse (gemeinsamer Prototyp aller Instanzen)
const probe = new (Stripe as unknown as new (k: string) => unknown)("sk_test_probe") as unknown as { checkout: { sessions: object }; coupons: object };
const sessionsProto = Object.getPrototypeOf(probe.checkout.sessions) as { create: (p: unknown) => Promise<unknown> };
const couponsProto = Object.getPrototypeOf(probe.coupons) as { create: (p: unknown) => Promise<unknown> };
type Params = { line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string; description?: string; metadata: Record<string, string> } } }[]; metadata: Record<string, string>; discounts?: unknown; allow_promotion_codes?: boolean };
let last: Params | null = null;
mock.method(sessionsProto, "create", async (p: Params) => {
  last = p;
  return { url: "https://checkout.stripe.test/x" };
});
const couponCalls = mock.method(couponsProto, "create", async () => ({ id: "c" }));

const variant = (handle: string) => {
  const p = catalog.find((x) => x.handle === handle);
  assert.ok(p, handle);
  return p.variants[0];
};
async function checkout(lines: [string, number][], code?: string) {
  last = null;
  const res = await POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify({ lines: lines.map(([h, q]) => ({ variantId: variant(h).id, quantity: q })), ...(code ? { code } : {}) }) }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.ok(last);
  return last as Params;
}
const goodsOf = (p: Params) => p.line_items.filter((l) => l.price_data.product_data.name !== "Einwegpfand");
const depositOf = (p: Params) => p.line_items.find((l) => l.price_data.product_data.name === "Einwegpfand");
const sum = (ls: Params["line_items"]) => ls.reduce((n, l) => n + l.quantity * l.price_data.unit_amount, 0);

describe("Checkout mit Pfand-Korrektur A", () => {
  test("Testkauf von Orhan (1 × Tropical + 1 × Classic, Mix 3 %): Ware 34,92 €, Pfand voll 12,00 €", async () => {
    const p = await checkout([["tropical", 1], ["classic", 1]]);
    const mix = mixDiscount([{ handle: "tropical", quantity: 1, price: 1800 }, { handle: "classic", quantity: 1, price: 1800 }]);
    assert.equal(mix.discount, 108);
    assert.equal(sum(goodsOf(p)), 3600 - 108);
    assert.deepEqual(goodsOf(p).map((l) => l.price_data.unit_amount), [1746, 1746]);
    assert.equal(depositOf(p)?.price_data.unit_amount, 25);
    assert.equal(depositOf(p)?.quantity, 48);
    assert.equal(p.metadata.discount, "108");
    assert.equal(p.metadata.discountLabel, "Mix-Rabatt 3 %");
    assert.equal(p.metadata.items, "tropical:1,classic:1");
    assert.match(goodsOf(p)[0].price_data.product_data.description ?? "", /inkl\. Mix-Rabatt 3 %/);
    assert.equal(p.discounts, undefined, "kein Gutschein");
    assert.equal(p.allow_promotion_codes, undefined, "kein Aktionscode zusätzlich zum Mix-Rabatt");
    assert.equal(couponCalls.mock.callCount(), 0);
  });

  test("Geteilte Position (2 × Classic + 1 × Tropical, 4 %): Cent-genau, Metadaten je Stripe-Position", async () => {
    const p = await checkout([["classic", 2], ["tropical", 1]]);
    assert.equal(sum(goodsOf(p)), 5400 - 216);
    assert.equal(sum([depositOf(p)!]), 72 * 25);
    const qty: Record<string, number> = {};
    for (const part of p.metadata.items.split(",")) {
      const [h, q] = part.split(":");
      qty[h] = (qty[h] ?? 0) + Number(q);
    }
    assert.deepEqual(qty, { classic: 2, tropical: 1 }, "Mengen je Produkt bleiben gleich");
    assert.equal(p.metadata.items.split(",").length, goodsOf(p).length, "eine Metadaten-Angabe je Stripe-Warenposition");
    goodsOf(p).forEach((l, i) => assert.equal(l.price_data.product_data.metadata.handle, p.metadata.items.split(",")[i].split(":")[0]));
  });

  test("Ohne Rabatt: Listenpreise, keine Rabatt-Metadaten, Stripe-Aktionscodes erlaubt", async () => {
    const p = await checkout([["classic", 4]]);
    assert.deepEqual(goodsOf(p).map((l) => [l.quantity, l.price_data.unit_amount]), [[4, variant("classic").price]]);
    assert.equal(p.metadata.discount, undefined);
    assert.equal(p.allow_promotion_codes, true);
    assert.equal(goodsOf(p)[0].price_data.product_data.description, undefined);
  });
});
