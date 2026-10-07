"use client";

import { useActionState } from "react";
import { type TierState, saveTiersAction } from "./actions";
import { btn, input } from "@/components/admin/ui";
import type { Tier } from "@/lib/dealer-pricing";

export function TierForm({ tiers, counts }: { tiers: Tier[]; counts: Record<string, number> }) {
  const [state, action, pending] = useActionState<TierState, FormData>(saveTiersAction, undefined);
  return (
    <form action={action} className="grid max-w-2xl gap-4 rounded-3xl border border-line bg-card p-6">
      <input name="ids" type="hidden" value={tiers.map((t) => t.id).join(",")} />
      <div className="grid grid-cols-[1fr_7rem_6rem] gap-3 text-[12px] text-muted">
        <span>Name der Stufe</span>
        <span>Nachlass in %</span>
        <span>Händler</span>
      </div>
      {tiers.map((t) => (
        <div className="grid grid-cols-[1fr_7rem_6rem] items-center gap-3" key={t.id}>
          <input aria-label="Name" className={input} defaultValue={t.name} maxLength={40} name={`name_${t.id}`} />
          <input aria-label={`Prozent ${t.name}`} className={`${input} text-right`} defaultValue={String(t.percent).replace(".", ",")} inputMode="decimal" name={`pct_${t.id}`} />
          <span className="text-[14px] text-muted">{counts[t.id] ?? 0}</span>
        </div>
      ))}
      <p className="text-[12px] text-muted">Name leeren = Stufe löschen. Händler dieser Stufe bekommen dann automatisch die erste Stufe in der Liste.</p>
      <div className="grid grid-cols-[1fr_7rem] gap-3 border-line border-t pt-4">
        <input aria-label="Neue Stufe" className={input} maxLength={40} name="new_name" placeholder="Neue Stufe, z. B. Gold" />
        <input aria-label="Prozent neue Stufe" className={`${input} text-right`} defaultValue="0" inputMode="decimal" name="new_pct" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className={btn} disabled={pending} type="submit">
          {pending ? "Wird gespeichert …" : "Stufen speichern"}
        </button>
        {state?.ok ? <span className="text-[14px] text-emerald-700">{state.ok} Seite neu laden für die Liste.</span> : null}
        {state?.error ? <span className="text-[14px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
