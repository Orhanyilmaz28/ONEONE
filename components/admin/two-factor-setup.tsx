"use client";

import { type ReactNode, useActionState } from "react";
import { btn, btnSecondary, input, label } from "@/components/admin/ui";

type State = { error?: string; recoveryCodes?: string[] } | undefined;

/**
 * Einrichtung der Zwei-Faktor-Anmeldung: QR-Code scannen (oder Schlüssel abtippen), Code bestätigen,
 * danach die Wiederherstellungscodes einmalig anzeigen.
 *
 * Die Komponente bleibt immer an derselben Stelle der Seite (auch wenn keine Einrichtung läuft → `children`),
 * damit die Codes sichtbar bleiben, wenn die Seite nach der Aktivierung neu geladen wird (neue Sitzung).
 */
export function TwoFactorSetup({ setup, action, doneHref, children }: { setup: { qr: string; secret: string } | null; action: (s: State, f: FormData) => Promise<State>; doneHref: string; children?: ReactNode }) {
  const [state, run, pending] = useActionState<State, FormData>(action, undefined);
  if (state?.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} doneHref={doneHref} />;
  if (!setup) return <>{children}</>;
  const { qr, secret } = setup;
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-[14px] text-ink/80">
        <li>Authenticator-App öffnen (z. B. Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden).</li>
        <li>QR-Code scannen – oder den Schlüssel von Hand eingeben.</li>
        <li>Den angezeigten 6-stelligen Code unten eintragen.</li>
      </ol>
      {/* QR-Code wird auf dem Server aus der otpauth-Adresse erzeugt */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG aus eigener QR-Erzeugung */}
      <div aria-label="QR-Code für die Authenticator-App" className="mx-auto w-48 rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} role="img" />
      <div>
        <p className={label}>Schlüssel zum Abtippen</p>
        <p className="break-all rounded-xl bg-ink/5 px-3 py-2 font-mono text-[13px] tracking-wider">{secret.replace(/(.{4})/g, "$1 ").trim()}</p>
      </div>
      <form action={run} className="space-y-3">
        <div>
          <label className={label} htmlFor="setup-code">
            Code aus der App
          </label>
          <input autoComplete="one-time-code" className={`${input} text-center font-medium text-lg tracking-[0.4em]`} id="setup-code" inputMode="numeric" maxLength={7} name="code" pattern="[0-9 ]{6,7}" placeholder="000000" required />
        </div>
        {state?.error ? (
          <p className="text-red-700 text-sm" role="alert">
            {state.error}
          </p>
        ) : null}
        <button className={`${btn} w-full`} disabled={pending} type="submit">
          {pending ? "Prüfe …" : "Zwei-Faktor-Anmeldung aktivieren"}
        </button>
      </form>
    </div>
  );
}

/** Wiederherstellungscodes einmalig anzeigen (danach nur noch als Hash gespeichert) */
export function RecoveryCodes({ codes, doneHref }: { codes: string[]; doneHref?: string }) {
  const text = `EXSTASE Dashboard – Wiederherstellungscodes\nJeder Code funktioniert genau einmal.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
        <b className="font-medium">Jetzt sichern:</b> Diese Codes werden nur dieses eine Mal angezeigt. Mit jedem Code kannst du dich einmal anmelden, falls
        du keinen Zugriff auf die App hast.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-ink/5 p-4 font-mono text-[14px] tracking-wider">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <a className={btnSecondary} download="exstase-wiederherstellungscodes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
          Als Datei speichern
        </a>
        <button className={btnSecondary} onClick={() => navigator.clipboard?.writeText(text)} type="button">
          Kopieren
        </button>
        {doneHref ? (
          <a className={btn} href={doneHref}>
            Gesichert – weiter
          </a>
        ) : null}
      </div>
    </div>
  );
}
