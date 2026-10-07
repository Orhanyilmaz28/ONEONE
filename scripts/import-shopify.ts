/**
 * Übernimmt ALLES aus einem bestehenden Shopify-Shop:
 * Produkte, Varianten, Preise, Kollektionen, Produktbilder, Logo, Favicon,
 * Shop-Name/Beschreibung, Ankündigungsleiste und Rechtstexte
 * (Impressum, Datenschutz, AGB, Widerruf, Versand).
 *
 *   npm run import:shopify -- https://mein-shop.de
 *   npm run import:shopify -- https://mein-shop.de --no-images   # Bilder auf Shopify-CDN lassen
 *
 * Nutzt nur öffentliche Shopify-Endpunkte – kein API-Key nötig.
 * Ergebnis:
 *   data/products.json   Katalog + Marke
 *   data/pages.json      Rechtstexte
 *   public/imported/     Bilder, Logo, Favicon
 *   data/imported/       Roh-HTML der Startseite & Seiten (zum Nachschlagen)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, Collection, ImportedPage, Product } from "../lib/types";

type ShopifyVariant = {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  available?: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  created_at: string;
  tags: string[] | string;
  variants: ShopifyVariant[];
  images: { src: string; alt?: string | null }[];
  options: { name: string; values: string[] }[];
};

type ShopifyCollection = {
  handle: string;
  title: string;
  description?: string;
  image?: { src: string } | null;
};

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const PUBLIC_IMPORT = path.join(ROOT, "public", "imported");
const RAW = path.join(DATA, "imported");

const args = process.argv.slice(2);
const downloadImages = !args.includes("--no-images");
const base = (args.find((a) => a.startsWith("http")) ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Bitte Shop-URL angeben, z. B.: npm run import:shopify -- https://mein-shop.de");
  process.exit(1);
}
const UA = "Mozilla/5.0 (compatible; shop-import/2.0)";

async function get(pathOrUrl: string) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} bei ${url}`);
  }
  return res;
}

const getJson = async <T>(p: string) => (await (await get(p)).json()) as T;
const getText = async (p: string) => (await get(p)).text();

async function fetchAllProducts(p: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page < 100; page++) {
    const sep = p.includes("?") ? "&" : "?";
    const { products } = await getJson<{ products: ShopifyProduct[] }>(`${p}${sep}limit=250&page=${page}`);
    all.push(...products);
    if (products.length < 250) {
      break;
    }
  }
  return all;
}

// ---------- Bilder ----------

const absolute = (src: string) =>
  decode(src.startsWith("//") ? `${new URL(base).protocol}${src}` : src.startsWith("/") ? `${base}${src}` : src);

const downloaded = new Map<string, string>();

/** Lädt ein Bild nach public/imported/<folder>/ und gibt den öffentlichen Pfad zurück. */
async function localImage(src: string, folder: string, name?: string): Promise<string> {
  const url = absolute(src);
  if (!downloadImages) {
    return url;
  }
  const cached = downloaded.get(url);
  if (cached) {
    return cached;
  }
  const clean = new URL(url);
  const ext = path.extname(clean.pathname).toLowerCase() || ".jpg";
  const baseName = (name ?? path.basename(clean.pathname, ext))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 6);
  const file = `${baseName || "bild"}-${hash}${ext}`;
  const dir = path.join(PUBLIC_IMPORT, folder);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, file);
  if (!existsSync(target)) {
    const res = await get(url);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
  const publicPath = `/imported/${folder}/${file}`;
  downloaded.set(url, publicPath);
  return publicPath;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

// ---------- HTML-Helfer ----------

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const stripTags = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : undefined;
}

/** Entfernt Skripte, Styles und Event-Handler aus importiertem HTML. */
function sanitize(html: string) {
  return html
    .replace(/<(script|style|iframe|form)[\s\S]*?<\/\1>/gi, "")
    .replace(/\s(on\w+|style|class|id)=("[^"]*"|'[^']*')/gi, "")
    .replace(/href=["']\s*javascript:[^"']*["']/gi, 'href="#"')
    .trim();
}

function firstSrc(tag: string) {
  const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
  if (src) {
    return src;
  }
  return tag.match(/srcset=["']([^"'\s,]+)/i)?.[1];
}

// ---------- Startseite: Logo, Favicon, Texte ----------

async function importBrand(existing: Catalog["brand"]): Promise<Catalog["brand"]> {
  const brand = { ...existing };
  let shopMeta: { name?: string; description?: string } = {};
  try {
    shopMeta = await getJson("/meta.json");
  } catch {
    // nicht jeder Shop stellt /meta.json bereit
  }

  const html = await getText("/");
  writeFileSync(path.join(RAW, "startseite.html"), html);

  const name = shopMeta.name || meta(html, "og:site_name");
  if (name) {
    brand.name = name;
  }
  const description = shopMeta.description || meta(html, "description") || meta(html, "og:description");
  if (description) {
    brand.description = description;
  }

  const announcement = html.match(/class="[^"]*announcement-bar__message[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span|a)>/i)?.[1];
  if (announcement && stripTags(announcement)) {
    brand.announcement = stripTags(announcement);
  }

  const logoTag =
    html.match(/<img[^>]*class="[^"]*(?:header__heading-logo|site-header__logo-image|header-logo|logo)[^"]*"[^>]*>/i)?.[0] ??
    html.match(/<a[^>]*class="[^"]*(?:header__heading-link|site-header__logo)[^"]*"[^>]*>[\s\S]*?(<img[^>]*>)/i)?.[1];
  const logoSrc = logoTag ? firstSrc(logoTag) : undefined;
  if (logoSrc) {
    // Shopify liefert verkleinerte Logos (…&width=200) – größte Version holen
    const url = new URL(absolute(logoSrc));
    url.searchParams.delete("width");
    brand.logo = await localImage(url.toString(), "marke", "logo");
    console.log(`  Logo übernommen → ${brand.logo}`);
  } else {
    console.log("  Kein Logo im Header gefunden (Textlogo wird verwendet)");
  }

  const favicon = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  if (favicon && downloadImages) {
    const local = await localImage(favicon, "marke", "favicon");
    const ext = path.extname(local);
    writeFileSync(path.join(ROOT, "app", `icon${ext}`), readFileSync(path.join(ROOT, "public", local)));
    if (ext !== ".svg" && existsSync(path.join(ROOT, "app", "icon.svg"))) {
      // altes Platzhalter-Icon entfernen, damit das echte Favicon greift
      rmSync(path.join(ROOT, "app", "icon.svg"));
    }
    console.log("  Favicon übernommen");
  }
  return brand;
}

// ---------- Rechtstexte ----------

const POLICIES: Record<string, string[]> = {
  impressum: ["/policies/legal-notice", "/pages/impressum"],
  datenschutz: ["/policies/privacy-policy", "/pages/datenschutz"],
  agb: ["/policies/terms-of-service", "/pages/agb"],
  widerruf: ["/policies/refund-policy", "/pages/widerruf", "/pages/widerrufsbelehrung"],
  versand: ["/policies/shipping-policy", "/pages/versand"],
  kontakt: ["/policies/contact-information", "/pages/kontakt", "/pages/contact"],
};

function extractBody(html: string) {
  const policy = html.indexOf("shopify-policy__body");
  const rte = html.search(/class="[^"]*\brte\b[^"]*"/);
  const start = policy >= 0 ? policy : rte;
  if (start < 0) {
    return undefined;
  }
  const open = html.indexOf(">", start) + 1;
  // bis zum Ende des Hauptbereichs nehmen und überzählige schließende Tags abschneiden
  const endCandidates = ["</main>", "<footer", 'class="shopify-section shopify-section-group-footer']
    .map((m) => html.indexOf(m, open))
    .filter((i) => i > 0);
  let body = html.slice(open, Math.min(...endCandidates, html.length));
  body = body.replace(/(\s*<\/(div|section)>\s*)+$/i, "");
  const open_ = (body.match(/<div\b/gi) ?? []).length;
  const closed = (body.match(/<\/div>/gi) ?? []).length;
  body += "</div>".repeat(Math.max(0, open_ - closed));
  return sanitize(body);
}

async function importPages(): Promise<Record<string, ImportedPage>> {
  const pages: Record<string, ImportedPage> = {};
  for (const [slug, candidates] of Object.entries(POLICIES)) {
    for (const p of candidates) {
      try {
        const html = await getText(p);
        const body = extractBody(html);
        if (!body || stripTags(body).length < 40) {
          continue;
        }
        const title =
          stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
          meta(html, "og:title") ||
          slug;
        writeFileSync(path.join(RAW, `${slug}.html`), html);
        pages[slug] = { title, html: body };
        console.log(`  ${slug}: übernommen aus ${p}`);
        break;
      } catch {
        // nächste Variante probieren
      }
    }
  }
  return pages;
}

// ---------- Produkte ----------

const toCents = (value: string | null) => (value ? Math.round(Number.parseFloat(value) * 100) : undefined);

async function mapProduct(p: ShopifyProduct, collections: string[]): Promise<Product> {
  const tags = Array.isArray(p.tags) ? p.tags : p.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const options = p.options
    .filter((o) => !(o.name === "Title" && o.values.length === 1 && o.values[0] === "Default Title"))
    .map((o) => ({ name: o.name, values: o.values }));

  const images = await mapLimit(p.images, 4, async (img, i) => ({
    src: await localImage(img.src, `produkte/${p.handle}`, `${p.handle}-${i + 1}`),
    alt: img.alt || p.title,
  }));

  return {
    handle: p.handle,
    title: p.title,
    descriptionHtml: sanitize(p.body_html ?? ""),
    vendor: p.vendor,
    productType: p.product_type,
    tags,
    collections,
    images,
    options,
    variants: p.variants.map((v) => {
      const price = toCents(v.price) ?? 0;
      const compareAtPrice = toCents(v.compare_at_price);
      const values = [v.option1, v.option2, v.option3];
      return {
        id: String(v.id),
        title: v.title === "Default Title" ? "Standard" : v.title,
        price,
        ...(compareAtPrice && compareAtPrice > price ? { compareAtPrice } : {}),
        available: v.available ?? true,
        options: Object.fromEntries(options.map((o, i) => [o.name, values[i] ?? ""])),
      };
    }),
    featured: tags.some((t) => /featured|bestseller|highlight/i.test(t)),
    createdAt: p.created_at,
  };
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const productsFile = path.join(DATA, "products.json");
  const existing = JSON.parse(readFileSync(productsFile, "utf8")) as Catalog;

  console.log(`→ Marke, Logo & Startseite von ${base} …`);
  let brand = existing.brand;
  try {
    brand = await importBrand(existing.brand);
  } catch (error) {
    console.warn(`  Startseite nicht lesbar: ${(error as Error).message}`);
  }

  console.log("→ Produkte …");
  const products = await fetchAllProducts("/products.json");
  console.log(`  ${products.length} Produkte gefunden`);

  console.log("→ Kollektionen …");
  const membership = new Map<string, string[]>();
  let collections: Collection[] = [];
  try {
    const res = await getJson<{ collections: ShopifyCollection[] }>("/collections.json?limit=250");
    const raw = res.collections.filter((c) => c.handle !== "all" && c.handle !== "frontpage");
    for (const c of raw) {
      const items = await fetchAllProducts(`/collections/${c.handle}/products.json`);
      for (const item of items) {
        membership.set(item.handle, [...(membership.get(item.handle) ?? []), c.handle]);
      }
    }
    collections = await mapLimit(
      raw.filter((c) => [...membership.values()].some((list) => list.includes(c.handle))),
      4,
      async (c) => ({
        handle: c.handle,
        title: c.title,
        description: c.description ? stripTags(c.description) || undefined : undefined,
        ...(c.image?.src ? { image: await localImage(c.image.src, "kollektionen", c.handle) } : {}),
      })
    );
    console.log(`  ${collections.length} Kollektionen gefunden`);
  } catch (error) {
    console.warn(`  Kollektionen konnten nicht geladen werden: ${(error as Error).message}`);
  }

  console.log(downloadImages ? "→ Produktbilder herunterladen …" : "→ Produkte verarbeiten …");
  const mapped = await mapLimit(products, 3, (p) => mapProduct(p, membership.get(p.handle) ?? []));
  if (!mapped.some((p) => p.featured)) {
    for (const p of mapped.slice(0, 8)) {
      p.featured = true;
    }
  }

  console.log("→ Rechtstexte …");
  const pages = await importPages();

  const catalog: Catalog = { brand, collections, products: mapped };
  writeFileSync(productsFile, `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(path.join(DATA, "pages.json"), `${JSON.stringify(pages, null, 2)}\n`);

  console.log("");
  console.log(`✓ ${mapped.length} Produkte, ${collections.length} Kollektionen, ${Object.keys(pages).length} Rechtstexte`);
  if (downloadImages) {
    console.log(`✓ ${downloaded.size} Bilder nach public/imported/ geladen`);
  }
}

main().catch((error) => {
  console.error(`✗ Import fehlgeschlagen: ${(error as Error).message}`);
  process.exit(1);
});
