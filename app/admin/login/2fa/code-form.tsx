"use client";

import { useActionState, useState } from "react";
import { btn, input, label } from "@/components/admin/ui";
import { type FormState, verifyCode } from "../../actions";

export function CodeForm() {
  const [kind, setKind] = useState<"totp" | "recovery">("totp");
  const [state, action, pending] = useActionState<FormState, FormData>(verifyCode, undefined);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input name="kind" type="hidden" value={kind} />
      <div>
        <label className={label} htmlFor="code">
          {kind === "totp" ? "Code aus der App" : "Wiederherstellungscode"}
        </label>
        {kind === "totp" ? (
          <input autoComplete="one-time-code" autoFocus className={`${input} text-center font-medium text-lg tracking-[0.4em]`} id="code" inputMode="numeric" key="totp" maxLength={7} name="code" pattern="[0-9 ]{6,7}" placeholder="000000" required />
        ) : (
          <input autoComplete="off" autoFocus className={`${input} text-center font-mono uppercase tracking-widest`} id="code" key="recovery" maxLength={14} name="code" placeholder="XXXXX-XXXXX" required />
        )}
      </div>
      {state?.error ? (
        <p className="text-red-700 text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className={`${btn} w-full`} disabled={pending} type="submit">
        {pending ? "Prüfe …" : "Bestätigen"}
      </button>
      <button className="text-muted text-sm underline-offset-4 hover:text-ink hover:underline" onClick={() => setKind(kind === "totp" ? "recovery" : "totp")} type="button">
        {kind === "totp" ? "Kein Zugriff auf die App? Wiederherstellungscode verwenden" : "Code aus der App verwenden"}
      </button>
    </form>
  );
}
