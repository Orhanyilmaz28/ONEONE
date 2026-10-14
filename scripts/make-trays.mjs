// Erzeugt je Sorte ein Bild „Tray“ im Stil des EXSTASE-Produktfotos: eine Dose groß vorne, dahinter der schwarze
// Karton mit allen Dosen (24 × 250 ml, Wasser 12 × 500 ml) – zusammengesetzt aus public/dosen-foto/frei/<handle>.webp.
// Aufruf: node scripts/make-trays.mjs [handle …]   → public/dosen-foto/tray/<handle>.webp
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "public/dosen-foto/frei";
const OUT = "public/dosen-foto/tray";
const W = 1150;
const H = 1000;

// Offizielles Logo (Pfade aus components/logo-official.ts)
const logoSrc = fs.readFileSync("components/logo-official.ts", "utf8");
const grab = (name) => logoSrc.match(new RegExp(`${name} = "([^"]+)"`))[1];
const LOGO = { burst: grab("LOGO_BURST"), word: grab("LOGO_WORD"), tagline: grab("LOGO_TAGLINE"), green: grab("LOGO_GREEN") };

const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
const pts = (...ps) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

async function tray(handle) {
  const water = handle.startsWith("wasser");
  const cols = water ? 4 : 6;
  const rows = water ? 3 : 4;
  const src = path.join(SRC, `${handle}.webp`);
  const meta = await sharp(src).metadata();
  const ratio = meta.height / meta.width;

  // Schräge Ansicht von vorne links oben
  const w = water ? 96 : 74; // Dosenbreite im Karton
  const colV = water ? [100, -12] : [77, -9];
  const rowV = water ? [46, -62] : [36, -50];
  const h = Math.round(w * ratio);
  const O = [380, 880];
  const T = Math.round(h * (water ? 0.32 : 0.5)); // Kartonhöhe
  const pad = 6;
  const A = add(add(O, colV, -pad / 80), rowV, -pad / 60); // vorne links
  const B = add(A, colV, cols + 0.15);
  const D = add(A, rowV, rows + 0.15);
  const C = add(B, rowV, rows + 0.15);
  const up = (p) => [p[0], p[1] - T];

  // Dosen im Karton: hinten zuerst, in jeder Reihe rechts zuerst
  const small = await sharp(src).resize(w, h).png().toBuffer();
  const darker = await sharp(src).resize(w, h).modulate({ brightness: 0.8 }).png().toBuffer();
  const darkest = await sharp(src).resize(w, h).modulate({ brightness: 0.62 }).png().toBuffer();
  const cans = [];
  const lids = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const base = add(add(O, colV, c + 0.5), rowV, r + 0.5);
      cans.push({ input: r === 0 ? small : r < rows - 1 ? darker : darkest, left: Math.round(base[0] - w / 2), top: Math.round(base[1] - h) });
      if (!water) lids.push(base);
    }
  }
  const lidSvg = (base) => {
    const cx = base[0];
    const cy = base[1] - h + w * 0.1;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2 - 1}" ry="${w * 0.17}" fill="url(#lid)"/><ellipse cx="${cx}" cy="${cy}" rx="${w / 2 - 6}" ry="${w * 0.13}" fill="none" stroke="#8a8f96" stroke-width="2"/><ellipse cx="${cx + w * 0.08}" cy="${cy - w * 0.02}" rx="${w * 0.13}" ry="${w * 0.05}" fill="#6d7278"/>`;
  };

  // Karton: Innenwände und Boden (hinter den Dosen)
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${(A[0] + B[0]) / 2}" cy="${A[1] + 6}" rx="${(B[0] - A[0]) * 0.62}" ry="36" fill="url(#sh)"/>
    <polygon points="${pts(A, B, C, D)}" fill="#0c0c0c"/>
    <polygon points="${pts(D, C, up(C), up(D))}" fill="#202020"/>
    <polygon points="${pts(B, C, up(C), up(B))}" fill="#1a1a1a"/>
  </svg>`;

  // Karton: Außenwände vorne und links mit Logo (vor den Dosen)
  const colLen = Math.hypot(...colV);
  const ux = [colV[0] / colLen, colV[1] / colLen];
  const s = (T * 0.82) / 162;
  const logoAt = add(A, colV, water ? 1.3 : 2.4);
  const lx = logoAt[0];
  const ly = logoAt[1] - T * 0.89;
  const rowLen = Math.hypot(...rowV);
  const rx = [rowV[0] / rowLen, rowV[1] / rowLen];
  const sideAt = add(A, rowV, rows * 0.35);
  const outer = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2b2b"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient>
      <linearGradient id="side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a3a"/><stop offset="1" stop-color="#151515"/></linearGradient>
      <linearGradient id="lid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f4f6"/><stop offset="0.5" stop-color="#b9bec4"/><stop offset="1" stop-color="#e3e6e9"/></linearGradient>
    </defs>
    ${lids.map(lidSvg).join("")}
    <polygon points="${pts(A, D, up(D), up(A))}" fill="url(#side)"/>
    <polygon points="${pts(A, B, up(B), up(A))}" fill="url(#front)"/>
    <polyline points="${pts(up(D), up(A), up(B))}" fill="none" stroke="#6a6a6a" stroke-width="4"/>
    <polyline points="${pts(up(B), up(C), up(D))}" fill="none" stroke="#3a3a3a" stroke-width="3"/>
    <g transform="matrix(${ux[0] * s},${ux[1] * s},0,${s},${lx},${ly})">
      <path d="${LOGO.burst}" fill="${LOGO.green}"/><path d="${LOGO.word}" fill="#fff"/><path d="${LOGO.tagline}" fill="${LOGO.green}"/>
    </g>
    <g transform="matrix(${rx[0]},${rx[1]},0,1,${sideAt[0]},${sideAt[1] - T * 0.35})">
      <text font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(T * 0.17)}" fill="#bdbdbd" letter-spacing="2">exstase.com</text>
    </g>
  </svg>`;

  // Große Dose vorne links
  const bigH = Math.round(h * (water ? 2.3 : 2.75));
  const bigW = Math.round(bigH / ratio);
  const big = await sharp(src).resize(bigW, bigH).png().toBuffer();
  const bigLeft = Math.round(A[0] - bigW * 0.45);
  const bigTop = Math.round(A[1] + 70 - bigH);
  const bigShadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${bigLeft + bigW / 2}" cy="${bigTop + bigH - 4}" rx="${bigW * 0.75}" ry="26" fill="url(#g)"/></svg>`;

  fs.mkdirSync(OUT, { recursive: true });
  const full = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(inner) }, ...cans, { input: Buffer.from(outer) }, { input: Buffer.from(bigShadow) }, { input: big, left: Math.max(0, bigLeft), top: Math.max(0, bigTop) }])
    .png()
    .toBuffer();
  // Leerraum abschneiden (nach dem Zusammensetzen), etwas Rand lassen
  await sharp(full)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(path.join(OUT, `${handle}.webp`));
  console.log("✓", handle);
}

const wanted = process.argv.slice(2);
const all = fs.readdirSync(SRC).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, ""));
for (const h of wanted.length ? wanted : all) await tray(h);
