/**
 * Echte Bewertungen aus einem CSV-Export übernehmen (z. B. Judge.me, Shopify Product Reviews, Loox).
 *
 *   npm run import:reviews -- export.csv
 *
 * Erkannte Spalten (Groß-/Kleinschreibung egal): product_handle, rating, body | review | content,
 * title, reviewer_name | author | name, review_date | created_at | date, verified | verified_buyer.
 * Alte Kompanion-Handles werden automatisch den neuen Produkten zugeordnet.
 * Bestehende Einträge in data/reviews.json bleiben erhalten (Duplikate werden übersprungen).
 */
import { readFileSync, writeFileSync } from "node:fs";

const MAP: Record<string, string> = {
  "damen-hipster": "damen-hipster",
  "mary-ellen-damen-hipster": "damen-hipster",
  "damen-slip": "damen-slip",
  "esther-damen-slip": "damen-slip",
  "herren-trunk": "herren-trunk",
  "john-boy-herren-trunk": "herren-trunk",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const file = process.argv[2];
if (!file) {
  console.error("Bitte CSV-Datei angeben: npm run import:reviews -- export.csv");
  process.exit(1);
}
const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
const col = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
const idx = {
  product: col("product_handle", "handle", "product"),
  rating: col("rating", "stars", "score"),
  body: col("body", "review", "content", "text"),
  title: col("title", "headline"),
  name: col("reviewer_name", "author", "name", "customer_name"),
  date: col("review_date", "created_at", "date"),
  verified: col("verified", "verified_buyer", "verified_purchase"),
};
if (idx.product < 0 || idx.rating < 0 || idx.body < 0) {
  console.error(`Spalten nicht erkannt. Gefunden: ${header.join(", ")}`);
  process.exit(1);
}

const out = new URL("../data/reviews.json", import.meta.url);
const existing = JSON.parse(readFileSync(out, "utf8")) as { text: string; name: string }[];
let added = 0, skipped = 0;
for (const r of rows) {
  const product = MAP[r[idx.product]?.trim()] ?? r[idx.product]?.trim();
  const rating = Math.round(Number(r[idx.rating]));
  const text = r[idx.body]?.trim();
  const name = (idx.name >= 0 ? r[idx.name]?.trim() : "") || "Anonym";
  if (!product || !(rating >= 1 && rating <= 5) || !text) { skipped++; continue; }
  if (existing.some((e) => e.text === text && e.name === name)) { skipped++; continue; }
  existing.push({
    id: `import-${existing.length + 1}`,
    product,
    name: name.split(" ").length > 1 ? `${name.split(" ")[0]} ${name.split(" ").at(-1)?.[0]}.` : name,
    rating,
    ...(idx.title >= 0 && r[idx.title]?.trim() ? { title: r[idx.title].trim() } : {}),
    text,
    ...(idx.date >= 0 && r[idx.date] ? { date: r[idx.date].trim() } : {}),
    source: "kompanion",
    verified: idx.verified >= 0 ? /^(true|1|yes|ja)$/i.test(r[idx.verified]?.trim() ?? "") : false,
  } as never);
  added++;
}
writeFileSync(out, `${JSON.stringify(existing, null, 2)}\n`);
console.log(`✓ ${added} Bewertungen übernommen, ${skipped} übersprungen`);
