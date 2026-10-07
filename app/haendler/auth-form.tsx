"use client";

import { useActionState } from "react";
import { type FormState, dealerActivateAction, dealerLoginAction } from "./actions";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";
const submit = "anim-shine relative inline-flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-black text-lg transition hover:bg-accent-dark disabled:opacity-60";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(dealerLoginAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        E-Mail
        <input autoComplete="username" className={field} defaultValue={state?.email} key={state?.email ?? ""} name="email" required type="email" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Passwort
        <input autoComplete="current-password" className={field} name="password" required type="password" />
      </label>
      {state?.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={submit} disabled={pending} type="submit">
        {pending ? "Einen Moment …" : "Einloggen"}
      </button>
    </form>
  );
}

export function ActivateForm({ id, token }: { id: string; token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(dealerActivateAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input name="id" type="hidden" value={id} />
      <input name="t" type="hidden" value={token} />
      <label className="grid gap-1.5 text-sm">
        Neues Passwort (mindestens 10 Zeichen)
        <input autoComplete="new-password" className={field} minLength={10} name="password" required type="password" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Passwort wiederholen
        <input autoComplete="new-password" className={field} minLength={10} name="again" required type="password" />
      </label>
      {state?.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={submit} disabled={pending} type="submit">
        {pending ? "Einen Moment …" : "Zugang einrichten"}
      </button>
    </form>
  );
}
