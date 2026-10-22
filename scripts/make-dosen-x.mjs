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
const HORIZON = -590; // Horizont liegt oberhalb des Bildes (Blick schräg von oben)
const CAM_H = 6.2; // Kamerahöhe über dem Boden (in Dosenhöhen)
const CAN_H = 1; // Dosenhöhe
const project = (u, z) => ({ x: SIZE / 2 + (u * F) / z, y: HORIZON + (CAM_H * F) / z, scale: F / z });

function background(color) {
  if (HELL) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>
      <radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e4e4"/></radialGradient>
      <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#f)"/></svg>`);
  }
  // Dunkle Bühne: Lichtkegel von oben in der Sortenfarbe, heller Boden, Vignette
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>
    <radialGradient id="spot" cx="50%" cy="30%" r="55%"><stop offset="0" stop-color="${color}" stop-opacity="0.42"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <radialGradient id="floor" cx="50%" cy="78%" r="60%" fy="78%"><stop offset="0" stop-color="${color}" stop-opacity="0.22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter></defs>
    <rect width="100%" height="100%" fill="#07080a"/>
    <rect width="100%" height="100%" fill="url(#spot)"/>
    <rect width="100%" height="100%" fill="url(#floor)"/>
    <rect width="100%" height="100%" fill="url(#vig)"/></svg>`);
}

// Glanz hinter der großen Dose
function halo(w, h, color) {
  const W = w * 3, H = h * 1.5;
  return {
    svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b"><feGaussianBlur stdDeviation="${w * 0.35}"/></filter></defs>
      <ellipse cx="${W / 2}" cy="${H / 2}" rx="${w * 0.75}" ry="${h * 0.48}" fill="${HELL ? "#ffffff" : color}" fill-opacity="${HELL ? 0.9 : 0.45}" filter="url(#b)"/></svg>`),
    W, H,
  };
}

// Spiegelung auf dem Boden: Dose gespiegelt, nach unten ausgeblendet
async function reflection(buf, w, h, opacity) {
  const rh = Math.round(h * 0.45);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${rh}"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${opacity}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#m)"/></svg>`);
  return sharp(buf).flip().extract({ left: 0, top: 0, width: w, height: rh }).blur(1.2)
    .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
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
  const W = 2.15, ZC = 16.5, D = 3.9;
  // je Diagonale 6 Dosen links und 6 rechts der Mitte, gleichmäßiger Abstand
  for (let i = 0; i < 6; i++) {
    for (const sign of [-1, 1]) {
      const t = sign * (0.1 + i * 0.18);
      pts.push({ u: t * W, z: ZC + t * D });
      pts.push({ u: t * W, z: ZC - t * D });
    }
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
  const zMax = Math.max(...cans.map((c) => c.z));
  for (const c of cans) {
    const p = project(c.u, c.z);
    const h = Math.round(CAN_H * p.scale * 0.95);
    const w = Math.round(h * ratio);
    const depth = (c.z - zMin) / (zMax - zMin); // 0 = vorne, 1 = hinten
    const s = shadow(w, 0.8);
    layers.push({ input: s.svg, left: Math.round(p.x - s.W / 2), top: Math.round(p.y - s.H / 2) });
    // hintere Dosen etwas dunkler und unschärfer (Tiefe), damit die vordere Dose heraussticht
    const img = await sharp(srcPath).resize({ height: h })
      .modulate({ brightness: HELL ? 1 - depth * 0.08 : 0.82 - depth * 0.3 })
      .blur(0.5 + depth * 2.2).png().toBuffer();
    layers.push({ input: await reflection(img, w, h, HELL ? 0.18 : 0.22), left: Math.round(p.x - w / 2), top: Math.round(p.y) });
    layers.push({ input: img, left: Math.round(p.x - w / 2), top: Math.round(p.y - h) });
  }
  // große Dose vorne mit Glanz und Spiegelung
  const heroH = Math.round(SIZE * 0.5);
  const heroW = Math.round(heroH * ratio);
  const heroBase = Math.round(SIZE * 0.88);
  const hero = await sharp(srcPath).resize({ height: heroH }).sharpen({ sigma: 0.8 }).png().toBuffer();
  const hl = halo(heroW, heroH, color);
  layers.push({ input: hl.svg, left: Math.round(SIZE / 2 - hl.W / 2), top: Math.round(heroBase - heroH / 2 - hl.H / 2) });
  const hs = shadow(heroW, 1);
  layers.push({ input: hs.svg, left: Math.round(SIZE / 2 - hs.W / 2), top: Math.round(heroBase - hs.H / 2) });
  layers.push({ input: await reflection(hero, heroW, heroH, HELL ? 0.25 : 0.3), left: Math.round(SIZE / 2 - heroW / 2), top: heroBase });
  layers.push({ input: hero, left: Math.round(SIZE / 2 - heroW / 2), top: heroBase - heroH });
  const out = path.join(OUT, `${handle}-x.webp`);
  await sharp(background(color)).composite(layers).webp({ quality: 88 }).toFile(out);
  console.log("ok", out);
}

const wanted = args.filter((a) => !a.startsWith("--"));
for (const h of wanted.length ? wanted : Object.keys(items)) await render(h);
