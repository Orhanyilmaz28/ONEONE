"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { DealerPriceCell, DealerRow } from "@/lib/dealer-catalog";
import { formatPrice as euro } from "@/lib/format";

/** Durchsuchbare Preisliste, nach Bereichen gefiltert */
export function PriceTable({ rows, groups, katalog }: { rows: DealerRow[]; groups: { key: string; title: string }[]; katalog: boolean }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("alle");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (group === "alle" || r.group === group) && (!s || r.title.toLowerCase().includes(s)));
  }, [rows, q, group]);
  const visibleGroups = groups.filter((g) => shown.some((r) => r.group === g.key));

  return (
    <div className="mt-8">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-line border-b bg-paper/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <nav aria-label="Bereiche" className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {[{ key: "alle", title: "Alle" }, ...groups].map((g) => (
            <button
              aria-pressed={group === g.key}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${group === g.key ? "border-accent bg-accent font-bold text-black" : "border-line hover:border-accent"}`}
              key={g.key}
              onClick={() => setGroup(g.key)}
              type="button"
            >
              {g.title}
            </button>
          ))}
        </nav>
        <input aria-label="Artikel suchen" className="h-10 w-full rounded-full border border-line bg-card px-4 text-sm outline-none focus:border-accent sm:w-56" onChange={(e) => setQ(e.target.value)} placeholder="Artikel suchen …" type="search" value={q} />
        {katalog ? (
          <a className="inline-flex h-10 items-center rounded-full border border-accent px-4 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" href="/haendler/portal/pass/katalog">
            Gesamtkatalog (PDF)
          </a>
        ) : null}
      </div>

      {visibleGroups.length === 0 ? <p className="mt-10 text-muted">Keine Artikel gefunden.</p> : null}
      {visibleGroups.map((g) => (
        <section className="mt-10" key={g.key}>
          <h2 className="t-h3 mb-4">{g.title}</h2>
          <div className="overflow-hidden rounded-[1.5rem] border border-line bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-line border-b text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Artikel</th>
                  <th className="px-3 py-3 text-right font-medium">1 Tray</th>
                  <th className="px-3 py-3 text-right font-medium">ab 2 Trays<span className="hidden sm:inline"> (je Tray)</span></th>
                  <th className="px-3 py-3 text-right font-medium">Palette</th>
                  <th className="px-4 py-3 text-right font-medium">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown
                  .filter((r) => r.group === g.key)
                  .map((r) => (
                    <tr className="transition hover:bg-white/[0.03]" key={r.handle}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-paper">
                            {r.image ? <Image alt="" className="object-cover" fill sizes="48px" src={r.image} /> : null}
                          </span>
                          <span>
                            <span className="block font-medium">{r.title}</span>
                            <span className="block text-muted text-xs">{r.unit}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Cell cell={r.t1} sub={r.t1.value ? `${euro(Math.round(r.t1.value / r.perTray))} je Stück` : undefined} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Cell cell={r.t2} sub={r.t2.value ? `${euro(Math.round(r.t2.value / r.perTray))} je Stück` : undefined} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Cell cell={r.pal} sub={r.pal.value && r.trays ? `${r.trays} Trays · ${euro(Math.round(r.pal.value / r.trays))} je Tray` : undefined} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.pass ? (
                          <a className="inline-flex h-8 items-center rounded-full border border-accent px-3 font-bold text-accent text-xs transition hover:bg-accent hover:text-black" href={`/haendler/portal/pass/${r.handle}`}>
                            PDF
                          </a>
                        ) : (
                          <span className="text-muted text-xs">folgt</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Cell({ cell, sub }: { cell: DealerPriceCell; sub?: string }) {
  if (!cell.value) return <span className="text-muted">Preis folgt</span>;
  return (
    <>
      <span className="block font-bold tabular-nums">{euro(cell.value)}</span>
      {sub ? <span className="block text-muted text-xs tabular-nums">{sub}</span> : null}
    </>
  );
}
