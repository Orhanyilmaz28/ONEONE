"use client";

import { useActionState } from "react";
import { btn, input, label } from "@/components/admin/ui";
import { type TermsState, saveTermsAction } from "./actions";

type Props = { id: string; code: string; discountPct: number; commissionPct: number; active: boolean; approve: boolean };

/** Code und Konditionen festlegen – bei neuen Bewerbungen zugleich freischalten */
export function TermsForm({ id, code, discountPct, commissionPct, active, approve }: Props) {
  const [state, action, pending] = useActionState<TermsState, FormData>(saveTermsAction, undefined);
  const v = state?.values ?? { code, discountPct, commissionPct };
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-2xl border border-line p-4 text-[14px] sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
      <input name="id" type="hidden" value={id} />
      {approve ? <input name="approve" type="hidden" value="1" /> : null}
      <label>
        <span className={label}>Code</span>
        <input className={`${input} font-bold uppercase tracking-wider`} defaultValue={v.code} maxLength={20} name="code" required />
      </label>
      <label>
        <span className={label}>Rabatt Kunde %</span>
        <input className={input} defaultValue={v.discountPct} inputMode="decimal" name="discountPct" required />
      </label>
      <label>
        <span className={label}>Provision %</span>
        <input className={input} defaultValue={v.commissionPct} inputMode="decimal" name="commissionPct" required />
      </label>
      <button className={btn} disabled={pending} type="submit">
        {pending ? "…" : approve ? "Freischalten" : "Speichern"}
      </button>
      {approve ? null : (
        <label className="flex items-center gap-2 sm:col-span-4">
          <input className="size-4" defaultChecked={active} name="active" type="checkbox" /> Code aktiv (ausgeschaltet: Code gilt im Shop nicht, Login bleibt)
        </label>
      )}
      {state?.error ? <p className="text-red-600 sm:col-span-4">{state.error}</p> : null}
      {state?.ok ? <p className="text-emerald-700 sm:col-span-4">{state.ok}</p> : null}
    </form>
  );
}
