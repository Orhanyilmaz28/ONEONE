"use client";

import { useActionState, useState } from "react";
import { type LimitState, saveLimitAction } from "./actions";
import { btnSecondary, input, label } from "@/components/admin/ui";

/** Limit des Upstash-Tarifs wählen */
export function LimitForm({ current, presets }: { current: number; presets: { mb: number; label: string }[] }) {
  const [state, action, pending] = useActionState<LimitState, FormData>(saveLimitAction, undefined);
  const known = presets.some((p) => p.mb === current);
  const [preset, setPreset] = useState(known ? String(current) : "eigen");
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1.5">
        <span className={label}>Dein Upstash-Tarif</span>
        <select className={input} name="preset" onChange={(e) => setPreset(e.target.value)} value={preset}>
          {presets.map((p) => (
            <option key={p.mb} value={p.mb}>
              {p.label}
            </option>
          ))}
          <option value="eigen">Eigener Wert …</option>
        </select>
      </label>
      {preset === "eigen" ? (
        <label className="grid gap-1.5">
          <span className={label}>Limit in MB</span>
          <input className={`${input} w-32`} defaultValue={known ? "" : current} inputMode="numeric" name="custom" />
        </label>
      ) : null}
      <button className={btnSecondary} disabled={pending} type="submit">
        {pending ? "…" : "Limit speichern"}
      </button>
      {state?.ok ? <span className="text-[14px] text-emerald-700">{state.ok}</span> : null}
      {state?.error ? <span className="text-[14px] text-red-700">{state.error}</span> : null}
    </form>
  );
}
