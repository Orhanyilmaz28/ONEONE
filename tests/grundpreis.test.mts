import assert from "node:assert/strict";
import { test } from "node:test";
import { basePricePerLiter, volumeMlOf } from "../lib/format.ts";

const norm = (s: string | null) => s?.replace(/\s/g, " ") ?? null;

test("Füllmenge wird aus dem Untertitel gelesen", () => {
  assert.equal(volumeMlOf({ title: "Classic", subtitle: "Der Klassiker · 250 ml" }), 250);
  assert.equal(volumeMlOf({ title: "Aqua Still", subtitle: "Rein & klar · 500 ml" }), 500);
  assert.equal(volumeMlOf({ title: "Wasser 0,5 l" }), 500);
  assert.equal(volumeMlOf({ title: "Peach", subtitle: "Peach Ice Tea" }), undefined);
});

test("Grundpreis je Liter (PAngV)", () => {
  // 24 × 250 ml = 6 l für 18,00 € → 3,00 €/l
  assert.equal(norm(basePricePerLiter(1800, 24, 250)), "3,00 €/l");
  // 12 × 500 ml = 6 l für 6,60 € → 1,10 €/l
  assert.equal(norm(basePricePerLiter(660, 12, 500)), "1,10 €/l");
  assert.equal(basePricePerLiter(1800, 24, undefined), null);
  assert.equal(basePricePerLiter(0, 24, 250), null);
});
