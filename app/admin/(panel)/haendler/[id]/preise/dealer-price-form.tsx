"use client";

import { useActionState } from "react";
import { type DealerPriceState, saveDealerPricingAction } from "./actions";
import { btn, input } from "@/components/admin/ui";
import { PRICE_KEYS, PRICE_LABELS } from "@/lib/dealer-pricing";

export type DealerPriceRow = { handle: string; title: string; group: string; base: Record<string, string>; tier: Record<string, string>; custom: Record<string, string> };

export function DealerPriceForm({ id, tierId, tiers, rows }: { id: string; tierId: string; tiers: { id: string; name: string; percent: number }[]; rows: DealerPriceRow[] }) {
  const [state, action, pending] = useActionState<DealerPriceState, FormData>(saveDealerPricingAction.bind(null, id), undefined);
  const groups = [...new Set(rows.map((r) => r.group))];
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
        <p className="mt-3 text-[13px] text-muted">Individuelle Preise unten haben Vorrang vor der Stufe. Leere Felder = Preis nach Stufe.</p>
      </div>
      {groups.map((g) => (
        <section className="overflow-hidden rounded-3xl border border-line bg-card" key={g}>
          <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">{g}</h2>
          <div className="divide-y divide-line">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <div className="grid gap-3 px-6 py-3 md:grid-cols-[1fr_repeat(3,9rem)]" key={r.handle}>
                  <span className="font-medium text-[14px]">{r.title}</span>
                  {PRICE_KEYS.map((k) => (
                    <label className="grid gap-1 text-[12px] text-muted" key={k}>
                      <span>
                        {PRICE_LABELS[k]} · nach Stufe {r.tier[k] || "–"} €
                      </span>
                      <input aria-label={`Individueller Preis ${PRICE_LABELS[k]} ${r.title}`} className={`${input} text-right`} defaultValue={r.custom[k]} inputMode="decimal" name={`${k}_${r.handle}`} placeholder="individuell" />
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </section>
      ))}
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
