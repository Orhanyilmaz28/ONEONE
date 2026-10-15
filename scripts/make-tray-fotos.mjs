// Tray-Fotos je Sorte aus dem echten Classic-Foto (scripts/tray-vorlage.webp, 750 × 563, weißer Hintergrund).
// Licht, Deckel, Karton und Schatten bleiben echt; ausgetauscht werden nur die sichtbaren Dosenkörper
// (freigestellte Dosenfotos aus public/dosen-foto/frei) und der Sortenaufdruck auf dem Karton.
//
//   node scripts/make-tray-fotos.mjs                    → alle Sorten nach public/dosen-foto/tray-foto
//   node scripts/make-tray-fotos.mjs tropical latte …   → nur diese Sorten
//   OUT=/pfad node scripts/make-tray-fotos.mjs …         → anderes Zielverzeichnis
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const TEMPLATE = `${ROOT}scripts/tray-vorlage.webp`;
const OUT = process.env.OUT || `${ROOT}public/dosen-foto/tray-foto`;

/* ───────── Sorten ───────── */

const ENERGY = { word: "ENERGY" };
const COFFEE = { word: "ICE COFFEE" };
const TEA = { word: "ICE TEA" };
/** Handle → Name auf dem Karton, Farbe (wie SORT_COLORS in lib/pack-contents.ts), Zeile darunter */
const SORTS = {
  tropical: { name: "tropical", color: "#1fb6ff", ...ENERGY },
  "kiwi-lemon": { name: "kiwi lemon", color: "#ffd400", ...ENERGY },
  watermelon: { name: "watermelon", color: "#ff2d95", ...ENERGY },
  "white-peach": { name: "white peach", color: "#ffb4a2", ...ENERGY },
  "ice-bonbon": { name: "ice bonbon", color: "#7fd4ff", ...ENERGY },
  lime: { name: "lime", color: "#c6f03c", ...ENERGY },
  "blueberry-coconut": { name: "blueberry coconut", color: "#8c6cff", ...ENERGY },
  "dragonfruit-lychee": { name: "dragonfruit lychee", color: "#e0407f", ...ENERGY },
  cactus: { name: "cactus", color: "#4caf50", ...ENERGY },
  "ice-coffee-latte": { name: "latte", color: "#e3c9a3", ...COFFEE },
  "ice-coffee-cappuccino": { name: "cappuccino", color: "#c69c6d", ...COFFEE },
  "ice-coffee-caramel": { name: "caramel", color: "#e8892b", ...COFFEE },
  "ice-coffee-espresso": { name: "espresso", color: "#c08a5f", ...COFFEE },
  "ice-coffee-vanille": { name: "vanille", color: "#f0d28a", ...COFFEE },
  "xtea-peach": { name: "peach", color: "#ffa36c", ...TEA },
  "xtea-lemon": { name: "lemon", color: "#ffe14d", ...TEA },
  "xtea-watermelon": { name: "watermelon", color: "#ff5c8a", ...TEA },
};

/* ───────── Vermessung der Vorlage (Pixel im Original) ───────── */

/** Vordere Reihe: linke/rechte Kante, Oberkante Deckel, Unterkante Deckelrand (Mitte) – linear von links nach rechts */
const FRONT = Array.from({ length: 6 }, (_, i) => ({
  l: [80, 175, 270, 367, 465, 565][i],
  r: [171, 267, 362, 460, 560, 660][i],
  top: 129 + i * 6.4,
  rim: 164.5 + i * 7.5,
}));
/** Rechte Seitenreihe (2.–4. Reihe): nur der Streifen rechts neben der Dose davor ist sichtbar */
const SIDE = [
  { l: 580, r: 672, top: 125, rim: 165, from: 661, to: 672 },
  { l: 599, r: 685, top: 92, rim: 127, from: 673, to: 685 },
  { l: 611, r: 692, top: 70, rim: 95, from: 686, to: 692 },
];
/** Oberkante der Kartonfront (Gerade) */
const cartonEdge = (x) => 301 + (x - 55) * 0.087;
/** Innenkante der rechten Kartonwand: von (700, 200) nach (657, 340) – darunter ist die Wand */
const wallYAt = (x) => 200 + ((700 - x) * 140) / 43;
/**
 * Lage des Dosenfotos auf der Dose (Einheiten: Dosenfoto auf 181 px Breite normiert): Zeile ANCHOR_ROW (Oberkante
 * „classic“) liegt ANCHOR_Y unter dem Deckelrand; das Foto ist im Tray etwas größer abgebildet (ZOOM_*), Hals bleibt frei.
 */
const TEX = { anchorRow: 38, anchorY: 33.4, zoomX: 1.16, zoomY: 1.3, shift: -0.015, neck: 13 };
/** Sortenname auf dem Karton: rechtsbündig bis x, Grundlinie dort, Steigung, Schriftgröße, Streckung */
const NAME = { right: 632, base: 370, slope: 0.06, size: 25, stretch: 1.36, minLeft: 345 };
/** „classic“-Schriftzug (wird entfernt): Viereck um den Text */
const NAME_BOX = [
  [500, 338],
  [638, 346],
  [638, 377],
  [500, 369],
];
/** „ENERGY“-Zeile */
const WORD = { left: 477, base: 451, slope: 0.075, size: 25, stretch: 1.4, maxRight: 628 };
const WORD_BOX = [
  [470, 426],
  [634, 436],
  [634, 468],
  [470, 457],
];
/** Grün des Classic-Aufdrucks (Burst, Schrift) */
const LIME = [182, 230, 62];

/* ───────── Hilfsfunktionen ───────── */

const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Anteil des Lime-Grüns in einem Pixel (0 = kein Grün) – über den Farbanteil, damit Weiß/Schwarz unberührt bleiben */
const LIME_CHROMA = LIME.map((v) => v - Math.min(...LIME));
const LIME_N2 = LIME_CHROMA.reduce((n, v) => n + v * v, 0);
function limeAmount(r, g, b) {
  const m = Math.min(r, g, b);
  const c = [r - m, g - m, b - m];
  const len = Math.hypot(...c);
  if (len < 6) return 0;
  const dot = c[0] * LIME_CHROMA[0] + c[1] * LIME_CHROMA[1] + c[2] * LIME_CHROMA[2];
  const cos = dot / (len * Math.sqrt(LIME_N2));
  return clamp(dot / LIME_N2, 0, 1.3) * clamp((cos - 0.8) / 0.12);
}

/** Dosenfoto auf ~Zielbreite bringen (RGBA roh) */
async function loadCan(handle, width) {
  const { data, info } = await sharp(`${ROOT}public/dosen-foto/frei/${handle}.webp`)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({ width, kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function sample(can, x, y) {
  if (x < 0 || y < 0 || x > can.w - 1 || y > can.h - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, can.w - 1);
  const y1 = Math.min(y0 + 1, can.h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [px, py, wt] of [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ]) {
    const i = (py * can.w + px) * 4;
    const a = can.data[i + 3] / 255;
    out[0] += can.data[i] * a * wt;
    out[1] += can.data[i + 1] * a * wt;
    out[2] += can.data[i + 2] * a * wt;
    out[3] += a * wt;
  }
  if (out[3] > 0) for (let k = 0; k < 3; k++) out[k] /= out[3];
  return out;
}

/**
 * Dosenkörper perspektivisch auf eine Dose der Vorlage legen: Zylinder von schräg oben – waagerecht über den Drehwinkel
 * (Rand bleibt Rand), senkrecht gestaucht und je Spalte um die Ellipse des Deckelrands nach unten versetzt.
 */
function paintCan(img, W, can, d, { from = d.l, to = d.r, shade = 1, clipY }) {
  const a = (d.r - d.l) / 2;
  const cx = (d.l + d.r) / 2;
  const b = (d.rim - d.top) / 2;
  const cy = (d.top + d.rim) / 2;
  const sx = (d.r - d.l) / can.w;
  const tilt = Math.sqrt(1 - (b / a) ** 2);
  const sy = sx * tilt * TEX.zoomY;
  const unit = (d.r - d.l) / 181;
  const k = can.w / 181;
  for (let x = Math.floor(Math.max(from, d.l)); x <= Math.ceil(Math.min(to, d.r)); x++) {
    const u = clamp((x + 0.5 - cx) / a, -1, 1);
    const theta = (Math.asin(u) - TEX.shift * 2) / TEX.zoomX;
    const col = ((Math.sin(theta) + 1) / 2) * (can.w - 1);
    const arc = cy + b * Math.sqrt(1 - u * u);
    const anchor = arc + TEX.anchorY * unit;
    const yStart = arc + TEX.neck * unit;
    const colCov = clamp(Math.min(x + 1 - Math.max(from, d.l), Math.min(to, d.r) - x));
    for (let y = Math.floor(yStart); y < img.length / 3 / W; y++) {
      const limit = clipY(x + 0.5);
      if (y > limit + 1) break;
      const yy = y + 0.5;
      const src = sample(can, col, TEX.anchorRow * k + (yy - anchor) / sy);
      let alpha = (src[3] > 0 ? 1 : 0) * colCov * clamp(limit - y) * clamp(yy - yStart + 0.5);
      if (alpha <= 0) continue;
      // etwas Schatten am Karton und an den Seiten der hinteren Dosen
      const ao = 1 - 0.32 * clamp(1 - (limit - y) / 16);
      const f = shade * ao;
      const i = (y * W + x) * 3;
      alpha = clamp(alpha);
      for (let c = 0; c < 3; c++) img[i + c] = img[i + c] * (1 - alpha) + src[c] * f * alpha;
    }
  }
}

/** Lime-Aufdruck in einem Bereich entfernen: Schriftpixel (+1 px Rand) zeilenweise aus dem Karton links/rechts davon auffüllen */
function eraseLime(img, W, poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const hit = (x, y) => {
    const i = (y * W + x) * 3;
    return inPoly(x + 0.5, y + 0.5, poly) && limeAmount(img[i], img[i + 1], img[i + 2]) > 0.04;
  };
  const mask = new Set();
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (hit(x, y)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask.add((y + dy) * W + x + dx);
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!mask.has(y * W + x)) continue;
      let e = x;
      while (mask.has(y * W + e + 1)) e++;
      const L = (y * W + x - 1) * 3;
      const R = (y * W + e + 1) * 3;
      for (let k = x; k <= e; k++) {
        const f = (k - x + 1) / (e - x + 2);
        for (let c = 0; c < 3; c++) img[(y * W + k) * 3 + c] = img[L + c] * (1 - f) + img[R + c] * f;
      }
      x = e;
    }
  }
}

/** Lime-Grün im ganzen Bild in die Sortenfarbe umfärben (Helligkeitsverlauf und Kantenglättung bleiben) */
function recolorLime(img, color) {
  for (let i = 0; i < img.length; i += 3) {
    const t = limeAmount(img[i], img[i + 1], img[i + 2]);
    if (!t) continue;
    for (let k = 0; k < 3; k++) img[i + k] += t * (color[k] - LIME[k]);
  }
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Schrift über SVG, gerade gesetzt und dann der Kartonschräge angepasst (Zeile steigt nach rechts ab) */
async function textLayer(W, H, { text, color, weight, size, stretch, slope, x, base, anchor, maxWidth }) {
  // Breite grob abschätzen und bei langen Namen die Schrift verkleinern
  const probe = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="200"><text x="0" y="100" font-family="Liberation Sans" font-weight="${weight}" font-size="${size}">${esc(text)}</text></svg>`))
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  const natural = probe.info.width * stretch;
  const fit = maxWidth && natural > maxWidth ? maxWidth / natural : 1;
  const s = size * fit;
  const width = natural * fit;
  const left = anchor === "end" ? x - width : x;
  // Grundlinie läuft durch (x, base)
  const y0 = anchor === "end" ? base - slope * width : base;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <g transform="matrix(${stretch} ${slope * stretch} 0 1 ${left} ${y0})">
      <text x="0" y="0" fill="${color}" font-family="Liberation Sans" font-weight="${weight}" font-size="${s.toFixed(2)}">${esc(text)}</text>
    </g></svg>`;
  return { svg: Buffer.from(svg), size: s };
}

/** Weißen Hintergrund vom Rand her freistellen (Flood-Fill), Kante weich auslaufen lassen */
function cutout(rgb, w, h) {
  const data = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    data[p * 4] = rgb[p * 3];
    data[p * 4 + 1] = rgb[p * 3 + 1];
    data[p * 4 + 2] = rgb[p * 3 + 2];
    data[p * 4 + 3] = 255;
  }
  const bg = (i) => data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !bg(p * 4)) continue;
    seen[p] = 1;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    const x = p % w;
    const y = (p - x) / w;
    const n = [x > 0 && seen[p - 1], x < w - 1 && seen[p + 1], y > 0 && seen[p - w], y < h - 1 && seen[p + w]].filter(Boolean).length;
    if (n) {
      const i = p * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 180) data[i + 3] = Math.round(255 * (1 - n / 5));
    }
  }
  return data;
}

/* ───────── Erzeugen ───────── */

const { data: base, info } = await sharp(TEMPLATE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const handles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SORTS);
mkdirSync(OUT, { recursive: true });

for (const handle of handles) {
  const sort = SORTS[handle] ?? (handle === "classic" ? { name: "classic", color: "#b6e63e", word: "ENERGY" } : null);
  if (!sort) throw new Error(`Unbekannte Sorte: ${handle}`);
  const img = Float32Array.from(base);
  const color = hex(sort.color);

  // 1. Karton: alten Sortennamen (und ggf. „ENERGY“) entfernen, übriges Grün umfärben
  eraseLime(img, W, NAME_BOX);
  if (sort.word !== "ENERGY") eraseLime(img, W, WORD_BOX);
  recolorLime(img, color);

  // 2. Dosenkörper: erst die Streifen der rechten Seitenreihe, dann die vordere Reihe
  const can = await loadCan(handle, 96);
  for (const d of SIDE) paintCan(img, W, can, d, { from: d.from, to: d.to, shade: 0.62, clipY: (x) => Math.min(cartonEdge(x), wallYAt(x)) });
  for (const d of FRONT) paintCan(img, W, can, d, { clipY: cartonEdge });

  // 3. Neuer Aufdruck
  const layers = [];
  const name = await textLayer(W, H, { text: sort.name, color: sort.color, weight: 700, size: NAME.size, stretch: NAME.stretch, slope: NAME.slope, x: NAME.right, base: NAME.base, anchor: "end", maxWidth: NAME.right - NAME.minLeft });
  layers.push({ input: name.svg, left: 0, top: 0 });
  if (sort.word !== "ENERGY") {
    const word = await textLayer(W, H, { text: sort.word, color: sort.color, weight: 400, size: WORD.size, stretch: WORD.stretch, slope: WORD.slope, x: WORD.left, base: WORD.base, anchor: "start", maxWidth: WORD.maxRight - WORD.left });
    layers.push({ input: word.svg, left: 0, top: 0 });
  }

  const rgb = Buffer.from(Uint8ClampedArray.from(img));
  const printed = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).composite(layers).removeAlpha().raw().toBuffer();
  const rgba = cutout(printed, W, H);
  const file = `${OUT}/${handle}.webp`;
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(file);
  console.log("ok", file);
}
