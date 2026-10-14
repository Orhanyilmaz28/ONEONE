"use client";

import { useActionState, useState } from "react";
import { type PriceState, savePricesAction } from "./actions";
import { btn, btnSecondary, input } from "@/components/admin/ui";
import { STEPS, parseCanPrice } from "@/lib/dealer-pricing";
import { formatPrice } from "@/lib/format";

type GroupRow = { id: string; name: string; values: Record<string, string> };
type Item = { handle: string; title: string; area: string; unit: string; perTray: number; lkw: boolean; group: string };

/** Preisgruppen mit Dosenpreisen je Mengenstufe + Zuordnung der Artikel */
export function PriceForms({ groups: initial, items }: { groups: GroupRow[]; items: Item[] }) {
  const [saved, save, saving] = useActionState<PriceState, FormData>(savePricesAction, undefined);
  const [groups, setGroups] = useState(initial);
  const [assign, setAssign] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.handle, i.group])));
  const areas = [...new Set(items.map((i) => i.area))];
  const tray = (g: GroupRow | undefined, k: string, perTray: number) => {
    const c = parseCanPrice(g?.values[k]);
    return typeof c === "number" ? formatPrice(Math.round(c * perTray)) : "–";
  };

  return (
    <form action={save} className="grid gap-6">
      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">Preisgruppen · Dosenpreis netto (€ je Dose)</h2>
        <div className="hidden grid-cols-[12rem_repeat(6,minmax(0,1fr))_2.5rem] gap-2 px-6 pt-3 text-[12px] text-muted lg:grid">
          <span>Name</span>
          {STEPS.map((s) => (
            <span key={s.key}>{s.key === "pal" ? "Palette (120 Trays)" : s.label}</span>
          ))}
          <span />
        </div>
        <div className="divide-y divide-line">
          {groups.map((g, i) => (
            <div className="grid items-end gap-2 px-6 py-3 lg:grid-cols-[12rem_repeat(6,minmax(0,1fr))_2.5rem]" key={g.id}>
              <input name={`g${i}_id`} type="hidden" value={g.id} />
              <label className="grid gap-1 text-[12px] text-muted">
                <span className="lg:sr-only">Name der Preisgruppe</span>
                <input className={input} name={`g${i}_name`} onChange={(e) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} required value={g.name} />
              </label>
              {STEPS.map((s) => (
                <label className="grid gap-1 text-[12px] text-muted" key={s.key}>
                  <span className="lg:sr-only">{s.label}</span>
                  <input
                    aria-label={`${g.name}: ${s.label} (€ je Dose)`}
                    className={`${input} text-right`}
                    inputMode="decimal"
                    name={`g${i}_${s.key}`}
                    onChange={(e) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, values: { ...x.values, [s.key]: e.target.value } } : x)))}
                    placeholder="–"
                    value={g.values[s.key] ?? ""}
                  />
                </label>
              ))}
              <button
                aria-label={`Preisgruppe ${g.name} entfernen`}
                className="h-11 rounded-full text-muted transition hover:text-red-700"
                onClick={() => setGroups(groups.filter((x) => x.id !== g.id))}
                title="Preisgruppe entfernen"
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="px-6 py-4">
          <button className={btnSecondary} onClick={() => setGroups([...groups, { id: `g-${Date.now().toString(36)}`, name: "Neue Preisgruppe", values: {} }])} type="button">
            + Preisgruppe hinzufügen
          </button>
          <p className="mt-3 text-[13px] text-muted">Leere Stufe = es gilt die nächstkleinere Menge. Nur ein Palettenpreis (z. B. Ice Coffee) = bestellbar ab 120 Trays gesamt. Bis zu drei Nachkommastellen, z. B. 0,415.</p>
        </div>
      </section>

      {areas.map((a) => (
        <section className="overflow-hidden rounded-3xl border border-line bg-card" key={a}>
          <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">{a} · Preisgruppe je Artikel</h2>
          <div className="divide-y divide-line">
            {items
              .filter((i) => i.area === a)
              .map((i) => {
                const g = groups.find((x) => x.id === assign[i.handle]);
                return (
                  <div className="grid items-center gap-3 px-6 py-3 md:grid-cols-[1fr_14rem]" key={i.handle}>
                    <span className="min-w-0">
                      <span className="block font-medium text-[14px]">{i.title}</span>
                      <span className="block text-[12px] text-muted">
                        {i.lkw ? "Nur per LKW auf Anfrage – keine Preise im Händlerbereich" : g ? `${i.unit} · 1 Tray ${tray(g, "s1", i.perTray)} · ab 10 Trays ${tray(g, "s10", i.perTray)} · Palette ${tray(g, "pal", i.perTray)} je Tray` : `${i.unit} · keine Preisgruppe – nicht bestellbar`}
                      </span>
                    </span>
                    {i.lkw ? (
                      <span className="text-[13px] text-muted">LKW-Anfrage</span>
                    ) : (
                      <select aria-label={`Preisgruppe ${i.title}`} className={input} name={`a_${i.handle}`} onChange={(e) => setAssign({ ...assign, [i.handle]: e.target.value })} value={assign[i.handle] ?? ""}>
                        <option value="">– keine (nicht bestellbar)</option>
                        {groups.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name || "Ohne Namen"}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-4 rounded-full border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
        <input name="count" type="hidden" value={groups.length} />
        <button className={btn} disabled={saving} type="submit">
          {saving ? "Wird gespeichert …" : "Dosenpreise speichern"}
        </button>
        {saved?.ok ? <span className="text-[14px] text-emerald-700">{saved.ok}</span> : null}
        {saved?.error ? <span className="text-[14px] text-red-700">{saved.error}</span> : null}
      </div>
    </form>
  );
}
