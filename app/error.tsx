"use client"; // Fehlerseiten müssen Client-Komponenten sein

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { LogoMark } from "@/components/logo";

/**
 * Freundliche Fehlerseite, wenn beim Laden einer Seite etwas schiefgeht
 * (z. B. kurze Störung beim Datenspeicher). Kopfzeile und Footer bleiben sichtbar.
 */
export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const admin = usePathname()?.startsWith("/admin");

  useEffect(() => {
    // Für die Fehlersuche in der Browser-Konsole bzw. den Server-Logs
    console.error(error);
  }, [error]);

  useEffect(() => {
    // Screenreader bekommen sofort mit, dass sich die Seite geändert hat
    heading.current?.focus();
  }, []);

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:py-28">
      <LogoMark className="anim-bob mx-auto h-16 w-auto text-ink/80" />
      <p className="t-eyebrow mt-8">Kurze Störung</p>
      <h1 className="t-h1 mt-3 outline-none" ref={heading} tabIndex={-1}>
        Hoppla, da ist etwas schiefgelaufen
      </h1>
      <p className="t-lead mx-auto mt-5 max-w-md">
        Das liegt nicht an dir. Bitte versuche es gleich noch einmal
        {admin ? " – deine gespeicherten Daten sind sicher." : " – dein Warenkorb bleibt natürlich erhalten."}
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <button
          className="inline-flex h-12 items-center rounded-full bg-ink px-7 font-medium text-white transition hover:bg-black"
          onClick={() => unstable_retry()}
          type="button"
        >
          Nochmal versuchen
        </button>
        <Link className="inline-flex h-12 items-center rounded-full border border-ink/15 bg-white px-7 font-medium transition hover:border-ink" href={admin ? "/admin" : "/"}>
          {admin ? "Zum Dashboard" : "Zur Startseite"}
        </Link>
      </div>

      <p className="t-small mt-10 text-muted">
        Klappt es immer noch nicht?{" "}
        {admin ? (
          "Lade die Seite neu oder melde dich kurz ab und wieder an."
        ) : (
          <>
            <Link className="text-ink underline underline-offset-4" href="/kontakt">
              Schreib uns
            </Link>{" "}
            – wir helfen gern weiter.
          </>
        )}
      </p>
      {error.digest ? <p className="mt-3 text-muted text-xs">Fehler-Code: {error.digest}</p> : null}
    </div>
  );
}
