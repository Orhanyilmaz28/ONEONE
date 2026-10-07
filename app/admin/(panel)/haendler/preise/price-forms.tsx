"use client";

import { useActionState } from "react";
import { type PriceState, savePricesAction, suggestPricesAction } from "./actions";
import { btn, btnSecondary, input } from "@/components/admin/ui";

type Row = { handle: string; title: string; unit: string; shop: string; net: string; group: string };

export function PriceForms({ rows }: { rows: Row[] }) {
  const [saved, save, saving] = useActionState<PriceState, FormData>(savePricesAction, undefined);
  const [sugg, suggest, suggesting] = useActionState<PriceState, FormData>(suggestPricesAction, undefined);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="grid gap-6">
      <form action={suggest} className="flex flex-wrap items-end gap-3 rounded-3xl border border-line bg-card p-5">
        <label className="grid gap-1 text-[13px] text-ink/70">
          Abschlag auf den Netto-Shop-Preis (%)
          <input className={`${input} w-40`} defaultValue="15" inputMode="decimal" name="pct" />
        </label>
        <button className={btnSecondary} disabled={suggesting} type="submit">
          Vorschlag für leere Felder berechnen
        </button>
        <p className="basis-full text-[13px] text-muted">Rechnet aus dem Shop-Preis (brutto, 19 % MwSt.) einen Netto-Preis mit Abschlag. Das ist nur ein Vorschlag – danach unten anpassen und speichern.</p>
        {sugg?.ok ? <p className="basis-full text-[14px] text-emerald-700">{sugg.ok} (Seite neu laden, um die Werte zu sehen.)</p> : null}
        {sugg?.error ? <p className="basis-full text-[14px] text-red-700">{sugg.error}</p> : null}
      </form>

      <form action={save} className="grid gap-6">
        {groups.map((g) => (
          <section className="rounded-3xl border border-line bg-card" key={g}>
            <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">{g}</h2>
            <div className="divide-y divide-line">
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <label className="flex flex-wrap items-center gap-3 px-6 py-3" key={r.handle}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[14px]">{r.title}</span>
                      <span className="block text-[12px] text-muted">
                        {r.unit}
                        {r.shop ? ` · Shop-Preis ${r.shop}` : " · Preis nur auf Anfrage"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <input aria-label={`Netto-Händlerpreis ${r.title}`} className={`${input} w-32 text-right`} defaultValue={r.net} inputMode="decimal" name={`net_${r.handle}`} placeholder="–" />
                      <span className="text-[13px] text-muted">€ netto</span>
                    </span>
                  </label>
                ))}
            </div>
          </section>
        ))}
        <div className="sticky bottom-4 flex flex-wrap items-center gap-4 rounded-full border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
          <button className={btn} disabled={saving} type="submit">
            {saving ? "Wird gespeichert …" : "Händlerpreise speichern"}
          </button>
          {saved?.ok ? <span className="text-[14px] text-emerald-700">{saved.ok}</span> : null}
          {saved?.error ? <span className="text-[14px] text-red-700">{saved.error}</span> : null}
        </div>
      </form>
    </div>
  );
}
