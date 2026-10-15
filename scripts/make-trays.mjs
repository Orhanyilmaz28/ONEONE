// Tray-Bild je Sorte: eine Dose groß vorne links, dahinter der schwarze EXSTASE-Karton mit 24 Dosen
// (6 nebeneinander, 4 Reihen nach hinten), Kamera von vorne leicht oben – passend zu den frontalen Dosenfotos.
// Aufruf: node scripts/make-trays.mjs [handle …]   → public/dosen-foto/tray/<handle>.webp
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "public/dosen-foto/frei";
const OUT = "public/dosen-foto/tray";
const W = 1400;
const H = 1100;

const logoSrc = fs.readFileSync("components/logo-official.ts", "utf8");
const grab = (n) => logoSrc.match(new RegExp(`${n} = "([^"]+)"`))[1];
const LOGO = { burst: grab("LOGO_BURST"), word: grab("LOGO_WORD"), tagline: grab("LOGO_TAGLINE") };

async function tray(handle) {
  const src = path.join(SRC, `${handle}.webp`);
  const meta = await sharp(src).metadata();
  const ratio = meta.height / meta.width;
  const cols = 6;
  const rows = 4;
  const w0 = 118; // Dosenbreite vorderste Reihe
  const cx = 820; // Mitte des Kartons
  const baseY = 960; // Boden vorderste Reihe
  const step = 0.42; // sichtbarer Reihenabstand (Anteil der Dosenbreite)

  const rowGeo = Array.from({ length: rows }, (_, r) => {
    const s = 1 / (1 + r * 0.075);
    const w = Math.round(w0 * s);
    const h = Math.round(w * ratio);
    const y = Math.round(baseY - r * w0 * step * s);
    const pitch = w * 1.01;
    return { r, s, w, h, y, pitch, x0: cx - (cols / 2) * pitch };
  });

  // Dosen (hinten zuerst), hintere Reihen etwas dunkler (Schatten im Karton)
  const layers = [];
  const lids = [];
  for (const g of [...rowGeo].reverse()) {
    const img = await sharp(src).resize(g.w, g.h).modulate({ brightness: 1 - g.r * 0.1 }).png().toBuffer();
    for (let c = 0; c < cols; c++) {
      const left = Math.round(g.x0 + c * g.pitch);
      layers.push({ input: img, left, top: g.y - g.h });
      lids.push({ r: g.r, cx: left + g.w / 2, cy: g.y - g.h + g.w * 0.06, rx: g.w / 2 - 1, ry: g.w * 0.2 });
    }
  }
  // Deckel als eigene Ebene je Reihe, damit vordere Dosen die hinteren Deckel überdecken
  const lidSvg = (l) =>
    `<ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}" fill="url(#lid)"/><ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx * 0.84}" ry="${l.ry * 0.8}" fill="none" stroke="#9aa0a6" stroke-width="2"/><ellipse cx="${l.cx + l.rx * 0.18}" cy="${l.cy - l.ry * 0.05}" rx="${l.rx * 0.28}" ry="${l.ry * 0.3}" fill="#7b8087"/>`;
  const svgLayer = (inner) => ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="lid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="0.55" stop-color="#b6bcc3"/><stop offset="1" stop-color="#e6e9ec"/></linearGradient></defs>${inner}</svg>`) });
  // Ebenen pro Reihe zusammensetzen: Dosen der Reihe, dann ihre Deckel
  const ordered = [];
  for (const g of [...rowGeo].reverse()) {
    ordered.push(...layers.filter((l) => l.top === g.y - g.h));
    ordered.push(svgLayer(lids.filter((l) => l.r === g.r).map(lidSvg).join("")));
  }

  // Karton
  const f = rowGeo[0];
  const b = rowGeo[rows - 1];
  const T = Math.round(f.h * 0.42); // Höhe Vorderwand
  const fl = f.x0 - 10;
  const fr = f.x0 + cols * f.pitch + 10;
  const bl = b.x0 - 8;
  const br = b.x0 + cols * b.pitch + 8;
  const bTop = b.y - Math.round(T * b.s) - 4;
  const back = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${cx}" cy="${baseY + 12}" rx="${(fr - fl) * 0.62}" ry="40" fill="url(#sh)"/>
    <polygon points="${bl},${b.y + 4} ${br},${b.y + 4} ${fr},${baseY + 6} ${fl},${baseY + 6}" fill="#0b0b0b"/>
    <polygon points="${bl},${bTop} ${br},${bTop} ${br},${b.y + 4} ${bl},${b.y + 4}" fill="#1c1c1c"/>
    <!-- Innenseiten der Seitenwände (liegen hinter den Dosen) -->
    <polygon points="${fl},${baseY - T} ${bl},${bTop} ${bl},${b.y + 4} ${fl},${baseY + 6}" fill="#202020"/>
    <polygon points="${fr},${baseY - T} ${br},${bTop} ${br},${b.y + 4} ${fr},${baseY + 6}" fill="#181818"/>
    <polyline points="${fl},${baseY - T} ${bl},${bTop} ${br},${bTop} ${fr},${baseY - T}" fill="none" stroke="#4a4a4a" stroke-width="3"/>
  </svg>`;
  const ls = (T * 0.74) / 162; // Logo-Maßstab (Logo 262 × 162)
  const logoW = 262 * ls;
  const front = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="fw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c2c"/><stop offset="0.25" stop-color="#151515"/><stop offset="1" stop-color="#070707"/></linearGradient>
      <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#262626"/><stop offset="1" stop-color="#111"/></linearGradient>
      <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect x="${fl}" y="${baseY - T}" width="${fr - fl}" height="${T + 6}" fill="url(#fw)"/>
    <rect x="${fl}" y="${baseY - T}" width="${fr - fl}" height="${T + 6}" fill="url(#gloss)"/>
    <line x1="${fl}" y1="${baseY - T}" x2="${fr}" y2="${baseY - T}" stroke="#5c5c5c" stroke-width="3"/>
    <g transform="translate(${fr - logoW - T * 0.35} ${baseY - T + T * 0.12}) scale(${ls})">
      <path d="${LOGO.burst}" fill="#e9e9e9"/><path d="${LOGO.word}" fill="#fff"/><path d="${LOGO.tagline}" fill="#cfcfcf"/>
    </g>
  </svg>`;

  // Große Dose vorne links
  const bigH = Math.round(f.h * 1.75);
  const bigW = Math.round(bigH / ratio);
  const big = await sharp(src).resize(bigW, bigH).png().toBuffer();
  const bigLeft = Math.round(fl - bigW * 0.45);
  const bigBottom = baseY + 70;
  const bigShadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.65"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${bigLeft + bigW / 2}" cy="${bigBottom - 4}" rx="${bigW * 0.8}" ry="24" fill="url(#g)"/></svg>`;

  fs.mkdirSync(OUT, { recursive: true });
  const full = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(back) }, ...ordered, { input: Buffer.from(front) }, { input: Buffer.from(bigShadow) }, { input: big, left: bigLeft, top: bigBottom - bigH }])
    .png()
    .toBuffer();
  await sharp(full)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 })
    .toFile(path.join(OUT, `${handle}.webp`));
  console.log("✓", handle);
}

const wanted = process.argv.slice(2);
const all = fs.readdirSync(SRC).filter((f) => f.endsWith(".webp") && !f.startsWith("wasser")).map((f) => f.replace(/\.webp$/, ""));
for (const h of wanted.length ? wanted : all) await tray(h);
