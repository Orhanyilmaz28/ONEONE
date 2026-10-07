/**
 * EXSTASE-Zeichen: zackiger „Splash“ wie auf den Dosen – als Punktliste im Feld 100 × 100.
 * Wird sowohl im Browser (components/logo.tsx) als auch für Vorschaubilder (opengraph-image) genutzt.
 */
function burstPoints(spikes = 18, outer = 48, inner = 17) {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    // leicht unregelmäßige Spitzen, aber fest (kein Zufall → gleiche Ausgabe auf Server und Client)
    const r = i % 2 === 0 ? outer * (0.74 + 0.26 * Math.abs(Math.sin(i * 1.7))) : inner;
    pts.push(`${(50 + Math.cos(angle) * r).toFixed(1)},${(50 + Math.sin(angle) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

export const BURST = burstPoints();

/** Splash als eigenständiges SVG (z. B. für Satori/Vorschaubilder, die keine React-SVG-Komponenten nutzen können) */
export function burstSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${BURST}" fill="${color}"/></svg>`;
}

export const BRAND_FONT = "'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
