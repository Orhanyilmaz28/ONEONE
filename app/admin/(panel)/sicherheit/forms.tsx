"use client";

import { useActionState } from "react";
import { RecoveryCodes } from "@/components/admin/two-factor-setup";
import { btn, btnDanger, btnSecondary, input, label } from "@/components/admin/ui";
import { type ActionState, disableTwoFactorAction, newRecoveryCodes, startTwoFactorSetup } from "./actions";

function Message({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <p className="text-red-700 text-sm" role="alert">
        {state.error}
      </p>
    );
  if (state?.ok) return <p className="text-emerald-700 text-sm">{state.ok}</p>;
  return null;
}

/** Einrichtung starten – mit erneuter Passworteingabe */
export function StartSetupForm() {
  const [state, run, pending] = useActionState<ActionState, FormData>(startTwoFactorSetup, undefined);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-1">
        <label className={label} htmlFor="setup-password">
          Passwort zur Bestätigung
        </label>
        <input autoComplete="current-password" className={input} id="setup-password" name="password" required type="password" />
      </div>
      <button className={btn} disabled={pending} type="submit">
        {pending ? "…" : "Zwei-Faktor einrichten"}
      </button>
      <div className="w-full">
        <Message state={state} />
      </div>
    </form>
  );
}

export function RegenerateForm() {
  const [state, run, pending] = useActionState<ActionState, FormData>(newRecoveryCodes, undefined);
  if (state?.recoveryCodes) return <RecoveryCodes codes={state.recoveryCodes} />;
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[10rem]">
        <label className={label} htmlFor="regen-code">
          Code aus der App
        </label>
        <input autoComplete="one-time-code" className={input} id="regen-code" inputMode="numeric" maxLength={7} name="code" required />
      </div>
      <button className={btnSecondary} disabled={pending} type="submit">
        Neue Wiederherstellungscodes
      </button>
      <div className="w-full">
        <Message state={state} />
        <p className="mt-1 text-[13px] text-muted">Die bisherigen Codes werden dabei ungültig.</p>
      </div>
    </form>
  );
}

export function DisableForm() {
  const [state, run, pending] = useActionState<ActionState, FormData>(disableTwoFactorAction, undefined);
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className={label} htmlFor="dis-password">
          Passwort
        </label>
        <input autoComplete="current-password" className={input} id="dis-password" name="password" required type="password" />
      </div>
      <div>
        <label className={label} htmlFor="dis-code">
          Code aus der App oder Wiederherstellungscode
        </label>
        <input autoComplete="one-time-code" className={input} id="dis-code" name="code" required />
      </div>
      <button className={btnDanger} disabled={pending} type="submit">
        Ausschalten
      </button>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}
