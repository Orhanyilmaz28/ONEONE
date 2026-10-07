"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/components/admin/ui";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label className={label} htmlFor="password">
          Passwort
        </label>
        <input autoComplete="current-password" autoFocus className={input} id="password" name="password" required type="password" />
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
