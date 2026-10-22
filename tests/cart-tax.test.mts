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
