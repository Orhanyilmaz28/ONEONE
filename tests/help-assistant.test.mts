import assert from "node:assert/strict";
import { test } from "node:test";
import products from "../data/products.json" with { type: "json" };
import { answerQuestion, answerTopic, findProduct, HELP_TOPICS } from "../lib/help-assistant.ts";

const shipping = { cost: 590, freeFrom: 0, express: 0 };
const list = (products as { products: { handle: string; title: string }[] }).products;
const ask = (q: string) => answerQuestion(q, shipping, list);

test("Jedes Thema hat eine Antwort", () => {
  for (const t of HELP_TOPICS) assert.ok(answerTopic(t.id, shipping)?.text);
});

test("Versandkosten kommen aus den Einstellungen", () => {
  assert.match(ask("Was kostet der Versand?").text, /5,90/);
  assert.match(answerQuestion("Versand?", { cost: 590, freeFrom: 4900, express: 0 }, list).text, /ab 49,00/);
});

test("Typische Fragen landen beim richtigen Thema", () => {
  assert.equal(ask("Wie viel Pfand kommt drauf?").topic, "pfand");
  assert.equal(ask("Liefert ihr nach Österreich?").topic, "ausland");
  assert.equal(ask("Kann ich mit PayPal zahlen?").topic, "zahlung");
  assert.equal(ask("Ich möchte etwas zurückschicken, Widerruf").topic, "rueckgabe");
  assert.equal(ask("Wo ist meine Bestellung?").topic, "bestellung");
  assert.equal(ask("Ich habe einen Kiosk und brauche eine Palette").topic, "haendler");
  assert.equal(ask("Gibt es Rabatt beim Mischen?").topic, "mix");
  assert.equal(ask("Liefert ihr in die EU?").topic, "ausland");
  assert.notEqual(ask("Wie viel Euro kostet euer Versand?").topic, "ausland");
});

test("Sortennamen führen zur Produktseite", () => {
  const a = ask("Wie viel Koffein hat Watermelon?");
  assert.equal(a.topic, "produkt");
  assert.ok(a.links[0].href.startsWith("/products/"));
  assert.equal(findProduct("deutschland", list), undefined);
});

test("Unbekannte Fragen verweisen auf hello@exstase.com", () => {
  const a = ask("Wie ist das Wetter?");
  assert.equal(a.topic, "unbekannt");
  assert.match(a.text, /hello@exstase\.com/);
});
