"use client";

import { useActionState } from "react";
import { btn, input } from "@/components/admin/ui";
import { type StatementState, createStatementAction } from "../actions";

export function StatementForm({ id, months }: { id: string; months: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<StatementState, FormData>(createStatementAction, undefined);
  if (!months.length) return <p className="text-[14px] text-muted">Keine offenen Provisionen aus abgeschlossenen Monaten – nichts abzurechnen.</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-[14px]">
      <input name="id" type="hidden" value={id} />
      <select aria-label="Monat" className={`${input} w-auto!`} defaultValue={months[0].value} name="month">
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <button className={btn} disabled={pending} type="submit">
        {pending ? "…" : "Gutschrift erstellen"}
      </button>
      {state?.error ? <p className="w-full text-red-600">{state.error}</p> : null}
      {state?.ok ? <p className="w-full text-emerald-700">{state.ok}</p> : null}
    </form>
  );
}
