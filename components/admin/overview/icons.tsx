/** Kleine Linien-Icons für die Übersicht (24er-Raster, Strichstärke 1.6 – wie in der Navigation) */
const PATHS = {
  euro: "M17.5 6.6A7 7 0 1 0 17.5 17.4M4 10.5h9M4 13.5h9",
  calendar: "M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4",
  chart: "M4 20V10M10 20V4M16 20v-7M21 20H3",
  bag: "M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 8Zm4 0V7a3 3 0 0 1 6 0v1",
  receipt: "M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17ZM9 8h6M9 12h6",
  box: "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4v-9ZM3.5 7.5 12 11.5l8.5-4M12 11.5v9",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  check: "m5 12.5 4.5 4.5L19 7.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  chevron: "m9 6 6 6-6 6",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowDown: "M12 5v14m-6-6 6 6 6-6",
  sparkle: "M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2 12 3.5Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-[18px]", strokeWidth = 1.6 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icon im runden, hellen Kreis – für die Kennzahlen-Kacheln (auf dem Handy ausgeblendet, damit die Beschriftung Platz hat) */
export function StatIcon({ name, tone = "neutral" }: { name: IconName; tone?: "neutral" | "amber" }) {
  return (
    <span className={`hidden size-8 shrink-0 place-items-center rounded-full sm:grid ${tone === "amber" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200/70" : "bg-cream text-ink/70"}`}>
      <Icon className="size-4" name={name} />
    </span>
  );
}
