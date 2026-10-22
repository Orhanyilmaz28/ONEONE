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

// Kamera: Bodenpunkt (u, z) → Bildpunkt. Je größer z, desto weiter hinten. Blick schräg von oben.
const F = 3000; // Brennweite in px (Tele: wenig Verzerrung)
const HORIZON = -760; // Horizont liegt oberhalb des Bildes
const CAM_H = 6.4; // Kamerahöhe über dem Boden (in Dosenhöhen)
const project = (u, z) => ({ x: SIZE / 2 + (u * F) / z, y: HORIZON + (CAM_H * F) / z, scale: F / z, tilt: CAM_H / Math.hypot(CAM_H, z) });

function background(color) {
  if (HELL) {
    // weißes Fotostudio: nahtloser Hintergrund, leicht grauer Boden
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f7f7f7"/><stop offset="1" stop-color="#ececec"/></linearGradient>
      <radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.07"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#v)"/></svg>`);
  }
  // dunkles Studio: Licht von oben in der Sortenfarbe, glänzender schwarzer Boden, Vignette
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>
    <radialGradient id="spot" cx="50%" cy="28%" r="60%"><stop offset="0" stop-color="${color}" stop-opacity="0.32"/><stop offset="0.6" stop-color="${color}" stop-opacity="0.07"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="#08090b"/><rect width="100%" height="100%" fill="url(#spot)"/><rect width="100%" height="100%" fill="url(#vig)"/></svg>`);
}

// Weicher Bodenschatten (Kontaktschatten + breiter Halbschatten)
function shadow(w, ry) {
  const pad = Math.round(w * 0.6);
  const W = w + pad * 2, H = Math.round(ry * 2 + pad * 2);
  const a = HELL ? 0.28 : 0.7;
  return {
    svg: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
      <filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${w * 0.14}"/></filter>
      <filter id="b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${w * 0.03}"/></filter></defs>
      <ellipse cx="${W / 2 + w * 0.08}" cy="${H / 2 + ry * 0.2}" rx="${w * 0.7}" ry="${ry * 1.5}" fill="#000" fill-opacity="${a * 0.6}" filter="url(#b1)"/>
      <ellipse cx="${W / 2}" cy="${H / 2}" rx="${w * 0.5}" ry="${ry}" fill="#000" fill-opacity="${a}" filter="url(#b2)"/></svg>`),
    W, H,
  };
}

// Aus der flachen Dosen-Ansicht eine Dose „von schräg oben“ machen:
// Ober- und Unterkante werden zu Ellipsen, oben kommt ein Aludeckel mit Lasche dazu.
async function cylinder(srcPath, h, tilt, blur = 0) {
  const raw = await sharp(srcPath).resize({ height: h, kernel: "lanczos3" }).toBuffer({ resolveWithObject: true });
  const w = raw.info.width;
  const ry = Math.max(2, (w / 2) * tilt);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="${ry}" width="${w}" height="${h - 2 * ry}" fill="#fff"/>
    <ellipse cx="${w / 2}" cy="${ry}" rx="${w / 2}" ry="${ry}" fill="#fff"/>
    <ellipse cx="${w / 2}" cy="${h - ry}" rx="${w / 2}" ry="${ry}" fill="#fff"/></svg>`);
  const rx = w * 0.415, rr = ry * 0.83, cy = ry * 1.04, cx = w / 2;
  const lid = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.45" stop-color="#b9bec4"/><stop offset="1" stop-color="#7d838a"/></linearGradient>
    <linearGradient id="pan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9cdd2"/><stop offset="0.6" stop-color="#a3a9b0"/><stop offset="1" stop-color="#d7dbdf"/></linearGradient>
    <linearGradient id="tab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa0a7"/><stop offset="0.5" stop-color="#eef0f2"/><stop offset="1" stop-color="#9aa0a7"/></linearGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f757c"/><stop offset="0.3" stop-color="#d5d9dd"/><stop offset="0.7" stop-color="#9ba1a8"/><stop offset="1" stop-color="#60666d"/></linearGradient></defs>
    <ellipse cx="${cx}" cy="${ry}" rx="${w * 0.5}" ry="${ry}" fill="url(#sh)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx * 1.03}" ry="${rr * 1.05}" fill="#575c62"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rr}" fill="url(#rim)"/>
    <ellipse cx="${cx}" cy="${cy + rr * 0.06}" rx="${rx * 0.86}" ry="${rr * 0.84}" fill="url(#pan)" stroke="#7d838a" stroke-width="${Math.max(0.4, w * 0.006)}"/>
    <ellipse cx="${cx}" cy="${cy + rr * 0.08}" rx="${rx * 0.34}" ry="${rr * 0.3}" fill="url(#tab)" stroke="#80868d" stroke-width="${Math.max(0.3, w * 0.004)}"/>
    <ellipse cx="${cx}" cy="${cy - rr * 0.38}" rx="${rx * 0.2}" ry="${rr * 0.17}" fill="#5c6168"/>
    <ellipse cx="${cx - rx * 0.25}" cy="${cy - rr * 0.45}" rx="${rx * 0.5}" ry="${rr * 0.18}" fill="#fff" fill-opacity="0.35"/></svg>`);
  let img = sharp(raw.data).composite([{ input: mask, blend: "dest-in" }, { input: lid, blend: "over" }]);
  let buf = await img.png().toBuffer();
  if (blur > 0.3) buf = await sharp(buf).blur(blur).png().toBuffer();
  return { buf, w, h, ry };
}

// Spiegelung auf glänzendem Boden (nur dunkle Variante)
async function reflection(buf, w, h, opacity) {
  const rh = Math.round(h * 0.35);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${rh}"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${opacity}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#m)"/></svg>`);
  return sharp(buf).flip().extract({ left: 0, top: 0, width: w, height: rh }).blur(2)
    .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

// 24 Dosen als X: zwei Diagonalen mit je 12 Dosen, dicht an dicht wie echt aufgestellt
function xPositions() {
  const pts = [];
  const W = 1.55, ZC = 15.5, D = 2.6;
  for (let i = 0; i < 6; i++) {
    for (const sign of [-1, 1]) {
      const t = sign * (0.09 + i * 0.182);
      pts.push({ u: t * W, z: ZC + t * D });
      pts.push({ u: t * W, z: ZC - t * D });
    }
  }
  return pts;
}

async function render(handle) {
  const [file, color] = items[handle];
  const srcPath = path.join(SRC, `${file}.webp`);
  const layers = [];
  const cans = xPositions().sort((a, b) => b.z - a.z); // hinten zuerst
  const zMin = Math.min(...cans.map((c) => c.z));
  const zMax = Math.max(...cans.map((c) => c.z));
  for (const c of cans) {
    const p = project(c.u, c.z);
    const depth = (c.z - zMin) / (zMax - zMin); // 0 = vorne, 1 = hinten
    // Tiefenschärfe: hinten deutlich unscharf, wie bei offener Blende fotografiert
    const can = await cylinder(srcPath, Math.round(p.scale * 0.95), p.tilt, 1.6 + depth * 3.2);
    const dim = HELL ? 1 - depth * 0.06 : 0.78 - depth * 0.28;
    const buf = await sharp(can.buf).modulate({ brightness: dim }).png().toBuffer();
    const s = shadow(can.w, can.ry);
    const top = Math.round(p.y - can.h + can.ry);
    layers.push({ input: s.svg, left: Math.round(p.x - s.W / 2), top: Math.round(p.y - s.H / 2) });
    if (!HELL) layers.push({ input: await reflection(buf, can.w, can.h, 0.16), left: Math.round(p.x - can.w / 2), top: Math.round(p.y - can.ry) });
    layers.push({ input: buf, left: Math.round(p.x - can.w / 2), top });
  }
  // große Dose vorne, gestochen scharf
  const hero = await cylinder(srcPath, Math.round(SIZE * 0.6), 0.2);
  const heroBuf = await sharp(hero.buf).sharpen({ sigma: 0.7 }).png().toBuffer();
  const base = Math.round(SIZE * 0.93);
  const hs = shadow(hero.w, hero.ry);
  layers.push({ input: hs.svg, left: Math.round(SIZE / 2 - hs.W / 2), top: Math.round(base - hs.H / 2) });
  if (!HELL) layers.push({ input: await reflection(heroBuf, hero.w, hero.h, 0.22), left: Math.round(SIZE / 2 - hero.w / 2), top: Math.round(base - hero.ry) });
  layers.push({ input: heroBuf, left: Math.round(SIZE / 2 - hero.w / 2), top: Math.round(base - hero.h + hero.ry) });
  const out = path.join(OUT, `${handle}-x.webp`);
  await sharp(background(color)).composite(layers).webp({ quality: 90 }).toFile(out);
  console.log("ok", out);
}

const wanted = args.filter((a) => !a.startsWith("--"));
for (const h of wanted.length ? wanted : Object.keys(items)) await render(h);
