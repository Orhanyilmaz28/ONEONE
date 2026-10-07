// Erzeugt die Produktfotos (public/dosen-foto/<handle>.webp + <handle>-trio.webp):
// freigestellte Dose/Flasche (scripts/dosen-quellen) auf dunkler Kachel mit Sorten-Glow – Look der EXSTASE-Website.
// Aufruf: node scripts/make-dosen-fotos.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve(import.meta.dirname, "dosen-quellen");
const OUT = path.resolve(import.meta.dirname, "../public/dosen-foto");
const SIZE = 1200;

// handle → [Quelldatei, Glow-Farbe]
const items = {
  classic: ["classic", "#a8e652"],
  tropical: ["tropical", "#1fb6ff"],
  "kiwi-lemon": ["kiwi-lemon", "#ffd400"],
  watermelon: ["watermelon", "#ff2d95"],
  "white-peach": ["white-peach", "#ffb4a2"],
  "ice-bonbon": ["eisbonbon", "#7fd4ff"],
  lime: ["lime", "#c6f03c"],
  "blueberry-coconut": ["blueberry-coconut", "#8c6cff"],
  zero: ["zero", "#e9f5dc"],
  "xtea-watermelon": ["xtea-watermelon", "#ff5c8a"],
  "xtea-peach": ["xtea-peach", "#ffa36c"],
  "xtea-lemon": ["xtea-lemon", "#ffe14d"],
  "ice-coffee-latte": ["ice-coffee-latte-frei", "#e3c9a3"],
  "ice-coffee-cappuccino": ["ice-coffee-cappuccino-frei", "#c69c6d"],
  "wasser-still": ["wasser-still", "#ff6fb5"],
  "wasser-medium": ["wasser-medium", "#4caf50"],
  "wasser-classic": ["wasser-classic", "#42a5f5"],
};

function background(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><radialGradient id="g" cx="50%" cy="46%" r="52%"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="0.6" stop-color="${color}" stop-opacity="0.1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="#0a0a0a"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return Buffer.from(svg);
}

async function can(file, height) {
  return sharp(path.join(SRC, `${file}.webp`)).resize({ height }).toBuffer({ resolveWithObject: true });
}

for (const [handle, [file, color]] of Object.entries(items)) {
  const bg = background(color);
  // Einzeldose: ~78 % der Kachelhöhe
  const one = await can(file, Math.round(SIZE * 0.78));
  await sharp(bg)
    .composite([{ input: one.data, left: Math.round((SIZE - one.info.width) / 2), top: Math.round((SIZE - one.info.height) / 2) }])
    .webp({ quality: 86 })
    .toFile(path.join(OUT, `${handle}.webp`));
  // Trio: mittlere Dose groß, zwei kleinere dahinter
  const mid = await can(file, Math.round(SIZE * 0.74));
  const side = await can(file, Math.round(SIZE * 0.58));
  const cx = SIZE / 2;
  const gap = Math.round(mid.info.width * 0.95);
  await sharp(bg)
    .composite([
      { input: side.data, left: Math.round(cx - gap - side.info.width / 2), top: Math.round(SIZE * 0.5 - side.info.height / 2 + 40) },
      { input: side.data, left: Math.round(cx + gap - side.info.width / 2), top: Math.round(SIZE * 0.5 - side.info.height / 2 + 40) },
      { input: mid.data, left: Math.round(cx - mid.info.width / 2), top: Math.round(SIZE * 0.5 - mid.info.height / 2) },
    ])
    .webp({ quality: 86 })
    .toFile(path.join(OUT, `${handle}-trio.webp`));
}
// ── Mixpakete: mehrere Sorten nebeneinander, Glow in den Sortenfarben ──
const mixes = {
  "mix-fruchtig": ["classic", "tropical", "kiwi-lemon", "watermelon"],
  "mix-sweet-cool": ["white-peach", "ice-bonbon", "blueberry-coconut", "watermelon"],
  "mix-sauer-frisch": ["lime", "kiwi-lemon", "classic", "zero"],
  "mix-alle-sorten": ["classic", "tropical", "kiwi-lemon", "watermelon", "white-peach", "ice-bonbon", "lime", "blueberry-coconut", "zero"],
  "mix-xtea": ["xtea-peach", "xtea-lemon", "xtea-watermelon"],
  "mix-ice-coffee": ["ice-coffee-latte", "ice-coffee-cappuccino"],
  "mix-kick-chill": ["classic", "tropical", "ice-coffee-latte", "ice-coffee-cappuccino"],
};

function mixBackground(colors) {
  const stops = colors
    .map((c, i) => `<radialGradient id="g${i}" cx="${((i + 0.5) / colors.length) * 100}%" cy="50%" r="38%"><stop offset="0" stop-color="${c}" stop-opacity="0.5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`)
    .join("");
  const rects = colors.map((_, i) => `<rect width="100%" height="100%" fill="url(#g${i})"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>${stops}</defs><rect width="100%" height="100%" fill="#0a0a0a"/>${rects}</svg>`);
}

for (const [handle, keys] of Object.entries(mixes)) {
  // bis 5 Sorten eine Reihe, sonst zwei Reihen; Dosen nebeneinander mit kleinem Abstand
  const rows = keys.length > 5 ? [keys.slice(0, Math.ceil(keys.length / 2)), keys.slice(Math.ceil(keys.length / 2))] : [keys];
  const rowH = rows.length === 2 ? SIZE * 0.4 : SIZE * 0.7;
  const layers = [];
  for (const [r, row] of rows.entries()) {
    let cans = await Promise.all(row.map((k) => can(items[k][0], Math.round(rowH))));
    const gap = 18;
    let total = cans.reduce((a, c) => a + c.info.width, 0) + gap * (cans.length - 1);
    if (total > SIZE * 0.92) {
      const f = (SIZE * 0.92) / total;
      cans = await Promise.all(row.map((k) => can(items[k][0], Math.round(rowH * f))));
      total = cans.reduce((a, c) => a + c.info.width, 0) + gap * (cans.length - 1);
    }
    let x = (SIZE - total) / 2;
    const y = rows.length === 2 ? SIZE * (r === 0 ? 0.08 : 0.52) : (SIZE - cans[0].info.height) / 2;
    for (const c of cans) {
      layers.push({ input: c.data, left: Math.round(x), top: Math.round(y) });
      x += c.info.width + gap;
    }
  }
  await sharp(mixBackground(keys.map((k) => items[k][1])))
    .composite(layers)
    .webp({ quality: 86 })
    .toFile(path.join(OUT, `${handle}.webp`));
}
console.log("fertig:", fs.readdirSync(OUT).length, "Dateien");
