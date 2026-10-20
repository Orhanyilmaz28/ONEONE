import { LOGO_BURST, LOGO_GREEN, LOGO_TAGLINE, LOGO_VIEWBOX, LOGO_WORD } from "@/components/logo-official";
import type { PdfImage } from "./pdf";

/**
 * Offizielles EXSTASE-Logo für PDFs: die Original-Pfade aus components/logo-official.ts, unverändert,
 * in denselben Farben wie auf Rechnungen (Splash und „ENERGY DRINK“ grün, Schriftzug #111 auf Weiß).
 * Wird einmal je Server-Instanz als Pixelbild (3-fache Auflösung) erzeugt. Nur auf dem Server verwenden.
 */
const WIDTH = 900;
let cached: Promise<PdfImage | null> | null = null;

export function logoSvg(ink = "#111") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><g fill="none" fill-rule="evenodd"><path d="${LOGO_BURST}" fill="${LOGO_GREEN}"/><path d="${LOGO_WORD}" fill="${ink}"/><path d="${LOGO_TAGLINE}" fill="${LOGO_GREEN}"/></g></svg>`;
}

/** Logo als PDF-Bild; `null`, wenn das Bild nicht erzeugt werden kann (das Dokument zeigt dann den Markennamen als Text) */
export function logoImage(): Promise<PdfImage | null> {
  cached ??= (async () => {
    try {
      const { default: sharp } = await import("sharp");
      const { data, info } = await sharp(Buffer.from(logoSvg()), { density: 300 }).resize({ width: WIDTH }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const n = info.width * info.height;
      const rgb = Buffer.alloc(n * 3);
      const alpha = Buffer.alloc(n);
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = data[i * 4];
        rgb[i * 3 + 1] = data[i * 4 + 1];
        rgb[i * 3 + 2] = data[i * 4 + 2];
        alpha[i] = data[i * 4 + 3];
      }
      return { width: info.width, height: info.height, rgb, alpha };
    } catch {
      console.error("[office] Logo für PDF konnte nicht erzeugt werden");
      cached = null;
      return null;
    }
  })();
  return cached;
}
