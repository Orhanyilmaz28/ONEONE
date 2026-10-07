// Katalog EXSTASE Energy – schreibt data/products.json und die Dosen-Grafiken in public/dosen/.
// ⚠️ Preise sind Vorschläge. Koffein, Zutaten, Allergene und Nährwerte trägst du im Dashboard (Produkte → Zutaten & Nährwerte) nach dem Etikett ein.
// Wenn echte Produktfotos vorliegen: in public/produkte/ ablegen und in data/products.json (images[].src) eintragen
// oder im Dashboard unter Produkte → Inhalt ändern. Dieses Skript überschreibt data/products.json!
// Ausführen mit: node scripts/seed-data.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const BRAND = "EXSTASE Energy";

// ── Energy-Sorten (nach den Dosen-Fotos des Betreibers: Classic, Tropical, Kiwi & Lemon, Zero) ────────────────────────────────────
const DARK = "#0d0d0d";
const ENERGY = [
  { handle: "classic", name: "Classic", sub: "Der Klassiker", label: "classic", body: DARK, text: "#fff", accent: "#8dc63f", ml: 250, featured: true, intro: "Der Klassiker unter den EXSTASE-Sorten: kräftig, erfrischend und mit ordentlich Energie." },
  { handle: "tropical", name: "Tropical", sub: "Tropical Taste", label: "tropical taste", body: DARK, text: "#fff", accent: "#1ea7e1", ml: 250, featured: true, intro: "Exotisch-fruchtig und eiskalt: Tropical Taste bringt Urlaubsgefühl in die Dose." },
  { handle: "kiwi-lemon", name: "Kiwi & Lemon", sub: "Kiwi & Lemon Taste", label: "kiwi&lemon taste", body: DARK, text: "#fff", accent: "#ffd400", ml: 250, featured: true, intro: "Saftige Kiwi trifft auf frische Zitrone: spritzig, leicht säuerlich und richtig wach." },
  { handle: "zero", name: "Zero", sub: "Ohne Zucker", label: "zero", body: "#f4f4f4", text: DARK, accent: "#8dc63f", ml: 250, zero: true, featured: true, intro: "Voller EXSTASE-Geschmack ohne Zucker: Zero ist die leichte Wahl." },
];

// Packungsgrößen: Dosen, Preis in Cent (inkl. MwSt.; Pfand kommt an der Kasse separat dazu)
const PACKS = [
  { cans: 6, label: "6er Pack", price: 849 },
  { cans: 12, label: "12er Pack", price: 1599 },
  { cans: 24, label: "24er Pack", price: 2999 },
];

// ── Beschreibungen ──────────────────────────────────────────────────────────
const PFAND = `<h3>Pfand</h3>
<p>Auf jede Dose kommt <strong>0,25 € Einwegpfand</strong>. Es wird an der Kasse separat ausgewiesen und ist im Preis nicht enthalten.</p>`;

const energyDescription = (f) => `<p>${f.intro}</p>
<ul>
<li>Je Dose <strong>${f.ml} ml</strong> – gekühlt am besten</li>
${f.zero ? "<li><strong>Zero</strong> – ohne Zucker</li>" : ""}</ul>
<p><strong>Erhöhter Koffeingehalt. Für Kinder, schwangere und stillende Frauen nicht empfohlen.</strong> Nicht mit Alkohol mischen.</p>
${PFAND}`;

// ── Dosen-Grafik (SVG, 800 × 800) – angelehnt an das echte Dosen-Design ──────
/** Zackiger Splash */
function burst(cx, cy, r, color) {
  const pts = [];
  const spikes = 22;
  for (let i = 0; i < spikes * 2; i++) {
    const ang = (Math.PI * i) / spikes;
    const rad = i % 2 === 0 ? r * (0.75 + 0.25 * Math.abs(Math.sin(i * 1.7))) : r * 0.32;
    pts.push(`${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${color}"/>`;
}

const esc = (t) => t.replace(/&/g, "&amp;");
const W = 240;
const H = 560;
const BODY = `M10,60 Q10,40 40,34 H${W - 40} Q${W - 10},40 ${W - 10},60 V${H - 50} Q${W - 10},${H - 14} ${W - 40},${H - 8} H40 Q10,${H - 14} 10,${H - 50} Z`;

function defs(id) {
  return `<defs>
      <linearGradient id="b${id}" x1="0" x2="1">
        <stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset=".24" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".34" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
      </linearGradient>
      <linearGradient id="s${id}" x1="0" x2="1">
        <stop offset="0" stop-color="#8d8d99"/><stop offset=".35" stop-color="#f5f5f8"/><stop offset=".7" stop-color="#c7c7d1"/><stop offset="1" stop-color="#7f7f8b"/>
      </linearGradient>
      <clipPath id="c${id}"><path d="${BODY}"/></clipPath>
    </defs>`;
}

function rims(id) {
  return `<path d="${BODY}" fill="url(#b${id})"/>
    <path d="M10,60 Q10,40 40,34 H${W - 40} Q${W - 10},40 ${W - 10},60 L${W - 24},84 H24 Z" fill="url(#s${id})"/>
    <path d="M24,${H - 50} H${W - 24} L${W - 10},${H - 50} Q${W - 10},${H - 14} ${W - 40},${H - 8} H40 Q10,${H - 14} 10,${H - 50} Z" fill="url(#s${id})" opacity=".85"/>
    <rect x="${W / 2 - 34}" y="22" width="68" height="14" rx="7" fill="#d5d5de"/>`;
}

const shadow = `<ellipse cx="${W / 2}" cy="${H + 18}" rx="${W * 0.62}" ry="22" fill="#000" opacity=".4"/>`;

function energyCan({ x, y, scale = 1, f }) {
  const id = `${f.handle.replace(/\W/g, "")}${Math.round(x)}`;
  const dark = f.body === DARK;
  return `
  <g transform="translate(${x} ${y}) scale(${scale})">
    ${defs(id)}
    ${shadow}
    <path d="${BODY}" fill="${f.body}"/>
    <g clip-path="url(#c${id})">
      ${burst(W / 2, 400, 128, f.accent)}
      <text transform="translate(${W / 2 - 6} 330) rotate(-90)" text-anchor="middle" font-family="Arial Black, Helvetica, Arial, sans-serif" font-weight="900" font-size="82" letter-spacing="-3" fill="${f.text}">exstase</text>
      <text transform="translate(${W - 46} 290) rotate(-90)" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="22" fill="${dark ? f.accent : f.text}" opacity=".9">ENERGY</text>
      <text transform="translate(50 250) rotate(-90)" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${f.label.length > 14 ? 16 : f.label.length > 11 ? 19 : 23}" fill="${dark ? f.accent : f.text}">${esc(f.label)}</text>
      <text x="${W / 2}" y="${H - 26}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${f.text}" opacity=".85">${f.ml} ml</text>
    </g>
    ${rims(id)}
  </g>`;
}

function scene(cans, accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".62" r=".75"><stop offset="0" stop-color="${accent}" stop-opacity=".4"/><stop offset=".65" stop-color="${accent}" stop-opacity=".08"/><stop offset="1" stop-color="#0b0b12"/></radialGradient>
  </defs>
  <rect width="800" height="800" fill="#0b0b12"/>
  <rect width="800" height="800" fill="url(#bg)"/>
  ${cans.join("\n")}
</svg>
`;
}

mkdirSync(new URL("../public/dosen/", import.meta.url), { recursive: true });
const write = (file, svg) => writeFileSync(new URL(`../public/dosen/${file}`, import.meta.url), svg);
const glow = (f) => (f.body === DARK || f.body === "#f4f4f4" ? f.accent : f.body);

function trio(draw, f) {
  return scene([draw({ x: 80, y: 250, scale: 0.78, f }), draw({ x: 540, y: 250, scale: 0.78, f }), draw({ x: 300, y: 130, scale: 0.95, f })], f.accent);
}

for (const f of ENERGY) {
  write(`${f.handle}.svg`, scene([energyCan({ x: 280, y: 110, f })], glow(f)));
  write(`${f.handle}-trio.svg`, trio(energyCan, { ...f }));
}
const mix = ["classic", "tropical", "kiwi-lemon", "zero"].map((h) => ENERGY.find((f) => f.handle === h));
write("mixpaket.svg", scene(mix.map((f, i) => energyCan({ x: 20 + i * 190, y: i % 2 ? 150 : 230, scale: 0.7, f })), "#8dc63f"));

// ── Produkte ────────────────────────────────────────────────────────────────
let n = 0;
const createdAt = () => new Date(Date.UTC(2026, 9, 7, 12) - n++ * 86_400_000).toISOString();
const variantsFor = (handle) =>
  PACKS.map((p) => ({ id: `${handle}-${p.cans}er`, title: p.label, price: p.price, available: true, options: { Packung: p.label }, cans: p.cans }));

const make = (f, { collections, type, description, subtitle, highlights, featured }) => ({
  handle: f.handle,
  title: f.name,
  subtitle,
  descriptionHtml: description,
  vendor: BRAND,
  productType: type,
  tags: collections,
  collections,
  images: [
    { src: `/dosen/${f.handle}.svg`, alt: `${f.name} – Dose` },
    { src: `/dosen/${f.handle}-trio.svg`, alt: `${f.name} – drei Dosen` },
  ],
  options: [{ name: "Packung", values: PACKS.map((p) => p.label) }],
  variants: variantsFor(f.handle),
  featured,
  highlights,
  createdAt: createdAt(),
});

const products = [
  ...ENERGY.map((f) =>
    make(f, {
      collections: f.zero ? ["energy", "zero"] : ["energy"],
      type: "Energy Drink",
      description: energyDescription(f),
      subtitle: `${f.sub} · ${f.ml} ml`,
      highlights: [`${f.ml}-ml-Dose`, f.zero ? "Ohne Zucker" : "Energy Drink", "Gekühlt am besten"],
      featured: Boolean(f.featured),
    }),
  ),
];

products.push({
  handle: "mixpaket",
  title: "Probier-Mix 12er",
  subtitle: "12 Dosen aus dem Energy-Sortiment",
  descriptionHtml: `<p>Du kannst dich nicht entscheiden? Dann nimm einen Mix: 12 Dosen gemischt aus Classic, Tropical, Kiwi &amp; Lemon und Zero (je 3 Dosen).</p>
<p><strong>Erhöhter Koffeingehalt. Für Kinder, schwangere und stillende Frauen nicht empfohlen.</strong> Nicht mit Alkohol mischen.</p>
${PFAND}`,
  vendor: BRAND,
  productType: "Mixpaket",
  tags: ["mixpakete"],
  collections: ["mixpakete"],
  images: [{ src: "/dosen/mixpaket.svg", alt: "Probier-Mix – Classic, Tropical, Kiwi & Lemon, Zero" }],
  options: [],
  variants: [{ id: "mixpaket-12er", title: "12 Dosen (4 Sorten à 3)", price: 1699, available: true, options: {}, cans: 12 }],
  featured: true,
  highlights: ["4 Sorten", "12 Dosen", "Der Einstieg"],
  packSize: 12,
  createdAt: createdAt(),
});

const catalog = {
  brand: {
    name: BRAND,
    tagline: "Pure Ekstase in jeder Dose.",
    announcement: "",
    description: "EXSTASE Energy – Energy Drinks in vielen Sorten. Jetzt online bestellen und direkt nach Hause liefern lassen.",
  },
  collections: [
    { handle: "energy", title: "Energy Drinks", description: "Classic, Tropical, Kiwi & Lemon und Zero.", image: "/dosen/classic.svg" },
    { handle: "zero", title: "Zero", description: "Energie ohne Zucker.", image: "/dosen/zero.svg" },
    { handle: "mixpakete", title: "Mixpakete", description: "Alles ausprobieren – im Probier-Mix.", image: "/dosen/mixpaket.svg" },
  ],
  products,
};

writeFileSync(new URL("../data/products.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`✓ ${products.length} Produkte und ${ENERGY.length * 2 + 1} Grafiken geschrieben`);
