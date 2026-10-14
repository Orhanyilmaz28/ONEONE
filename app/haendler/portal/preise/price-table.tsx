"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PdfLink, Sheet } from "@/components/dealer-dialog";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { type DealerPriceCell, type DealerRow, toOrderRow } from "@/lib/dealer-catalog";
import { MAX_TRAYS_PER_LINE, PALLET_MIN_TRAYS, type PriceTier, TIER_LABELS, calcDealerOrder, cleanQty } from "@/lib/dealer-order-calc";
import { formatPrice as euro } from "@/lib/format";
import { type PlaceOrderInput, placeDealerOrderAction } from "./order-actions";

type Address = PlaceOrderInput["delivery"];
const STORAGE = "exstase-haendler-bestellung";

/** Durchsuchbare Preisliste mit Bestellfunktion (Mengen je Sorte → Bestellleiste → Bestellung auf Rechnung) */
export function PriceTable({
  rows,
  groups,
  katalog,
  shipping,
  address,
  initialQty,
}: {
  rows: DealerRow[];
  groups: { key: string; title: string }[];
  katalog: boolean;
  shipping: { cost: number; freeFrom: number };
  address: Address;
  /** „Nochmal bestellen“: Mengen einer früheren Bestellung */
  initialQty?: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("alle");
  const [qty, setQty] = useState<Record<string, number>>(initialQty ?? {});
  const [sheet, setSheet] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (group === "alle" || r.group === group) && (!s || r.title.toLowerCase().includes(s)));
  }, [rows, q, group]);
  const visibleGroups = groups.filter((g) => shown.some((r) => r.group === g.key));
  const orderRows = useMemo(() => rows.map(toOrderRow), [rows]);
  const calc = useMemo(() => calcDealerOrder(orderRows, qty, shipping), [orderRows, qty, shipping]);
  const activeTier = useMemo(() => Object.fromEntries(calc.lines.map((l) => [l.handle, l.tier])) as Record<string, PriceTier>, [calc]);

  // Mengen im Browser merken (nur Komfort – zählt nichts, der Server rechnet beim Bestellen neu)
  useEffect(() => {
    if (initialQty) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
      if (saved && typeof saved === "object") setQty(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, cleanQty(v)]).filter(([, v]) => (v as number) > 0)));
    } catch {}
  }, [initialQty]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(qty));
    } catch {}
  }, [qty]);

  const set = (handle: string, n: number) => setQty((cur) => ({ ...cur, [handle]: Math.max(0, Math.min(MAX_TRAYS_PER_LINE, Math.floor(n) || 0)) }));

  return (
    <div className={`mt-8 ${calc.trays ? "pb-32" : ""}`}>
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
          <PdfLink className="inline-flex h-10 items-center rounded-full border border-accent px-4 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" href="/haendler/portal/pass/katalog" title="Gesamtkatalog">
            Gesamtkatalog (PDF)
          </PdfLink>
        ) : null}
      </div>

      <p className="mt-6 text-muted text-sm">
        Menge je Sorte in Trays wählen und unten auf <b className="text-ink">Bestellen</b> tippen. Der Staffelpreis richtet sich nach der Gesamtmenge deiner Bestellung (Sorten gemischt), ab {PALLET_MIN_TRAYS} Trays gilt der Palettenpreis. Bezahlung auf Rechnung.
      </p>

      {visibleGroups.length === 0 ? <p className="mt-10 text-muted">Keine Artikel gefunden.</p> : null}
      {visibleGroups.map((g) => (
        <section className="mt-10" key={g.key}>
          <h2 className="t-h3 mb-4">{g.title}</h2>
          <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-card">
            <table className="w-full text-left text-sm sm:min-w-[620px]">
              <thead className="border-line border-b text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Artikel</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">1 Tray</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">ab 2 Trays (je Tray)</th>
                  <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Palette</th>
                  <th className="px-4 py-3 text-right font-medium">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown
                  .filter((r) => r.group === g.key)
                  .map((r) => {
                    const orderable = toOrderRow(r).orderable;
                    const n = qty[r.handle] ?? 0;
                    const tier = n ? activeTier[r.handle] : undefined;
                    return (
                      <tr className={`transition ${n ? "bg-accent/[0.06]" : "hover:bg-white/[0.03]"}`} key={r.handle}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-3">
                            <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-paper">
                              {r.image ? <Image alt="" className="object-cover" fill sizes="48px" src={r.image} /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium">{r.title}</span>
                              <span className="block text-muted text-xs">{r.unit}</span>
                              {r.artNr || r.gtin ? (
                                <span className="block text-[11px] text-muted tabular-nums">
                                  {[r.artNr && `Art.-Nr. ${r.artNr}`, r.gtin && `EAN ${r.gtin}`].filter(Boolean).join(" · ")}
                                </span>
                              ) : null}
                              {/* Handy: Preise kompakt statt eigener Spalten */}
                              {r.lkw ? (
                                <Link className="mt-1 block font-bold text-accent text-xs sm:hidden" href={`/palette?produkt=${r.group === "wasser" ? "wasser" : "ice-tea"}&sorte=${r.handle}&lkw=1`}>
                                  Nur per LKW auf Anfrage →
                                </Link>
                              ) : (
                                <span className="mt-1 flex flex-wrap gap-1 text-[11px] sm:hidden">
                                  {(["t1", "t2", "pal"] as const).map((k) => (
                                    <span className={`rounded-md px-1.5 py-0.5 tabular-nums ${tier === k ? "bg-accent font-bold text-black" : "bg-white/5 text-muted"}`} key={k}>
                                      {k === "t1" ? "1 Tray" : k === "t2" ? "ab 2" : "Palette"} {r[k].value ? euro(r[k].value) : "folgt"}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {orderable ? (
                                <Stepper label={r.title} onChange={(v) => set(r.handle, v)} value={n} />
                              ) : !r.lkw && !r.available ? (
                                <span className="mt-1 block text-muted text-xs">Derzeit nicht lieferbar</span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        {r.lkw ? (
                          <td className="hidden px-3 py-3 text-right sm:table-cell" colSpan={3}>
                            <span className="block font-bold text-accent">Nur per LKW auf Anfrage</span>
                            <Link className="text-muted text-xs underline-offset-4 hover:text-accent hover:underline" href={`/palette?produkt=${r.group === "wasser" ? "wasser" : "ice-tea"}&sorte=${r.handle}&lkw=1`}>
                              LKW-Ladung anfragen →
                            </Link>
                          </td>
                        ) : (
                          <>
                            <td className="hidden px-3 py-3 text-right sm:table-cell">
                              <Cell active={tier === "t1"} cell={r.t1} sub={r.t1.value ? `${euro(Math.round(r.t1.value / r.perTray))} je Stück` : undefined} />
                            </td>
                            <td className="hidden px-3 py-3 text-right sm:table-cell">
                              <Cell active={tier === "t2"} cell={r.t2} sub={r.t2.value ? `${euro(Math.round(r.t2.value / r.perTray))} je Stück` : undefined} />
                            </td>
                            <td className="hidden px-3 py-3 text-right sm:table-cell">
                              <Cell active={tier === "pal"} cell={r.pal} sub={r.pal.value && r.trays ? `${r.trays} Trays · ${euro(Math.round(r.pal.value / r.trays))} je Tray` : undefined} />
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right">
                          {r.pass ? (
                            <PdfLink className="inline-flex h-8 items-center rounded-full border border-accent px-3 font-bold text-accent text-xs transition hover:bg-accent hover:text-black" href={`/haendler/portal/pass/${r.handle}`} title={`Artikelpass ${r.title}`}>
                              PDF
                            </PdfLink>
                          ) : (
                            <span className="text-muted text-xs">folgt</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* Bestellleiste: erscheint, sobald etwas ausgewählt ist */}
      {calc.trays ? (
        <div className="anim-rise fixed inset-x-3 bottom-3 z-30 mx-auto max-w-4xl rounded-[1.75rem] border border-accent/50 bg-card/95 p-3 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur sm:inset-x-6 sm:p-4 lg:left-[19rem]" style={{ animationDuration: "0.4s" }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {calc.trays} {calc.trays === 1 ? "Tray" : "Trays"} · {euro(calc.goodsNet)} <span className="font-normal text-muted text-sm">netto</span>
              </p>
              <p className="text-muted text-xs">
                {calc.pallet ? "Palettenpreis aktiv · Lieferung per Spedition" : calc.trays === 1 ? "Ab 2 Trays gilt der Staffelpreis" : `Noch ${calc.toPallet} Trays bis zum Palettenpreis`}
              </p>
              <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, (calc.trays / PALLET_MIN_TRAYS) * 100)}%` }} />
              </div>
            </div>
            <button className="text-muted text-sm underline-offset-4 hover:text-ink hover:underline" onClick={() => setQty({})} type="button">
              Leeren
            </button>
            <button className="anim-shine relative inline-flex h-12 items-center overflow-hidden rounded-full bg-accent px-7 font-bold text-black transition hover:bg-accent-dark" onClick={() => setSheet(true)} type="button">
              Bestellen
            </button>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <OrderSheet
          address={address}
          calc={calc}
          onClose={() => setSheet(false)}
          onDone={() => setQty({})}
          qty={qty}
        />
      ) : null}
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="mt-2 inline-flex items-center rounded-full border border-line bg-paper">
      <button aria-label={`${label}: 1 Tray weniger`} className="p-2 transition hover:text-accent disabled:opacity-30" disabled={!value} onClick={() => onChange(value - 1)} type="button">
        <MinusIcon className="size-3.5" />
      </button>
      <input
        aria-label={`${label}: Anzahl Trays`}
        className="w-12 bg-transparent text-center font-bold tabular-nums outline-none"
        inputMode="numeric"
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")))}
        onFocus={(e) => e.target.select()}
        value={value || ""}
        placeholder="0"
      />
      <button aria-label={`${label}: 1 Tray mehr`} className="p-2 transition hover:text-accent" onClick={() => onChange(value + 1)} type="button">
        <PlusIcon className="size-3.5" />
      </button>
    </span>
  );
}

function Cell({ cell, sub, active }: { cell: DealerPriceCell; sub?: string; active?: boolean }) {
  if (!cell.value) return <span className="text-muted">Preis folgt</span>;
  return (
    <span className={`inline-block rounded-xl px-2 py-1 transition ${active ? "bg-accent/15 ring-1 ring-accent" : ""}`}>
      <span className={`block font-bold tabular-nums ${active ? "text-accent" : ""}`}>{euro(cell.value)}</span>
      {sub ? <span className="block text-muted text-xs tabular-nums">{sub}</span> : null}
    </span>
  );
}

const field = "h-11 w-full rounded-xl border border-line bg-card px-3 text-sm outline-none transition focus:border-accent";

/** Bestellung prüfen, Lieferdaten ergänzen, verbindlich bestellen */
function OrderSheet({ calc, qty, address, onClose, onDone }: { calc: ReturnType<typeof calcDealerOrder>; qty: Record<string, number>; address: Address; onClose: () => void; onDone: () => void }) {
  const [delivery, setDelivery] = useState<Address>(address);
  const [wishDate, setWishDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await placeDealerOrderAction({ qty, delivery, wishDate: wishDate || undefined, reference, note, expectedGross: calc.gross }).catch(() => ({ ok: false as const, error: "Keine Verbindung – bitte noch einmal versuchen." }));
      if (res.ok) {
        setDone(res.number);
        onDone();
      } else {
        setError(res.error);
        setFields("fields" in res && res.fields ? res.fields : {});
      }
    });
  }

  if (done) {
    return (
      <Sheet onClose={onClose} title="Bestellung eingegangen">
        <div className="px-6 py-10 text-center">
          <p className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent font-black text-3xl text-black">✓</p>
          <h2 className="t-h2 mt-5">Danke für deine Bestellung!</h2>
          <p className="mt-2 text-muted">
            Bestellnummer <b className="text-ink">{done}</b> – die Bestätigung kommt per E-Mail. Bezahlt wird auf Rechnung.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black" href="/haendler/portal/bestellungen">
              Meine Bestellungen
            </Link>
            <button className="inline-flex h-11 items-center rounded-full border border-line px-6" onClick={onClose} type="button">
              Schließen
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const input = (key: keyof Address, label: string, auto: string, extra = "") => (
    <label className={`grid gap-1 text-sm ${extra}`}>
      {label}
      <input autoComplete={auto} className={`${field} ${fields[key] ? "border-red-400" : ""}`} onChange={(e) => setDelivery({ ...delivery, [key]: e.target.value })} required value={delivery[key]} />
      {fields[key] ? <span className="text-red-400 text-xs">{fields[key]}</span> : null}
    </label>
  );

  return (
    <Sheet onClose={onClose} title="Bestellung prüfen">
      <form className="grid min-h-0 gap-6 overflow-y-auto px-4 py-5 sm:px-6 lg:grid-cols-[1.1fr_1fr]" onSubmit={submit}>
        <div>
          <h3 className="mb-2 font-bold">Deine Bestellung</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {calc.lines.map((l) => (
              <li className="flex items-start justify-between gap-3 px-4 py-3 text-sm" key={l.handle}>
                <span>
                  <b>{l.trays} ×</b> {l.title}
                  <span className="block text-muted text-xs">
                    {l.units.toLocaleString("de-DE")} Stück · {euro(l.perTray)} je Tray · {TIER_LABELS[l.tier]}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{euro(l.total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Warenwert netto</dt>
            <dd className="text-right tabular-nums">{euro(calc.goodsNet)}</dd>
            <dt className="text-muted">Pfand ({calc.units.toLocaleString("de-DE")} × 0,25 €)</dt>
            <dd className="text-right tabular-nums">{euro(calc.depositNet)}</dd>
            <dt className="text-muted">{calc.shippingLabel}</dt>
            <dd className="text-right tabular-nums">{calc.shippingNet === null ? "nach Absprache" : calc.shippingNet ? euro(calc.shippingNet) : "kostenlos"}</dd>
            <dt className="text-muted">Summe netto</dt>
            <dd className="text-right tabular-nums">{euro(calc.net)}</dd>
            <dt className="text-muted">zzgl. 19 % MwSt.</dt>
            <dd className="text-right tabular-nums">{euro(calc.vat)}</dd>
            <dt className="mt-2 border-line border-t pt-2 font-bold">Gesamt (voraussichtlich)</dt>
            <dd className="mt-2 border-line border-t pt-2 text-right font-bold text-lg tabular-nums">{euro(calc.gross)}</dd>
          </dl>
          <p className="mt-3 text-muted text-xs">Zahlung auf Rechnung. Maßgeblich ist unsere Rechnung; Versand und Spedition nach unseren Bedingungen.</p>
        </div>

        <div className="grid content-start gap-3">
          <h3 className="font-bold">Lieferung</h3>
          {input("company", "Firma", "organization")}
          {input("contact", "Ansprechpartner:in", "name")}
          {input("street", "Straße und Hausnummer", "street-address")}
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            {input("zip", "PLZ", "postal-code")}
            {input("city", "Ort", "address-level2")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Wunschliefertermin (optional)
              <input className={`${field} ${fields.wishDate ? "border-red-400" : ""}`} min={tomorrow} onChange={(e) => setWishDate(e.target.value)} type="date" value={wishDate} />
              {fields.wishDate ? <span className="text-red-400 text-xs">{fields.wishDate}</span> : null}
            </label>
            <label className="grid gap-1 text-sm">
              Deine Bestellnummer (optional)
              <input className={field} maxLength={60} onChange={(e) => setReference(e.target.value)} value={reference} />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Bemerkung (optional)
            <textarea className={`${field} h-20 py-2`} maxLength={1000} onChange={(e) => setNote(e.target.value)} value={note} />
          </label>
          {error ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-red-300 text-sm">{error}</p> : null}
          <button className="anim-shine relative mt-1 inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-accent font-bold text-black transition hover:bg-accent-dark disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Wird gesendet …" : `Verbindlich bestellen · ${euro(calc.gross)}`}
          </button>
          <p className="text-center text-muted text-xs">Auf Rechnung · Bestätigung per E-Mail</p>
        </div>
      </form>
    </Sheet>
  );
}
