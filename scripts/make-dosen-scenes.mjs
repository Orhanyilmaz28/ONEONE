// Setzt freigestellte Dosenfotos (PNG mit transparentem Hintergrund) auf den dunklen Shop-Hintergrund.
// Eingabe: public/produkte/original/<handle>.png – z. B. classic.png, tropical.png, kiwi-lemon.png, watermelon.png,
// zero.png, xtea-watermelon.png, xtea-peach.png, xtea-lemon.png (Dateiname = Produkt-Handle).
// Ausgabe: public/produkte/<handle>.webp (eine Dose) und <handle>-trio.webp (drei Dosen), 800 × 800.
// Danach `node scripts/seed-data.mjs` ausführen – vorhandene Fotos ersetzen dort automatisch die gezeichneten Dosen.
// Ausführen mit: node scripts/make-dosen-scenes.mjs
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** Leuchtfarbe hinter der Dose je Produkt (Standard: Lime) */
const GLOW = {
  classic: "#8dc63f",
  tropical: "#1ea7e1",
  "kiwi-lemon": "#ffd400",
  watermelon: "#e6007e",
  "white-peach": "#e4465d",
  "ice-bonbon": "#1d3fa6",
  lime: "#a9d12f",
  "blueberry-coconut": "#2b5cb5",
  zero: "#8dc63f",
  "xtea-watermelon": "#ff3d8b",
  "xtea-peach": "#ff9a1f",
  "xtea-lemon": "#ffe600",
};
const dir = fileURLToPath(new URL("../public/produkte/original/", import.meta.url));
const TEAS = readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/, ""))
  .map((handle) => ({ handle, glow: GLOW[handle] ?? "#8dc63f" }));

const bg = (glow) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><radialGradient id="g" cx=".5" cy=".62" r=".75"><stop offset="0" stop-color="${glow}" stop-opacity=".42"/><stop offset=".65" stop-color="${glow}" stop-opacity=".08"/><stop offset="1" stop-color="#0b0b12"/></radialGradient></defs><rect width="800" height="800" fill="#0b0b12"/><rect width="800" height="800" fill="url(#g)"/></svg>`);

const shadow = (w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40"><ellipse cx="${w / 2}" cy="20" rx="${w / 2.1}" ry="14" fill="#000" opacity=".45"/></svg>`);

for (const { handle, glow } of TEAS) {
  const file = fileURLToPath(new URL(`../public/produkte/original/${handle}.png`, import.meta.url));
  const can = (h) => sharp(file).resize({ height: h, kernel: "lanczos3" }).png().toBuffer();
  const sized = async (h) => {
    const buf = await can(h);
    const { width } = await sharp(buf).metadata();
    return { buf, width, h };
  };

  const one = await sized(580);
  const left = await sized(440);
  const right = await sized(440);
  const out = (name) => fileURLToPath(new URL(`../public/produkte/${name}`, import.meta.url));

  await sharp(bg(glow))
    .composite([
      { input: shadow(one.width + 90), left: Math.round(400 - (one.width + 90) / 2), top: 690 },
      { input: one.buf, left: Math.round(400 - one.width / 2), top: 110 },
    ])
    .webp({ quality: 90 })
    .toFile(out(`${handle}.webp`));

  await sharp(bg(glow))
    .composite([
      { input: shadow(left.width + 60), left: 90, top: 650 },
      { input: left.buf, left: 100, top: 220, },
      { input: shadow(right.width + 60), left: 800 - 90 - right.width - 60, top: 650 },
      { input: right.buf, left: 800 - 100 - right.width, top: 220 },
      { input: shadow(one.width + 90), left: Math.round(400 - (one.width + 90) / 2), top: 700 },
      { input: one.buf, left: Math.round(400 - one.width / 2), top: 120 },
    ])
    .webp({ quality: 90 })
    .toFile(out(`${handle}-trio.webp`));
}
console.log(`✓ ${TEAS.length} Dosen-Bilder erzeugt`);
