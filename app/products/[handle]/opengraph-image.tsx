import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { burstSvg } from "@/components/logo-paths";
import { catalog, getCollection, getProduct, priceRange } from "@/lib/catalog";
import { SITE_URL, formatPrice } from "@/lib/format";

/*
 * Vorschaubild pro Produkt (1200 × 630) – erscheint, wenn jemand einen Produkt-Link
 * per WhatsApp, Facebook & Co. teilt: Foto, Name, Preis und die wichtigsten Vorteile.
 */

export const alt = "Produktbild von EXSTASE Energy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return catalog.products.map((p) => ({ handle: p.handle }));
}

const INK = "#ffffff";
const MUTED = "#b9b9c6";
const PAPER = "#0b0b12";
const LINE = "#2a2a3a";
const LIME = "#8dc63f";

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const BLOBS = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter></defs><rect width="1200" height="630" fill="${PAPER}"/><g filter="url(#b)"><circle cx="1000" cy="80" r="300" fill="${LIME}" opacity="0.35"/><circle cx="700" cy="660" r="250" fill="#1ea7e1" opacity="0.3"/></g></svg>`);
const DROP = svgUrl(burstSvg(LIME));

/** Datei aus /public lesen – notfalls über die öffentliche Adresse (falls sie online nicht im Server-Paket liegt) */
async function readPublic(src: string) {
  try {
    return await readFile(join(process.cwd(), "public", src));
  } catch {
    const res = await fetch(new URL(src, `${SITE_URL}/`));
    if (!res.ok) throw new Error(`${src}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Produktfoto als JPEG (Satori kann kein WebP). Klappt das nicht, gibt es das Bild ohne Foto. */
async function photo(src: string | undefined, width: number, height: number) {
  if (!src?.startsWith("/")) return null;
  try {
    const { default: sharp } = await import("sharp");
    const buf = await sharp(await readPublic(src.replace(/^\//, "")))
      .resize(width * 2, height * 2, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function ProductOpengraphImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const product = await getProduct(handle);
  if (!product) notFound();

  const { min, max } = priceRange(product);
  const cheapest = product.variants.find((v) => v.price === min);
  const compareAt = cheapest?.compareAtPrice && cheapest.compareAtPrice > min ? cheapest.compareAtPrice : undefined;
  const saving = compareAt ? Math.round((1 - min / compareAt) * 100) : 0;
  const collection = product.collections[0] ? getCollection(product.collections[0]) : undefined;
  const eyebrow = [collection?.title, product.productType]
    .filter(Boolean)
    .join(" · ");
  const image = await photo(product.images[0]?.src, 372, 466);
  const titleSize = product.title.length > 22 ? 58 : 68;
  const chips = product.highlights?.slice(0, 3) ?? ["250-ml-Dose", "Versand aus Deutschland"];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", background: PAPER, color: INK }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" height={630} src={BLOBS} style={{ position: "absolute", inset: 0 }} width={1200} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 720, padding: "64px 0 60px 72px", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={46} src={DROP} width={46} />
            <div style={{ display: "flex", fontSize: 42, fontWeight: 900, letterSpacing: -2 }}>exstase</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {eyebrow ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, letterSpacing: 2.6, textTransform: "uppercase", color: MUTED }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" height={18} src={DROP} width={11} />
                {eyebrow}
              </div>
            ) : null}
            {/* Wörter einzeln, damit „3er-Pack“ nie am Bindestrich umbricht */}
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 16, fontSize: titleSize, lineHeight: 1.04, letterSpacing: -2.5, maxWidth: 600 }}>
              {product.title.split(" ").map((word, i) => (
                <span key={`${word}-${i}`} style={{ whiteSpace: "nowrap", marginRight: "0.24em" }}>
                  {word}
                </span>
              ))}
            </div>
            {product.subtitle ? <div style={{ display: "flex", marginTop: 18, fontSize: 27, lineHeight: 1.35, color: MUTED, maxWidth: 580 }}>{product.subtitle}</div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30 }}>
              <div style={{ display: "flex", fontSize: 44, letterSpacing: -1.2 }}>{`${min !== max ? "ab " : ""}${formatPrice(min)}`}</div>
              {compareAt ? <div style={{ display: "flex", fontSize: 28, color: MUTED, textDecoration: "line-through" }}>{formatPrice(compareAt)}</div> : null}
              {saving >= 3 ? <div style={{ display: "flex", padding: "6px 14px", borderRadius: 9999, background: LIME, color: "#0b0b12", fontSize: 20 }}>{`Spare ${saving} %`}</div> : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {chips.map((c) => (
              <div key={c} style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 8, padding: "9px 16px 9px 13px", borderRadius: 9999, background: "#14141f", border: `1.5px solid ${LINE}`, fontSize: 19, whiteSpace: "nowrap" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" height={17} src={DROP} width={10.5} />
                {c}
              </div>
            ))}
          </div>
        </div>

        {image ? (
          <div style={{ display: "flex", position: "absolute", right: 64, top: 70, width: 384, height: 478, borderRadius: 40, overflow: "hidden", background: "#fff", border: "6px solid #fff", transform: "rotate(2deg)", boxShadow: "0 40px 80px -28px rgba(0,0,0,0.7)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={466} src={image} style={{ objectFit: "cover" }} width={372} />
          </div>
        ) : null}
      </div>
    ),
    size
  );
}
