"use client";

import { useActionState } from "react";
import { type PriceState, savePricesAction } from "./actions";
import { btn, input } from "@/components/admin/ui";
import { PRICE_KEYS, PRICE_LABELS } from "@/lib/dealer-pricing";

export type PriceRow = { handle: string; title: string; unit: string; shop: string; group: string; values: Record<string, string> };

export function PriceForms({ rows }: { rows: PriceRow[] }) {
  const [saved, save, saving] = useActionState<PriceState, FormData>(savePricesAction, undefined);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <form action={save} className="grid gap-6">
      {groups.map((g) => (
        <section className="overflow-hidden rounded-3xl border border-line bg-card" key={g}>
          <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">{g}</h2>
          <div className="hidden grid-cols-[1fr_repeat(3,8.5rem)] gap-3 px-6 pt-3 text-[12px] text-muted md:grid">
            <span>Artikel</span>
            {PRICE_KEYS.map((k) => (
              <span key={k}>{PRICE_LABELS[k]} (€ netto)</span>
            ))}
          </div>
          <div className="divide-y divide-line">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <div className="grid items-center gap-3 px-6 py-3 md:grid-cols-[1fr_repeat(3,8.5rem)]" key={r.handle}>
                  <span className="min-w-0">
                    <span className="block font-medium text-[14px]">{r.title}</span>
                    <span className="block text-[12px] text-muted">
                      {r.unit} · Shop-Preis {r.shop}
                    </span>
                  </span>
                  {PRICE_KEYS.map((k) => (
                    <label className="grid gap-1 text-[12px] text-muted md:block" key={k}>
                      <span className="md:sr-only">{PRICE_LABELS[k]} (€ netto)</span>
                      <input aria-label={`${PRICE_LABELS[k]} ${r.title}`} className={`${input} text-right`} defaultValue={r.values[k]} inputMode="decimal" name={`${k}_${r.handle}`} placeholder="–" />
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </section>
      ))}
      <div className="sticky bottom-4 flex flex-wrap items-center gap-4 rounded-full border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
        <button className={btn} disabled={saving} type="submit">
          {saving ? "Wird gespeichert …" : "Basispreise speichern"}
        </button>
        {saved?.ok ? <span className="text-[14px] text-emerald-700">{saved.ok}</span> : null}
        {saved?.error ? <span className="text-[14px] text-red-700">{saved.error}</span> : null}
      </div>
    </form>
  );
}
