// Erzeugt public/dosen-foto/<handle>-x.webp: 24 Dosen am Boden als großes „X“ (passend zum EXSTASE-X),
// davor eine große Dose. Leichte Perspektive, weiche Schatten, hintere Dosen etwas unscharf.
// Quellen wie make-dosen-fotos.mjs (scripts/dosen-quellen/<datei>.webp, freigestellt).
// Aufruf: node scripts/make-dosen-x.mjs [handle …] [--hell] [--out=<ordner>]
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve(import.meta.dirname, "dosen-quellen");
const args = process.argv.slice(2);
const HELL = args.includes("--hell");
const outArg = args.find((a) => a.startsWith("--out="));
const OUT = outArg ? path.resolve(outArg.slice(6)) : path.resolve(import.meta.dirname, "../public/dosen-foto");
const SIZE = 1200;

// handle → [Quelldatei, Glow-Farbe] (wie make-dosen-fotos.mjs)
const items = {
  classic: ["classic", "#a8e652"],
  tropical: ["tropical", "#1fb6ff"],
  "kiwi-lemon": ["kiwi-lemon", "#ffd400"],
  watermelon: ["watermelon", "#ff2d95"],
  "white-peach": ["white-peach", "#ffb4a2"],
  "ice-bonbon": ["eisbonbon", "#7fd4ff"],
  lime: ["lime", "#c6f03c"],
  "blueberry-coconut": ["blueberry-coconut", "#8c6cff"],
  "xtea-watermelon": ["xtea-watermelon", "#ff5c8a"],
  "xtea-peach": ["xtea-peach", "#ffa36c"],
  "xtea-lemon": ["xtea-lemon", "#ffe14d"],
  "dragonfruit-lychee": ["dragonfruit-lychee", "#c2185b"],
  cactus: ["cactus", "#4caf50"],
  "ice-coffee-latte": ["ice-coffee-latte-frei", "#e3c9a3"],
  "ice-coffee-cappuccino": ["ice-coffee-cappuccino-frei", "#c69c6d"],
  "ice-coffee-caramel": ["ice-coffee-caramel", "#e8892b"],
  "ice-coffee-espresso": ["ice-coffee-espresso", "#a0623d"],
  "ice-coffee-vanille": ["ice-coffee-vanille", "#f0d28a"],
  "wasser-still": ["wasser-still", "#ff6fb5"],
  "wasser-medium": ["wasser-medium", "#4caf50"],
  "wasser-classic": ["wasser-classic", "#42a5f5"],
};

// Kamera: Bodenpunkt (u, z) → Bildpunkt. Je größer z, desto weiter hinten.
const F = 2700; // Brennweite in px (Tele: wenig Verzerrung)
const HORIZON = -640; // Horizont liegt oberhalb des Bildes (Blick schräg von oben)
const CAM_H = 6.6; // Kamerahöhe über dem Boden (in Dosenhöhen)
const CAN_H = 1; // Dosenhöhe
const project = (u, z) => ({ x: SIZE / 2 + (u * F) / z, y: HORIZON + (CAM_H * F) / z, scale: F / z });

function background(color) {
  const base = HELL ? "#ffffff" : "#0a0a0a";
  const glow = HELL
    ? `<radialGradient id="g" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ececec"/></radialGradient>`
    : `<radialGradient id="g" cx="50%" cy="42%" r="58%"><stop offset="0" stop-color="${color}" stop-opacity="0.5"/><stop offset="0.6" stop-color="${color}" stop-opacity="0.1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>${glow}</defs>
    <rect width="100%" height="100%" fill="${base}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
}

// Weicher Bodenschatten unter einer Dose
function shadow(w, strength) {
  const h = Math.max(8, Math.round(w * 0.32));
  const pad = Math.round(w * 0.5);
  const W = w + pad * 2, H = h + pad * 2;
  const a = HELL ? 0.35 * strength : 0.75 * strength;
  return {
    svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b"><feGaussianBlur stdDeviation="${w * 0.09}"/></filter></defs>
      <ellipse cx="${W / 2}" cy="${H / 2}" rx="${w * 0.62}" ry="${h / 2}" fill="#000" fill-opacity="${a}" filter="url(#b)"/></svg>`),
    W, H,
  };
}

// 24 Dosen als X: zwei Diagonalen mit je 12 Dosen (die Mitte bleibt frei, dort steht vorne die große Dose)
function xPositions() {
  const pts = [];
  const N = 12, W = 2.05, ZC = 16.5, D = 3.5;
  for (let i = 0; i < N; i++) {
    const t = -1 + (2 * i) / (N - 1);
    pts.push({ u: t * W, z: ZC + t * D });
    pts.push({ u: t * W, z: ZC - t * D });
  }
  return pts;
}

async function render(handle) {
  const [file, color] = items[handle];
  const srcPath = path.join(SRC, `${file}.webp`);
  const meta = await sharp(srcPath).metadata();
  const ratio = meta.width / meta.height;
  const layers = [];
  const cans = xPositions().sort((a, b) => b.z - a.z); // hinten zuerst
  const zMin = Math.min(...cans.map((c) => c.z));
  for (const c of cans) {
    const p = project(c.u, c.z);
    const h = Math.round(CAN_H * p.scale * 0.95);
    const w = Math.round(h * ratio);
    const s = shadow(w, 0.8);
    layers.push({ input: s.svg, left: Math.round(p.x - s.W / 2), top: Math.round(p.y - s.H / 2) });
    // hintere Dosen leicht unscharf (Tiefenschärfe)
    const blur = 0.4 + (c.z - zMin) * 0.25;
    const img = await sharp(srcPath).resize({ height: h }).blur(blur).toBuffer();
    layers.push({ input: img, left: Math.round(p.x - w / 2), top: Math.round(p.y - h) });
  }
  // große Dose vorne
  const heroH = Math.round(SIZE * 0.54);
  const heroW = Math.round(heroH * ratio);
  const heroBase = Math.round(SIZE * 0.95);
  const hs = shadow(heroW, 1);
  layers.push({ input: hs.svg, left: Math.round(SIZE / 2 - hs.W / 2), top: Math.round(heroBase - hs.H / 2) });
  layers.push({ input: await sharp(srcPath).resize({ height: heroH }).toBuffer(), left: Math.round(SIZE / 2 - heroW / 2), top: heroBase - heroH });
  const out = path.join(OUT, `${handle}-x.webp`);
  await sharp(background(color)).composite(layers).webp({ quality: 88 }).toFile(out);
  console.log("ok", out);
}

const wanted = args.filter((a) => !a.startsWith("--"));
for (const h of wanted.length ? wanted : Object.keys(items)) await render(h);
