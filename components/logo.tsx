import { BRAND_FONT, BURST } from "./logo-paths";

/**
 * EXSTASE-Logo: Splash-Zeichen und Schriftzug „exstase“ mit „ENERGY“ darunter.
 * Einfarbig in Textfarbe (currentColor). Das Zeichen stammt von den Dosen (components/logo-paths.ts).
 */

function Splash({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <polygon fill="currentColor" points={BURST} />
    </g>
  );
}

export function Logo({
  className = "h-8 w-auto",
  title = "EXSTASE Energy",
}: {
  className?: string;
  title?: string;
  /** Wird für alte Aufrufe beibehalten – das Logo hat nur eine Strichstärke */
  compact?: boolean;
}) {
  return (
    <svg aria-label={title} className={`logo ${className}`} role="img" viewBox="0 0 232 60">
      <title>{title}</title>
      <Splash size={56} x={0} y={2} />
      <text fill="currentColor" fontFamily={BRAND_FONT} fontSize="42" fontWeight="900" lengthAdjust="spacingAndGlyphs" textLength="164" x="64" y="39">
        exstase
      </text>
      <text fill="currentColor" fontFamily={BRAND_FONT} fontSize="11" fontWeight="700" lengthAdjust="spacing" textLength="164" x="65" y="56">
        ENERGY
      </text>
    </svg>
  );
}

/** Gestapelt: Splash mittig über dem Schriftzug (für schmale, hohe Flächen) */
export function LogoStacked({ className = "h-24 w-auto", title = "EXSTASE Energy" }: { className?: string; title?: string }) {
  return (
    <svg aria-label={title} className={`logo ${className}`} role="img" viewBox="0 0 180 120">
      <title>{title}</title>
      <Splash size={62} x={59} y={0} />
      <text fill="currentColor" fontFamily={BRAND_FONT} fontSize="46" fontWeight="900" lengthAdjust="spacingAndGlyphs" textAnchor="middle" textLength="170" x="90" y="98">
        exstase
      </text>
      <text fill="currentColor" fontFamily={BRAND_FONT} fontSize="12" fontWeight="700" lengthAdjust="spacing" textAnchor="middle" textLength="170" x="90" y="116">
        ENERGY
      </text>
    </svg>
  );
}

/** Nur das Zeichen (Splash) – für große Darstellungen */
export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 100 100">
      <polygon fill="currentColor" points={BURST} />
    </svg>
  );
}

/** Kleines Marken-Icon (Aufzählungen, Trenner, Badges) */
export function DropIcon({ className = "h-3.5 w-auto" }: { className?: string }) {
  return (
    <svg aria-hidden className={`shrink-0 ${className}`} viewBox="0 0 100 100">
      <polygon fill="currentColor" points={BURST} />
    </svg>
  );
}

/** Trenner: Linie – Splash – Linie */
export function DropDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
      <LogoMark className="anim-bob h-7 w-auto text-ink/70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
    </div>
  );
}
