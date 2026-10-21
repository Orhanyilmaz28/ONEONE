// Erzeugt public/dosen-foto/<handle>-ansichten.webp: Vorder-, Rück- und Seitenansicht nebeneinander
// auf der dunklen Shop-Kachel (wie make-dosen-fotos.mjs). Quellen: scripts/dosen-quellen/<datei>-frei.webp (vorne),
// <handle>-hinten.webp und <handle>-seite.webp – freigestellt aus den 3D-Ansichten des Herstellers.
// Aufruf: node scripts/make-dosen-ansichten.mjs
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve(import.meta.dirname, "dosen-quellen");
const OUT = path.resolve(import.meta.dirname, "../public/dosen-foto");
const SIZE = 1200;

// handle → [Quelle Vorderseite, Glow-Farbe] (wie in make-dosen-fotos.mjs)
const items = {
  "ice-coffee-latte": ["ice-coffee-latte-frei", "#e3c9a3"],
  "ice-coffee-cappuccino": ["ice-coffee-cappuccino-frei", "#c69c6d"],
};

function background(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <defs><radialGradient id="g" cx="50%" cy="46%" r="52%"><stop offset="0" stop-color="${color}" stop-opacity="0.45"/><stop offset="0.6" stop-color="${color}" stop-opacity="0.1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="#0a0a0a"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return Buffer.from(svg);
}

for (const [handle, [front, color]] of Object.entries(items)) {
  // Dosen so hoch, dass alle drei im mittleren 4:5-Ausschnitt der Galerie Platz haben
  const height = Math.round(SIZE * 0.54);
  const cans = await Promise.all(
    [front, `${handle}-hinten`, `${handle}-seite`].map((f) => sharp(path.join(SRC, `${f}.webp`)).resize({ height }).toBuffer({ resolveWithObject: true })),
  );
  const gap = 30;
  const total = cans.reduce((a, c) => a + c.info.width, 0) + gap * (cans.length - 1);
  let x = (SIZE - total) / 2;
  const layers = cans.map((c) => {
    const layer = { input: c.data, left: Math.round(x), top: Math.round((SIZE - c.info.height) / 2) };
    x += c.info.width + gap;
    return layer;
  });
  await sharp(background(color)).composite(layers).webp({ quality: 88 }).toFile(path.join(OUT, `${handle}-ansichten.webp`));
  console.log("ok", handle, Math.round(total), "px breit");
}
