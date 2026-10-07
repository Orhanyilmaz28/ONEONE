// Erzeugt alle Mixpakete (data/products.json, Kollektion „mixpakete“) und die Bildliste für make-dosen-fotos.mjs.
// Es werden nur ganze Trays verkauft: Energy/Coffee/Tea 24 Dosen je Tray, Wasser 12 Flaschen je Tray.
// Aufruf: node scripts/make-mixpakete.mjs && node scripts/make-dosen-fotos.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "data/products.json");

const NAMES = {
  classic: "Classic", tropical: "Tropical", "kiwi-lemon": "Kiwi & Lemon", watermelon: "Watermelon", "white-peach": "White Peach",
  "ice-bonbon": "Ice Bonbon", lime: "Lime", "blueberry-coconut": "Blueberry Coconut", zero: "Zero",
  "ice-coffee-latte": "Ice Coffee Latte", "ice-coffee-cappuccino": "Ice Coffee Cappuccino",
  "xtea-peach": "X-Tea Peach", "xtea-lemon": "X-Tea Lemon", "xtea-watermelon": "X-Tea Watermelon",
  "wasser-still": "Aqua x Still", "wasser-medium": "Aqua x Medium", "wasser-classic": "Aqua x Classic",
};
const isWater = (h) => h.startsWith("wasser");
const TRAY_PRICE = (h) => (isWater(h) ? 660 : 1800); // Cent je Tray
const TRAY_CANS = (h) => (isWater(h) ? 12 : 24);

const ENERGY = ["classic", "tropical", "kiwi-lemon", "watermelon", "white-peach", "ice-bonbon", "lime", "blueberry-coconut", "zero"];
const COFFEE = ["ice-coffee-latte", "ice-coffee-cappuccino"];
const TEA = ["xtea-peach", "xtea-lemon", "xtea-watermelon"];
const AQUA = ["wasser-still", "wasser-medium", "wasser-classic"];
const CHILL = ["ice-coffee-latte", "wasser-classic", "ice-coffee-cappuccino", "wasser-still", "wasser-medium"];
const KOMPLETT = ["classic", "ice-coffee-latte", "wasser-classic", "tropical", "ice-coffee-cappuccino", "wasser-still", "kiwi-lemon", "watermelon", "wasser-medium"];

/** Rabatt in % nach Anzahl Trays – je größer, desto mehr */
const pct = (n) => (n <= 2 ? 3 : n === 3 ? 5 : n <= 5 ? 7 : n <= 8 ? 9 : n <= 11 ? 10 : n <= 17 ? 12 : n <= 23 ? 13 : 15);

/** Trays gleichmäßig auf die Sorten verteilen (bei wenigen Trays: die ersten Sorten je 1 Tray) */
function distribute(flavors, n) {
  if (n <= flavors.length) return flavors.slice(0, n).map((f) => [f, 1]);
  const base = Math.floor(n / flavors.length);
  const rest = n % flavors.length;
  return flavors.map((f, i) => [f, base + (i < rest ? 1 : 0)]);
}

const TYPES = [
  { key: "energy", name: "Energy-Mix", flavors: ENERGY, sizes: [3, 6, 9, 12, 18, 24], type: "Energy Drink", tag: "Alle Energy-Sorten – von fruchtig bis sauer" },
  { key: "coffee", name: "Ice-Coffee-Mix", flavors: COFFEE, sizes: [2, 4, 6, 12, 24], type: "Ice Coffee", tag: "Latte und Cappuccino, eiskalt und cremig" },
  { key: "aqua", name: "Aqua-Mix", flavors: AQUA, sizes: [3, 6, 12, 24], type: "Mineralwasser", tag: "Still, Medium und Classic" },
  { key: "tea", name: "X-Tea-Mix", flavors: TEA, sizes: [3, 6, 12], type: "Ice Tea", tag: "Peach, Lemon und Watermelon", available: false },
  { key: "chill", name: "Chill-Mix", flavors: CHILL, sizes: [4, 8, 12], type: "Ice Coffee", tag: "Ice Coffee und Wasser – kühl, klar, cremig" },
  { key: "komplett", name: "Komplett-Mix", flavors: KOMPLETT, sizes: [6, 12, 24], type: "Energy Drink", tag: "Energy, Ice Coffee und Wasser in einem Paket" },
];

// Feste Themen-Mixe (je 4 Trays)
const THEMED = [
  { handle: "mix-fruchtig", name: "Fruchtig-Mix", flavors: ["classic", "tropical", "kiwi-lemon", "watermelon"], type: "Energy Drink", feat: false },
  { handle: "mix-sweet-cool", name: "Sweet & Cool Mix", flavors: ["white-peach", "ice-bonbon", "blueberry-coconut", "watermelon"], type: "Energy Drink" },
  { handle: "mix-sauer-frisch", name: "Sauer & Frisch Mix", flavors: ["lime", "kiwi-lemon", "classic", "zero"], type: "Energy Drink" },
  { handle: "mix-kick-chill", name: "Kick & Chill Mix", flavors: ["classic", "tropical", "ice-coffee-latte", "ice-coffee-cappuccino"], type: "Energy Drink" },
];

const PALLETS = [
  { handle: "palette-energy", name: "Energy-Palette", contents: distribute(ENERGY, 120), type: "Energy Drink", tag: "Alle 9 Energy-Sorten auf einer Palette" },
  { handle: "palette-mix", name: "Mix-Palette", contents: distribute(KOMPLETT, 120), type: "Energy Drink", tag: "Energy, Ice Coffee und Wasser gemischt" },
  { handle: "palette-aqua", name: "Aqua-Palette", contents: distribute(AQUA, 80), type: "Mineralwasser", tag: "Still, Medium und Classic" },
];

const PFAND = (unit) =>
  `<h3>Pfand</h3>\n<p>Auf jede ${unit} kommt <strong>0,25 € Einwegpfand</strong>. Es wird an der Kasse separat ausgewiesen und ist im Preis nicht enthalten.</p>`;

function totals(contents) {
  const trays = contents.reduce((a, [, n]) => a + n, 0);
  const cans = contents.reduce((a, [h, n]) => a + n * TRAY_CANS(h), 0);
  const list = contents.reduce((a, [h, n]) => a + n * TRAY_PRICE(h), 0);
  return { trays, cans, list };
}
const fmt = (c) => c.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const ul = (contents) => `<ul>\n${contents.map(([h, n]) => `<li>${n} Tray${n > 1 ? "s" : ""} ${NAMES[h]} (${n * TRAY_CANS(h)} ${isWater(h) ? "Flaschen" : "Dosen"})</li>`).join("\n")}\n</ul>`;

function mixProduct({ handle, name, contents, type, tag, available = true, featured = false, created }) {
  const { trays, cans, list } = totals(contents);
  const p = pct(trays);
  const price = Math.round((list * (1 - p / 100)) / 10) * 10;
  const vt = `${trays} Trays · ${cans.toLocaleString("de-DE")} ${contents.every(([h]) => isWater(h)) ? "Flaschen" : "Dosen"}`;
  const hasWater = contents.some(([h]) => isWater(h));
  return {
    handle,
    title: `${name} · ${trays} Trays`,
    subtitle: `${tag ?? contents.map(([h]) => NAMES[h]).slice(0, 4).join(", ")}`,
    descriptionHtml:
      `<p>${tag ? `${tag}. ` : ""}Du bekommst <strong>${trays} ganze Trays</strong> – zusammen ${cans.toLocaleString("de-DE")} ${hasWater && !contents.every(([h]) => isWater(h)) ? "Dosen und Flaschen" : contents.every(([h]) => isWater(h)) ? "Flaschen" : "Dosen"}. ` +
      `Verkauft werden nur komplette Trays, keine Einzeldosen. Im Paket sparst du <strong>${p} %</strong> gegenüber dem Einzelkauf der Trays (${fmt(list / 100)}).</p>\n<h3>Inhalt</h3>\n${ul(contents)}\n` +
      PFAND(hasWater ? "Dose und Flasche" : "Dose"),
    vendor: "EXSTASE Energy",
    productType: type,
    tags: ["mixpakete"],
    collections: ["mixpakete"],
    images: [{ src: `/dosen-foto/${handle}.webp`, alt: `${name} – ${trays} Trays` }],
    options: [{ name: "Packung", values: [vt] }],
    variants: [{ id: `${handle}-v`, title: vt, price, compareAtPrice: list, available, options: { Packung: vt }, cans }],
    featured,
    highlights: [`${trays} Trays · ${cans.toLocaleString("de-DE")} ${hasWater ? "Stück" : "Dosen"}`, `${p} % günstiger als einzeln`, "Nur ganze Trays"],
    packSize: cans,
    contents,
    createdAt: created,
  };
}

function palletProduct({ handle, name, contents, type, tag }) {
  const { trays, cans, list } = totals(contents);
  const hasWater = contents.some(([h]) => isWater(h));
  const vt = `Palette · ${trays} Trays`;
  return {
    handle,
    title: `${name} · ${trays} Trays`,
    subtitle: `${tag} · ${cans.toLocaleString("de-DE")} ${hasWater ? "Dosen/Flaschen" : "Dosen"}`,
    descriptionHtml:
      `<p><strong>Die ganze Palette.</strong> ${tag}: ${trays} Trays, zusammen ${cans.toLocaleString("de-DE")} ${hasWater ? "Dosen und Flaschen" : "Dosen"} – für Händler, Gastronomie, Kioske und Events.</p>\n` +
      `<p>Paletten verkaufen wir nicht im Warenkorb, sondern auf Anfrage: Du schickst uns deine Wunschmenge, wir melden uns mit deinem Händlerpreis und der Lieferung per Spedition. Die Registrierung als Händler folgt in Kürze.</p>\n<h3>Inhalt</h3>\n${ul(contents)}\n` +
      PFAND(hasWater ? "Dose und Flasche" : "Dose"),
    vendor: "EXSTASE Energy",
    productType: type,
    tags: ["mixpakete", "palette"],
    collections: ["mixpakete"],
    images: [{ src: `/dosen-foto/${handle}.webp`, alt: `${name} – ${trays} Trays` }],
    options: [{ name: "Packung", values: [vt] }],
    variants: [{ id: `${handle}-v`, title: vt, price: list, available: true, options: { Packung: vt }, cans }],
    featured: false,
    highlights: [`${trays} Trays`, `${cans.toLocaleString("de-DE")} ${hasWater ? "Stück" : "Dosen"}`, "Preis auf Anfrage"],
    packSize: cans,
    contents,
    onRequest: true,
    createdAt: "2026-10-09T12:00:00.000Z",
  };
}

const products = [];
let t = Date.parse("2026-10-08T12:00:00.000Z");
const next = () => new Date((t -= 60000)).toISOString();
for (const x of THEMED) products.push(mixProduct({ ...x, contents: x.flavors.map((f) => [f, 1]), tag: x.flavors.map((f) => NAMES[f]).join(", "), created: next() }));
for (const ty of TYPES) for (const n of ty.sizes) products.push(mixProduct({ handle: `mix-${ty.key}-${n}`, name: ty.name, contents: distribute(ty.flavors, n), type: ty.type, tag: ty.tag, available: ty.available !== false, created: next() }));
for (const x of PALLETS) products.push(palletProduct(x));

const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
d.products = d.products.filter((p) => !p.collections.includes("mixpakete")).concat(products);
const first = products.find((p) => p.handle === "mix-energy-24");
d.collections = d.collections.map((c) => (c.handle === "mixpakete" ? c : c)).map((c) => (c.handle === "mixpakete" ? { ...c, description: "Von 2 Trays bis zur ganzen Palette – je größer, desto günstiger.", image: first?.images[0].src ?? c.image } : c));
fs.writeFileSync(FILE, `${JSON.stringify(d, null, 2)}\n`);

// Bildliste: Sorten, die im Bild gezeigt werden (max. 9, gleichmäßig aus dem Inhalt)
const bilder = Object.fromEntries(products.map((p) => [p.handle, p.contents.map(([h]) => h).slice(0, 9)]));
fs.writeFileSync(path.join(ROOT, "scripts/mix-bilder.json"), `${JSON.stringify(bilder, null, 2)}\n`);
console.log(products.length, "Mixpakete,", products.filter((p) => p.onRequest).length, "Paletten");
