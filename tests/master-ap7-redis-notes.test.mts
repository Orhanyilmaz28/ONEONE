/**
 * AP7 – Lieferscheinnummern parallel gegen eine echte lokale Test-Redis (Upstash-REST-Brücke).
 * Ersetzt den früheren Test in office-docs.test.mts, der wegen des schon geladenen Speichers in Wahrheit
 * den Datei-Speicher nutzte. Die Umgebung wird hier VOR dem ersten Import gesetzt.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const url = process.env.REDIS_TEST_URL;
const local = Boolean(url && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url));
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"]) delete process.env[k];
if (local) {
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = process.env.REDIS_TEST_TOKEN;
}
const redis = (cmd: string[]) => fetch(url as string, { method: "POST", headers: { Authorization: `Bearer ${process.env.REDIS_TEST_TOKEN}` }, body: JSON.stringify(cmd) }).then((r) => r.json() as Promise<{ result: unknown }>);

test("Lieferscheinnummern parallel gegen echte Redis: eindeutig, gleiche Bestellung = eine Nummer", { skip: local ? false : "REDIS_TEST_URL (lokal) nicht gesetzt" }, async () => {
  const store = await import("../lib/store");
  assert.equal(store.storeKind(), "redis", "Test läuft wirklich gegen Redis");
  const model = await import("../lib/office/model");
  const notes = await import("../lib/office/delivery-notes");
  type Product = import("../lib/types").Product;
  const catalog = JSON.parse(await fs.readFile(path.join(import.meta.dirname, "..", "data", "products.json"), "utf8"));
  const PRODUCTS = new Map<string, Product>((catalog.products as Product[]).map((p) => [p.handle, p]));
  const old = (await redis(["KEYS", "tt:*office-l*"])).result as string[];
  if (old.length) await redis(["DEL", ...old]);
  const NOW = Date.parse("2026-10-21T10:00:00Z");
  const LINES = [
    { description: "Classic", quantity: 2, amount_total: 3600, amount_subtotal: 3600, amount_discount: 0, price: { unit_amount: 1800 } },
    { description: "Einwegpfand", quantity: 48, amount_total: 1200, amount_subtotal: 1200, amount_discount: 0, price: { unit_amount: 25 } },
  ];
  const list = Array.from({ length: 20 }, (_, i) => {
    const id = `cs_test_RED${String(i).padStart(3, "0")}`;
    const s = { id, created: Math.floor(NOW / 1000), amount_total: 5390, amount_subtotal: 4800, payment_status: "paid", metadata: { items: "classic:2" }, customer_details: { name: "Test", email: "t@example.de" }, shipping_cost: { amount_total: 590 }, total_details: { amount_discount: 0, amount_tax: 0 }, payment_intent: { latest_charge: { amount_refunded: 0, refunded: false, payment_method_details: { type: "card" } } } } as import("../lib/office/model").StripeSessionLike;
    return model.fromStripe(s, LINES, { status: "offen" }, PRODUCTS, `EX-${id.slice(-6).toUpperCase()}`);
  });
  const results = await Promise.all(list.map((o) => notes.issueNotes([o], "anna", "heruntergeladen", PRODUCTS, NOW)));
  const nums = results.map((m, i) => m.get(list[i].key)?.number);
  assert.equal(new Set(nums).size, 20);
  assert.deepEqual([...nums].sort()[19], "LS-2026-00020");
  const same = await Promise.all(Array.from({ length: 6 }, () => notes.issueNotes([list[3]], "ben", "gedruckt", PRODUCTS, NOW)));
  assert.equal(new Set(same.map((m) => m.get(list[3].key)?.number)).size, 1);
  assert.ok(((await redis(["DBSIZE"])).result as number) > 0, "Daten liegen wirklich in Redis");
});
