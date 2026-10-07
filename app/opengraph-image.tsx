import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { burstSvg } from "@/components/logo-paths";
import { catalog } from "@/lib/catalog";
import { SITE_URL } from "@/lib/format";

/*
 * Vorschaubild für WhatsApp, Facebook, LinkedIn & Co. (1200 × 630).
 * Wird beim Bauen einmal erzeugt und dann zwischengespeichert.
 */

export const alt = "EXSTASE Energy – Pure Ekstase in jeder Dose";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0b12";
const LIME = "#8dc63f";

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** Datei aus /public lesen – notfalls über die öffentliche Adresse (falls sie online nicht im Server-Paket liegt) */
async function readPublic(path: string) {
  try {
    return await readFile(join(process.cwd(), "public", path));
  } catch {
    const res = await fetch(new URL(path, `${SITE_URL}/`));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Produktbild als JPEG (Satori kann kein WebP/SVG). Klappt das nicht, gibt es das Bild ohne Foto. */
async function photo(src: string | undefined, width: number, height: number) {
  if (!src?.startsWith("/")) return null;
  try {
    const { default: sharp } = await import("sharp");
    const buf = await sharp(await readPublic(src.replace(/^\//, "")))
      .resize(width * 2, height * 2, { fit: "cover", position: "centre" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const host = (() => {
  try {
    const h = new URL(SITE_URL).hostname.replace(/^www\./, "");
    return h === "localhost" ? null : h;
  } catch {
    return null;
  }
})();

export default async function OpengraphImage() {
  const featured = catalog.products.filter((p) => p.featured && p.images[0]).slice(0, 3);
  const photos = await Promise.all(featured.map((p) => photo(p.images[0].src, 300, 300)));
  const tilt = [-6, 2, 7];
  const pos = [{ left: 0, top: 150 }, { left: 190, top: 40 }, { left: 380, top: 170 }];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: BG, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "64px 0 60px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={52} src={svgUrl(burstSvg(LIME))} width={52} />
            <div style={{ display: "flex", fontSize: 46, fontWeight: 900, letterSpacing: -2 }}>exstase</div>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: LIME, marginTop: 14 }}>ENERGY</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 84, lineHeight: 1.02, letterSpacing: -3, fontWeight: 800 }}>
            <span>Pure Ekstase</span>
            <span style={{ color: LIME }}>in jeder Dose.</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#b9b9c6" }}>Energy Drink · 250 ml · mit & ohne Zucker</div>
        </div>
        <div style={{ display: "flex", position: "relative", flex: 1 }}>
          {photos.map((src, i) =>
            src ? (
              <div key={featured[i].handle} style={{ display: "flex", position: "absolute", ...pos[i], width: 300, height: 300, borderRadius: 36, overflow: "hidden", border: "6px solid #fff", transform: `rotate(${tilt[i]}deg)`, boxShadow: "0 40px 80px -28px rgba(0,0,0,0.7)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" height={288} src={src} width={288} />
              </div>
            ) : null
          )}
          {host ? <div style={{ display: "flex", position: "absolute", right: 56, bottom: 52, padding: "12px 22px", borderRadius: 9999, background: "#fff", color: BG, fontSize: 22 }}>{host}</div> : null}
        </div>
      </div>
    ),
    size
  );
}
