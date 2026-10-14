// Erzeugt je Sorte ein Bild „24er Tray“ (bzw. 12er bei Wasser) aus den freigestellten Dosen in public/dosen-foto/frei
// Aufruf: node scripts/make-trays.mjs [handle …]   → public/dosen-foto/tray/<handle>.webp
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "public/dosen-foto/frei";
const OUT = "public/dosen-foto/tray";
const W = 1200;
const H = 900;

async function tray(handle) {
  const water = handle.startsWith("wasser");
  const cols = water ? 4 : 6;
  const rows = water ? 3 : 4;
  const src = path.join(SRC, `${handle}.webp`);
  const meta = await sharp(src).metadata();
  const ratio = meta.height / meta.width;
  const front = water ? 175 : 132; // Dosenbreite vorne
  const layers = [];
  const placed = [];
  for (let r = 0; r < rows; r++) {
    const s = 1 - (rows - 1 - r) * 0.055; // hinten etwas kleiner
    const w = Math.round(front * s);
    const h = Math.round(w * ratio);
    const gap = Math.round(w * 0.02);
    const rowW = cols * w + (cols - 1) * gap;
    const x0 = Math.round((W - rowW) / 2 + (rows - 1 - r) * 16); // leicht versetzt → Tiefe
    const bottom = H - 120 - (rows - 1 - r) * Math.round(h * 0.2);
    const can = await sharp(src).resize(w, h).modulate({ brightness: 0.82 + r * 0.06 }).png().toBuffer();
    for (let c = 0; c < cols; c++) {
      layers.push({ input: can, left: x0 + c * (w + gap), top: bottom - h });
    }
    placed.push({ x0, rowW, bottom, h, w });
  }
  const fr = placed[rows - 1];
  const bk = placed[0];
  const left = Math.min(fr.x0, bk.x0) - 14;
  const right = Math.max(fr.x0 + fr.rowW, bk.x0 + bk.rowW) + 14;
  const top = bk.bottom - bk.h - 18;
  const wallH = water ? 0 : Math.round(fr.h * 0.2);
  // Karton-Tray (nur Dosen) und Schrumpffolie mit Glanz
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79a63"/><stop offset="1" stop-color="#8e6538"/></linearGradient>
      <linearGradient id="film" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.03"/>
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#fff" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${wallH ? `<path d="M ${fr.x0 - 10} ${fr.bottom - wallH} L ${fr.x0 + fr.rowW + 10} ${fr.bottom - wallH} L ${fr.x0 + fr.rowW + 10} ${fr.bottom + 6} L ${fr.x0 - 10} ${fr.bottom + 6} Z" fill="url(#card)"/>
    <path d="M ${fr.x0 + fr.rowW + 10} ${fr.bottom - wallH} L ${bk.x0 + bk.rowW + 12} ${bk.bottom - Math.round(bk.h * 0.2)} L ${bk.x0 + bk.rowW + 12} ${bk.bottom} L ${fr.x0 + fr.rowW + 10} ${fr.bottom + 6} Z" fill="#7a552c"/>
    <rect x="${fr.x0 - 10}" y="${fr.bottom - wallH}" width="${fr.rowW + 20}" height="5" fill="#d9b07a" opacity="0.8"/>
    <text x="${W / 2}" y="${fr.bottom - wallH / 2 + 8}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="${Math.round(wallH * 0.36)}" fill="#3a2610" opacity="0.55" letter-spacing="6">24 × 250 ml</text>` : ""}
    <path d="M ${left} ${top + 30} Q ${left} ${top} ${left + 30} ${top} L ${right - 30} ${top} Q ${right} ${top} ${right} ${top + 30} L ${right} ${fr.bottom + 4} L ${left} ${fr.bottom + 4} Z" fill="url(#film)" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/>
    <path d="M ${left + 40} ${top + 26} L ${right - 160} ${top + 26}" stroke="#fff" stroke-opacity="0.22" stroke-width="4" stroke-linecap="round"/>
    <path d="M ${right - 26} ${top + 60} L ${right - 26} ${fr.bottom - 60}" stroke="#fff" stroke-opacity="0.18" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
  const shadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${W / 2}" cy="${fr.bottom + 8}" rx="${(right - left) / 1.7}" ry="34" fill="url(#g)"/></svg>`;
  fs.mkdirSync(OUT, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(shadow) }, ...layers, { input: Buffer.from(overlay) }])
    .trim({ threshold: 1 })
    .webp({ quality: 86 })
    .toFile(path.join(OUT, `${handle}.webp`));
  console.log("✓", handle);
}

const wanted = process.argv.slice(2);
const all = fs.readdirSync(SRC).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, ""));
for (const h of wanted.length ? wanted : all) await tray(h);
