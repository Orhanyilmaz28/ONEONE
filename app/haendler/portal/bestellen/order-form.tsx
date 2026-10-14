"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import type { DealerRow } from "@/lib/dealer-catalog";
import { MAX_TRAYS, priceLines, sumLines } from "@/lib/dealer-order-pricing";
import { formatPrice as euro } from "@/lib/format";
import { type OrderFormState, placeDealerOrder } from "./actions";

/** Bestellformular: Menge in Trays je Artikel, Summe wird live mitgerechnet (verbindlich ist die Berechnung auf dem Server) */
export function OrderForm({ rows, groups }: { rows: DealerRow[]; groups: { key: string; title: string }[] }) {
  const [state, action, pending] = useActionState<OrderFormState, FormData>(placeDealerOrder, {});
  const [qty, setQty] = useState<Record<string, number>>({});
  const set = (handle: string, n: number) => setQty((q) => ({ ...q, [handle]: Math.max(0, Math.min(MAX_TRAYS, Math.floor(n) || 0)) }));

  const orderable = (r: DealerRow) => r.available !== false && Boolean(r.t1.value || r.t2.value || r.pal.value);
  const lines = useMemo(() => rows.flatMap((r) => (qty[r.handle] ? priceLines(r, qty[r.handle]) : [])), [rows, qty]);
  const { net, deposit } = sumLines(lines);
  const trays = Object.values(qty).reduce((a, n) => a + n, 0);

  return (
    <form action={action} className="mt-8 pb-52 sm:pb-40">
      {groups.map((g) => (
        <section className="mt-10 first:mt-0" key={g.key}>
          <h2 className="t-h3 mb-4">{g.title}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] border border-line bg-card">
            {rows
              .filter((r) => r.group === g.key)
              .map((r) => {
                const n = qty[r.handle] ?? 0;
                const total = n ? sumLines(priceLines(r, n)).net : 0;
                const can = orderable(r);
                return (
                  <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3" key={r.handle}>
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-paper">
                      {r.image ? <Image alt="" className="object-cover" fill sizes="48px" src={r.image} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.title}</span>
                      <span className="block text-muted text-xs">
                        {r.unit}
                        {can ? (
                          <>
                            {" · "}
                            {r.t1.value ? `1 Tray ${euro(r.t1.value)}` : null}
                            {r.t2.value ? ` · ab 2 Trays ${euro(r.t2.value)}` : null}
                            {r.pal.value && r.trays ? ` · Palette (${r.trays} Trays) ${euro(r.pal.value)}` : null}
                          </>
                        ) : null}
                      </span>
                    </span>
                    {can ? (
                      <span className="flex items-center gap-3">
                        <span className="flex items-center rounded-full border border-line">
                          <button aria-label={`${r.title}: ein Tray weniger`} className="size-10 rounded-full text-lg transition hover:text-accent disabled:opacity-30" disabled={!n} onClick={() => set(r.handle, n - 1)} type="button">
                            −
                          </button>
                          <input
                            aria-label={`${r.title}: Anzahl Trays`}
                            className="h-10 w-14 bg-transparent text-center font-bold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            inputMode="numeric"
                            max={MAX_TRAYS}
                            min={0}
                            name={`qty:${r.handle}`}
                            onChange={(e) => set(r.handle, Number(e.target.value))}
                            type="number"
                            value={n || ""}
                            placeholder="0"
                          />
                          <button aria-label={`${r.title}: ein Tray mehr`} className="size-10 rounded-full text-lg transition hover:text-accent" onClick={() => set(r.handle, n + 1)} type="button">
                            +
                          </button>
                        </span>
                        <span className="w-24 text-right font-bold tabular-nums">{total ? euro(total) : <span className="font-normal text-muted">–</span>}</span>
                      </span>
                    ) : (
                      <span className="text-muted text-sm">{r.available === false ? "nicht lieferbar" : "Preis folgt"}</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <section className="mt-10">
        <label className="t-h3 mb-4 block" htmlFor="note">
          Anmerkung <span className="font-normal text-base text-muted">(optional)</span>
        </label>
        <textarea
          className="min-h-28 w-full rounded-[1.5rem] border border-line bg-card px-4 py-3 text-sm outline-none focus:border-accent"
          id="note"
          maxLength={1000}
          name="note"
          placeholder="z. B. Wunsch-Liefertermin, abweichende Lieferadresse, Mischpalette …"
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-line border-t bg-paper/95 px-4 py-4 backdrop-blur sm:px-8 lg:left-[17rem] lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg tabular-nums">
              {euro(net)} <span className="font-normal text-muted text-sm">netto · {trays.toLocaleString("de-DE")} {trays === 1 ? "Tray" : "Trays"}</span>
            </p>
            <p className="text-muted text-xs">zzgl. {euro(deposit)} Pfand, gesetzl. MwSt. und ggf. Versand – die Rechnung folgt.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input className="size-4 accent-[var(--color-accent,#a8e652)]" name="confirm" required type="checkbox" value="1" />
            Verbindlich bestellen
          </label>
          <button
            className="inline-flex h-12 items-center rounded-full bg-accent px-6 font-bold text-black transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            disabled={pending || trays === 0}
            type="submit"
          >
            {pending ? "Sende …" : "Bestellung senden"}
          </button>
          {state.error ? (
            <p className="w-full text-red-400 text-sm" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
