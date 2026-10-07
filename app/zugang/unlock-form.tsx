"use client";

import { useActionState, useState } from "react";
import { type UnlockState, unlock } from "./actions";

export function UnlockForm({ target }: { target: string }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-8 space-y-3 text-left">
      <input name="weiter" type="hidden" value={target} />
      <label className="sr-only" htmlFor="site-password">
        Passwort
      </label>
      <div className="relative">
        <input
          aria-describedby={state.error ? "site-password-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          autoComplete="current-password"
          // biome-ignore lint/a11y/noAutofocus: einziges Feld der Seite
          autoFocus
          className="h-13 w-full rounded-full border border-line bg-card px-5 pr-24 text-[16px] outline-none transition placeholder:text-ink/35 focus:border-ink focus-visible:ring-4 focus-visible:ring-ink/10 aria-[invalid=true]:border-red-300"
          id="site-password"
          name="password"
          placeholder="Passwort"
          type={show ? "text" : "password"}
        />
        <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[13px] text-ink/70 hover:bg-ink/5" onClick={() => setShow((s) => !s)} type="button">
          {show ? "Verbergen" : "Anzeigen"}
        </button>
      </div>
      {state.error ? (
        <p className="px-2 text-[14px] text-red-700" id="site-password-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="h-13 w-full rounded-full bg-accent font-medium text-black transition hover:bg-accent-dark disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Moment …" : "Shop öffnen"}
      </button>
    </form>
  );
}
