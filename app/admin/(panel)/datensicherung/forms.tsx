"use client";

import { useActionState } from "react";
import { btn, btnSecondary, input, label } from "@/components/admin/ui";
import { type BackupActionState, restoreTestAction, startBackupAction, verifyBackupAction } from "./actions";

function Result({ state }: { state: BackupActionState }) {
  if (!state) return null;
  return (
    <div className="mt-3 space-y-2" role="status">
      {state.error ? <p className="text-red-700 text-sm">{state.error}</p> : null}
      {state.ok ? <p className="text-emerald-700 text-sm">{state.ok}</p> : null}
      {state.steps?.length ? (
        <ol className="space-y-1 text-[13px]">
          {state.steps.map((s) => (
            <li className={s.ok ? "text-ink/80" : "text-red-700"} key={s.label}>
              {s.ok ? "✓" : "✕"} {s.label}
              {s.detail ? <span className="text-muted"> – {s.detail}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function StartBackupForm({ disabled }: { disabled?: boolean }) {
  const [state, run, pending] = useActionState<BackupActionState>(startBackupAction, undefined);
  return (
    <form action={run}>
      <button className={btn} disabled={pending || disabled} type="submit">
        {pending ? "Sicherung läuft …" : "Jetzt sichern"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function VerifyForm({ id }: { id: string }) {
  const [state, run, pending] = useActionState<BackupActionState, FormData>(verifyBackupAction, undefined);
  return (
    <form action={run}>
      <input name="id" type="hidden" value={id} />
      <button className={btnSecondary} disabled={pending} type="submit">
        {pending ? "Prüfe …" : "Integrität prüfen"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function RestoreTestForm({ id, needCode, disabled }: { id: string; needCode: boolean; disabled?: boolean }) {
  const [state, run, pending] = useActionState<BackupActionState, FormData>(restoreTestAction, undefined);
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input name="id" type="hidden" value={id} />
      <div>
        <label className={label} htmlFor={`rt-pw-${id}`}>
          Passwort zur Bestätigung
        </label>
        <input autoComplete="current-password" className={input} disabled={disabled} id={`rt-pw-${id}`} name="password" required type="password" />
      </div>
      {needCode ? (
        <div>
          <label className={label} htmlFor={`rt-code-${id}`}>
            Code aus der App
          </label>
          <input autoComplete="one-time-code" className={input} disabled={disabled} id={`rt-code-${id}`} inputMode="numeric" maxLength={7} name="code" required />
        </div>
      ) : (
        <div />
      )}
      <button className={btnSecondary} disabled={pending || disabled} type="submit">
        {pending ? "Läuft …" : "In Testdatenbank wiederherstellen"}
      </button>
      <div className="sm:col-span-3">
        <Result state={state} />
      </div>
    </form>
  );
}
