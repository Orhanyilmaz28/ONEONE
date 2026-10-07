import { LOGO_BURST } from "./logo-official";

/**
 * EXSTASE-Zeichen: das „X“-Splash aus dem offiziellen Logo (exstase.com).
 * Wird im Browser (components/logo.tsx), im CSS (--drop in app/globals.css) und für Vorschaubilder (opengraph-image) genutzt.
 */
export const BURST_PATH = LOGO_BURST;
export const BURST_VIEWBOX = "0 0.5 160.25 160.25";

/** Splash als eigenständiges SVG (z. B. für Satori/Vorschaubilder, die keine React-SVG-Komponenten nutzen können) */
export function burstSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BURST_VIEWBOX}"><path d="${BURST_PATH}" fill="${color}"/></svg>`;
}

export const BRAND_FONT = "'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
