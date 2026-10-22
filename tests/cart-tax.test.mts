import assert from "node:assert/strict";
import test from "node:test";
import { cartVat, includedVat, packContentLabel } from "../lib/cart-tax.ts";

test("MwSt. je Position wie in der Beispielrechnung (24er Classic)", () => {
  assert.equal(includedVat(1800), 287);
  assert.equal(includedVat(590), 94);
  assert.equal(includedVat(600), 96);
  assert.equal(cartVat({ goods: 1800, deposit: 600, shipping: 590 }), 477);
  assert.equal(cartVat({ goods: 7200, deposit: 2400, shipping: 0 }), 1150 + 383);
  assert.equal(includedVat(0), 0);
});

test("Packungsinhalt", () => {
  assert.equal(packContentLabel({ handle: "classic" }, 24), "24 × 250 ml");
  assert.equal(packContentLabel({ handle: "wasser-still" }, 12), "12 × 500 ml");
  assert.equal(packContentLabel({ handle: "xtea-peach", productType: "Ice Tea" }, 24), "24 × 250 ml");
  assert.equal(packContentLabel({ handle: "neu", productType: "Mineralwasser" }, 12), "12 × 500 ml");
  assert.equal(packContentLabel({ handle: "einzel" }, 1), "");
});

test("orderTax: Pfand und Versand folgen dem Satz der Ware, Summe bleibt exakt", async () => {
  const { orderTax, allocate } = await import("../lib/cart-tax.ts");
  assert.deepEqual(allocate(590, [1, 1, 1]), [197, 197, 196]);
  const one = orderTax([{ gross: 1800, rate: 19, cans: 24 }], 600, 590);
  assert.equal(one.vat, 477);
  assert.equal(one.gross, 2990);
  assert.deepEqual(one.byRate, [{ rate: 19, gross: 2990, net: 2513, vat: 477 }]);
  // gemischt: Eiskaffee 7 % (falls bestätigt) + Energy 19 %
  const mixed = orderTax([{ gross: 2190, rate: 19, cans: 24 }, { gross: 2190, rate: 7, cans: 24 }], 1200, 590);
  assert.equal(mixed.gross, 2190 * 2 + 1200 + 590);
  const r7 = mixed.byRate.find((r) => r.rate === 7);
  const r19 = mixed.byRate.find((r) => r.rate === 19);
  assert.equal(r7?.gross, 2190 + 600 + 295);
  assert.equal(r19?.gross, 2190 + 600 + 295);
  assert.equal(mixed.vat, (r7?.vat ?? 0) + (r19?.vat ?? 0));
});
