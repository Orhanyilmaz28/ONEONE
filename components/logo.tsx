import { LOGO_BURST, LOGO_GREEN, LOGO_TAGLINE, LOGO_VIEWBOX, LOGO_WORD } from "./logo-official";
import { BURST } from "./logo-paths";

/**
 * EXSTASE-Logo (offizielle Datei von exstase.com, siehe components/logo-official.ts) und Splash-Zeichen (components/logo-paths.ts).
 */

function OfficialLogo({ className, title }: { className: string; title: string }) {
  return (
    <svg aria-label={title} className={`logo ${className}`} role="img" viewBox={LOGO_VIEWBOX}>
      <title>{title}</title>
      <g fill="none" fillRule="evenodd">
        <path d={LOGO_BURST} fill={LOGO_GREEN} />
        <path d={LOGO_WORD} fill="var(--logo-ink, #fff)" />
        <path d={LOGO_TAGLINE} fill={LOGO_GREEN} />
      </g>
    </svg>
  );
}

/** Offizielles EXSTASE-Logo (Splash, Schriftzug „exstase“, „ENERGY DRINK“) – Farben wie auf exstase.com */
export function Logo({
  className = "h-8 w-auto",
  title = "EXSTASE Energy",
}: {
  className?: string;
  title?: string;
  /** Wird für alte Aufrufe beibehalten – das Logo hat nur eine Variante */
  compact?: boolean;
}) {
  return <OfficialLogo className={className} title={title} />;
}

/** Gleiches Logo für schmale, hohe Flächen (das offizielle Logo ist bereits kompakt) */
export function LogoStacked({ className = "h-24 w-auto", title = "EXSTASE Energy" }: { className?: string; title?: string }) {
  return <OfficialLogo className={className} title={title} />;
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
