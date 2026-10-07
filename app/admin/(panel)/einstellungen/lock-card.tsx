"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Badge, Card, btn, input, label } from "@/components/admin/ui";
import { type LockState, saveSiteLock } from "./lock-actions";

export function LockCard({ enabled, hasPassword, message, siteUrl }: { enabled: boolean; hasPassword: boolean; message: string; siteUrl: string }) {
  const [state, action, pending] = useActionState<LockState, FormData>(saveSiteLock, {});
  const [on, setOn] = useState(enabled);
  const [show, setShow] = useState(false);
  const [savedOn, setSavedOn] = useState(enabled);
  const pwRef = useRef<HTMLInputElement>(null);
  const active = savedOn;
  // Nach dem Speichern: Stand merken und Passwortfeld leeren
  useEffect(() => {
    if (state.ok) {
      setSavedOn(on);
      if (pwRef.current) pwRef.current.value = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur nach neuem Ergebnis
  }, [state.at]);
  return (
    <div className="mb-8" id="seitenschutz">
      <Card actions={active ? <Badge tone="amber">🔒 Geschützt</Badge> : <Badge tone="green">Für alle offen</Badge>} title="Shop mit Passwort schützen">
        <p className="mb-4 max-w-2xl text-[14px] text-ink/80 leading-relaxed">
          Solange der Schutz an ist, sehen Besucher:innen statt des Shops nur eine Seite „Bald geöffnet“ mit Passwort-Feld. Wer das Passwort kennt, kommt hinein
          (30 Tage lang ohne erneute Eingabe). <b>Du selbst</b> siehst den Shop immer, solange du im Dashboard angemeldet bist. Suchmaschinen sehen nichts.
        </p>
        <form
          action={action}
          className="space-y-4"
          onSubmit={(e) => {
            // selbst absenden: sonst setzt React das Formular zurück und der Schalter springt optisch auf „aus“
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => action(data));
          }}
        >
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4 transition hover:border-ink/30 has-focus-visible:ring-4 has-focus-visible:ring-ink/15">
            <span>
              <span className="block font-medium text-[15px]">Passwortschutz einschalten</span>
              <span className="mt-0.5 block text-[13px] text-muted">Das Dashboard bleibt immer erreichbar.</span>
            </span>
            <input name="enabled" type="hidden" value={on ? "1" : "0"} />
            <input checked={on} className="peer sr-only" onChange={(e) => setOn(e.target.checked)} role="switch" type="checkbox" />
            <span
              aria-hidden
              className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-ink after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="site-pw">
                {hasPassword ? "Neues Passwort (leer lassen = altes behalten)" : "Passwort für den Shop"}
              </label>
              <div className="relative">
                <input autoComplete="new-password" className={`${input} pr-24`} id="site-pw" ref={pwRef} maxLength={100} name="password" placeholder={hasPassword ? "••••••••" : "mind. 6 Zeichen"} type={show ? "text" : "password"} />
                <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-3 py-1 text-[13px] text-ink/70 hover:bg-ink/5" onClick={() => setShow((s) => !s)} type="button">
                  {show ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">Nicht dein Dashboard-Passwort verwenden – dieses gibst du an Testpersonen weiter.</p>
            </div>
            <div>
              <label className={label} htmlFor="site-msg">
                Text auf der Passwort-Seite <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea className={`${input} min-h-[4.6rem] resize-y`} defaultValue={message} id="site-msg" maxLength={280} name="message" placeholder="z. B. Wir öffnen am 1. November – schau bald wieder vorbei!" rows={2} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={btn} disabled={pending} type="submit">
              {pending ? "Speichern …" : "Speichern"}
            </button>
            <a className="text-[14px] text-ink/70 underline underline-offset-4 hover:text-ink" href={`${siteUrl}/zugang`} rel="noreferrer" target="_blank">
              Passwort-Seite ansehen ↗
            </a>
            <p aria-live="polite" className="text-[14px]" role="status">
              {state.error ? <span className="text-red-700">{state.error}</span> : state.message ? <span className="text-emerald-800">✓ {state.message}</span> : null}
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
