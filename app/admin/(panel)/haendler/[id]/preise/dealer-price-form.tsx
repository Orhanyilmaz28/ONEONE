"use client";

import { useActionState } from "react";
import { type DealerPriceState, saveDealerPricingAction } from "./actions";
import { btn, input } from "@/components/admin/ui";
import { STEPS } from "@/lib/dealer-pricing";

export type DealerPriceRow = { id: string; name: string; tier: Record<string, string>; custom: Record<string, string> };

export function DealerPriceForm({ id, tierId, tiers, rows }: { id: string; tierId: string; tiers: { id: string; name: string; percent: number }[]; rows: DealerPriceRow[] }) {
  const [state, action, pending] = useActionState<DealerPriceState, FormData>(saveDealerPricingAction.bind(null, id), undefined);
  return (
    <form action={action} className="grid gap-6">
      <div className="rounded-3xl border border-line bg-card p-6">
        <label className="grid max-w-xs gap-1.5 text-[13px] font-medium text-ink/70">
          Stufe dieses Händlers
          <select className={input} defaultValue={tierId} name="tier">
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (−{String(t.percent).replace(".", ",")} %)
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-[13px] text-muted">Eigene Dosenpreise unten haben Vorrang vor der Stufe. Leere Felder = Preis nach Stufe (grau angezeigt).</p>
      </div>
      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">Eigene Dosenpreise (€ je Dose, netto)</h2>
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div className="grid gap-3 px-6 py-4 lg:grid-cols-[10rem_repeat(6,minmax(0,1fr))]" key={r.id}>
              <span className="font-medium text-[14px]">{r.name}</span>
              {STEPS.map((s) => (
                <label className="grid gap-1 text-[12px] text-muted" key={s.key}>
                  <span>
                    {s.key === "pal" ? "Palette" : s.label} · nach Stufe {r.tier[s.key] || "–"}
                  </span>
                  <input aria-label={`Eigener Dosenpreis ${r.name} ${s.label}`} className={`${input} text-right`} defaultValue={r.custom[s.key]} inputMode="decimal" name={`${r.id}__${s.key}`} placeholder="eigener Preis" />
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>
      <div className="sticky bottom-4 flex flex-wrap items-center gap-4 rounded-full border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
        <button className={btn} disabled={pending} type="submit">
          {pending ? "Wird gespeichert …" : "Speichern"}
        </button>
        {state?.ok ? <span className="text-[14px] text-emerald-700">{state.ok}</span> : null}
        {state?.error ? <span className="text-[14px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
