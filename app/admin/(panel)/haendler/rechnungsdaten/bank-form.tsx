"use client";

import { useActionState } from "react";
import { type BankState, saveBankAction } from "./actions";
import { btn, input, label } from "@/components/admin/ui";

export function BankForm({ initial }: { initial: { iban: string; bic: string; bank: string; dueDays: number; note: string; taxNumber: string } }) {
  const [state, action, pending] = useActionState<BankState, FormData>(saveBankAction, undefined);
  return (
    <form action={action} className="grid max-w-2xl gap-4 rounded-3xl border border-line bg-card p-6">
      <label className="grid gap-1.5">
        <span className={label}>IBAN</span>
        <input className={input} defaultValue={initial.iban} name="iban" placeholder="DE00 0000 0000 0000 0000 00" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className={label}>BIC</span>
          <input className={input} defaultValue={initial.bic} name="bic" />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Bank</span>
          <input className={input} defaultValue={initial.bank} name="bank" />
        </label>
      </div>
      <label className="grid max-w-xs gap-1.5">
        <span className={label}>Steuernummer (nur intern)</span>
        <input className={input} defaultValue={initial.taxNumber} name="taxNumber" placeholder="z. B. 123/4567/8901" />
        <span className="text-[12px] text-muted">Wird nicht im Shop und nicht auf Rechnungen gedruckt – dort steht die USt-IdNr.</span>
      </label>
      <label className="grid max-w-xs gap-1.5">
        <span className={label}>Zahlungsziel (Tage)</span>
        <input className={input} defaultValue={initial.dueDays} inputMode="numeric" name="dueDays" />
      </label>
      <label className="grid gap-1.5">
        <span className={label}>Standard-Hinweis auf Rechnungen (optional)</span>
        <textarea className={`${input} h-24`} defaultValue={initial.note} maxLength={1500} name="note" placeholder="z. B. Lieferung frei Haus ab 1 Palette. Es gelten unsere AGB." />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button className={btn} disabled={pending} type="submit">
          {pending ? "Wird gespeichert …" : "Speichern"}
        </button>
        {state?.ok ? <span className="text-[14px] text-emerald-700">{state.ok}</span> : null}
        {state?.error ? <span className="text-[14px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
