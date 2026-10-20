"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/components/admin/ui";
import { type FormState, login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label className={label} htmlFor="username">
          Benutzername <span className="font-normal text-muted">(nur Büro-Zugang)</span>
        </label>
        <input autoCapitalize="none" autoComplete="username" className={input} id="username" maxLength={32} name="username" placeholder="Administrator: leer lassen" spellCheck={false} type="text" />
      </div>
      <div>
        <label className={label} htmlFor="password">
          Passwort
        </label>
        <input autoComplete="current-password" className={input} id="password" name="password" required type="password" />
      </div>
      {state?.error ? (
        <p className="text-red-700 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={`${btn} w-full`} disabled={pending} type="submit">
        {pending ? "Prüfe …" : "Anmelden"}
      </button>
    </form>
  );
}
