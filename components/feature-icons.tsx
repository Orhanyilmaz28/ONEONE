/**
 * EXSTASE Icon-Set (Linien-Icons, 32×32).
 * Mit `draw` zeichnen sich die Linien beim Hineinscrollen selbst (CSS, siehe .icon-draw in globals.css).
 */
type Props = { className?: string; draw?: boolean };

const ICONS: Record<string, string[]> = {
  // Saugstark & sicher: Tropfen mit Schloss
  saugstark: [
    "M16 3.5C12.2 9 6.5 14.4 6.5 20a9.5 9.5 0 0 0 19 0C25.5 14.4 19.8 9 16 3.5Z",
    "M12.6 19.6v-1.8a3.4 3.4 0 0 1 6.8 0v1.8",
    "M11.4 19.6h9.2v5.6h-9.2z",
    "M16 21.6v1.6",
  ],
  // Einlagig & dünn: eine Schicht, Pfeile von oben/unten
  einlagig: ["M4 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2", "M16 3.5v7", "M13 7.5l3 3 3-3", "M16 28.5v-7", "M13 24.5l3-3 3 3"],
  // Waschbar 40 °C: Waschmaschine
  waschbar: ["M6.5 4.5h19v23h-19z", "M6.5 10h19", "M10 7.2h3", "M16 13.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z", "M12.6 20.2c1.2-1 2.2-1 3.4 0s2.2 1 3.4 0"],
  // Atmungsaktiv: Luftströme
  atmungsaktiv: ["M4 11h14a3.5 3.5 0 1 0-3.5-3.5", "M4 16.5h20a3.5 3.5 0 1 1-3.5 3.5", "M4 22h9a3 3 0 1 1-3 3"],
  // Geräuschlos: Lautsprecher stumm
  geraeuschlos: ["M5 12.5h5l6-5v17l-6-5H5z", "M21 12.5l6 7", "M27 12.5l-6 7"],
  // Antibakteriell & geruchsneutral: Schild mit Funkeln
  antibakteriell: ["M16 3.5 6 7.5v8c0 6.4 4.3 10.6 10 12.5 5.7-1.9 10-6.1 10-12.5v-8L16 3.5Z", "M16 11l1.2 3 3 1.2-3 1.2L16 19.4l-1.2-3-3-1.2 3-1.2Z"],
  // Nachhaltig: Blatt
  nachhaltig: ["M7 25c0-11 6.5-18 19-19-1 12.5-8 19-19 19Z", "M7 25 18.5 13.5"],
  // Hautfreundlich: Feder
  hautfreundlich: ["M25.5 6.5c-8 0-14 5.5-15 15l-4 4", "M25.5 6.5c0 8-5.5 14-15 15", "M12 18h6.5", "M15 13.5h7"],
  // Diskret: Auge durchgestrichen
  diskret: ["M4 16s4.5-7.5 12-7.5S28 16 28 16s-4.5 7.5-12 7.5S4 16 4 16Z", "M16 12.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z", "M5.5 26.5l21-21"],
  // Patentiert: Siegel
  patent: ["M16 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "M12.5 12l2.5 2.5 4.5-4.5", "M11 19l-2 9.5 7-3.5 7 3.5-2-9.5"],
  // Situationen
  geburt: ["M16 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M9 28.5c0-6 3-10.5 7-10.5s7 4.5 7 10.5", "M16 18c-3.5 0-5-3.5-5-6.5", "M16 18c3.5 0 5-3.5 5-6.5"],
  wechseljahre: ["M16 4v3", "M16 25v3", "M4 16h3", "M25 16h3", "M7.5 7.5l2.1 2.1", "M22.4 22.4l2.1 2.1", "M7.5 24.5l2.1-2.1", "M22.4 9.6l2.1-2.1", "M16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"],
  operation: ["M16 27.5S4.5 20.5 4.5 12.2A6 6 0 0 1 16 9a6 6 0 0 1 11.5 3.2C27.5 20.5 16 27.5 16 27.5Z", "M8 16h4l2-3.5 3 7 2-3.5h5"],
  sport: ["M19.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M10 13.5l4.5-3.5 5 2 1.5 5 4 1.5", "M14.5 10l-2 7.5 5 3.5-1.5 7", "M12.5 17.5l-5 4"],
  lachen: ["M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24Z", "M10.5 18.5c1.4 2.4 3.3 3.5 5.5 3.5s4.1-1.1 5.5-3.5", "M11 12.5c.8-1.2 2.2-1.2 3 0", "M18 12.5c.8-1.2 2.2-1.2 3 0"],
  jahre: ["M16 4a12 12 0 1 0 0 24 12 12 0 0 0 0-24Z", "M16 9v7l4.5 3"],
  versand: ["M3.5 9.5h15v12h-15z", "M18.5 13.5h5l4 4v4h-9", "M8.5 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M22.5 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  // Pflege
  ausspuelen: ["M10 4h12", "M16 4v5", "M11 9h10l-1.5 4h-7Z", "M13 18c0 1.5 1.5 2.5 1.5 4", "M18 17c0 1.5 1.5 2.5 1.5 4", "M15.5 24c0 1.5 1.5 2.5 1.5 4"],
  weichspueler: ["M12 4.5h8v3l2.5 3.5v15.5h-13V11L12 7.5Z", "M9.5 15h13", "M5 27 27 5"],
  lufttrocknen: ["M16 7.5a2.5 2.5 0 1 1 2.5 2.5L16 12", "M16 12 4.5 20h23Z", "M8 24.5v3", "M16 24.5v3", "M24 24.5v3"],
  herz: ["M16 27.5S4.5 20.5 4.5 12.2A6 6 0 0 1 16 9a6 6 0 0 1 11.5 3.2C27.5 20.5 16 27.5 16 27.5Z"],
};

export type IconName = keyof typeof ICONS;

export function FeatureIcon({ name, className = "size-8", draw = true }: Props & { name: IconName }) {
  const paths = ICONS[name] ?? [];
  return (
    <svg
      aria-hidden
      className={`${draw ? "icon-draw" : ""} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 32 32"
    >
      {paths.map((d, i) => (
        <path d={d} key={d} pathLength={1} style={{ ["--i" as string]: i }} />
      ))}
    </svg>
  );
}
