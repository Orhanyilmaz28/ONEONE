import Link from "next/link";
import { ChatIcon } from "./icons";

/** Schwebender Hilfe-Button – erscheint nach dem ersten Scrollen (per Tastatur sofort erreichbar). */
export function HelpButton() {
  return (
    <Link
      className="sd-help help-btn group fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border border-line bg-card py-2 pr-4 pl-2 text-[15px] shadow-[0_14px_40px_-12px_rgba(20,20,20,0.3)] transition hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
      href="/kontakt"
    >
      <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-accent text-black">
        <ChatIcon className="size-4" />
      </span>
      {/* Sichtbarer Text = vorgelesener Name (kein abweichendes aria-label) */}
      <span className="hidden sm:inline">Fragen? Wir helfen gern.</span>
      <span className="sm:hidden">Hilfe</span>
    </Link>
  );
}
