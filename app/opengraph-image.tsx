import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { toJpeg } from "@/lib/og-jpeg";
import { company } from "@/lib/company";
import { SITE_URL } from "@/lib/format";

/*
 * Vorschaubild für WhatsApp, Facebook, LinkedIn & Co. (1200 × 630).
 * Wird beim Bauen einmal erzeugt und dann zwischengespeichert.
 */

export const alt = "exstase – find your favourite kick.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

const BG = "#030303";
const LIME = "#a8e652";


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

/** Freigestellte Dose als PNG (Satori kann kein WebP). Klappt das nicht, fehlt nur diese Dose. */
async function can(handle: string, height: number) {
  try {
    const { default: sharp } = await import("sharp");
    const buf = await sharp(await readPublic(`dosen-foto/frei/${handle}.webp`)).resize({ height: height * 2 }).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Schrift wie im Shop (Exo 2), liegt in assets/fonts */
async function font(file: string) {
  return readFile(join(process.cwd(), "assets", "fonts", file));
}

const host = company.domain;

export default async function OpengraphImage() {
  // Wie das Startbild im Shop: Classic groß in der Mitte, Tropical und Kiwi-Lemon dahinter
  const [classic, tropical, kiwi, logo, black, medium] = await Promise.all([
    can("classic", 470),
    can("tropical", 340),
    can("kiwi-lemon", 340),
    readPublic("logo.svg").then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`).catch(() => null),
    font("Exo2-Black.ttf"),
    font("Exo2-Medium.ttf"),
  ]);

  return toJpeg(new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: BG, color: "#fff", position: "relative", overflow: "hidden", fontFamily: "Exo 2" }}>
        <div style={{ display: "flex", position: "absolute", left: 560, top: -120, width: 760, height: 760, borderRadius: 9999, background: `radial-gradient(circle, ${LIME}66 0%, ${LIME}1f 38%, transparent 65%)` }} />
        <div style={{ display: "flex", position: "absolute", left: 650, top: 70, width: 500, height: 500, borderRadius: 9999, border: "2px solid rgba(168,230,82,0.22)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "52px 0 52px 72px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img alt="" height={74} src={logo} width={120} /> : <div style={{ display: "flex", fontSize: 46, fontWeight: 900 }}>exstase</div>}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 20, fontWeight: 900, letterSpacing: 6, color: LIME }}>NEW ERA OF ENERGY</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14, fontSize: 104, fontWeight: 900, lineHeight: 0.92, letterSpacing: -4 }}>
              <span>find your</span>
              <span style={{ color: LIME }}>favourite</span>
              <span>kick.</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#a3a3a3" }}>Energy Drinks · Ice Coffee · X-Tea · Wasser</div>
        </div>
        {/* eslint-disable @next/next/no-img-element */}
        {tropical ? <img alt="" height={340} src={tropical} style={{ position: "absolute", left: 690, top: 70, transform: "rotate(-14deg)", opacity: 0.85 }} width={130} /> : null}
        {kiwi ? <img alt="" height={340} src={kiwi} style={{ position: "absolute", left: 1010, top: 190, transform: "rotate(12deg)", opacity: 0.85 }} width={130} /> : null}
        {classic ? <img alt="" height={470} src={classic} style={{ position: "absolute", left: 810, top: 70 }} width={180} /> : null}
        {/* eslint-enable @next/next/no-img-element */}
        <div style={{ display: "flex", position: "absolute", right: 48, bottom: 40, padding: "10px 22px", borderRadius: 9999, background: LIME, color: "#000", fontSize: 22, fontWeight: 900 }}>{host}</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Exo 2", data: black, weight: 900, style: "normal" },
        { name: "Exo 2", data: medium, weight: 500, style: "normal" },
      ],
    }
  ));
}
