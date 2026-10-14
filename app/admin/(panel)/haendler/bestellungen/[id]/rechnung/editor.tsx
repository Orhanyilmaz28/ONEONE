"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { type InvoicePayload, saveInvoiceAction } from "./actions";
import { Badge, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { invoiceTotals } from "@/lib/dealer-invoice";
import { formatPrice } from "@/lib/format";

type Status = { number: string; released: boolean; paid: boolean; replaced: string[] } | undefined;
type LineForm = { text: string; qty: string; unit: string; price: string; deposit: string };

const toEuro = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const toCents = (s: string) => {
  const n = Number(String(s).replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const toNum = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Rechnung bearbeiten: Positionen, Versand, Rabatt, Daten, Adresse – mit Live-Summen */
export function InvoiceEditor({ orderId, initial, status }: { orderId: string; initial: InvoicePayload; status: Status }) {
  const router = useRouter();
  const [lines, setLines] = useState<LineForm[]>(initial.lines.map((l) => ({ text: l.text, qty: String(l.qty).replace(".", ","), unit: l.unit, price: toEuro(l.price), deposit: String(l.deposit) })));
  const [f, setF] = useState({
    date: initial.date,
    serviceDate: initial.serviceDate,
    dueDays: String(initial.dueDays),
    shipping: toEuro(initial.shippingNet),
    shippingText: initial.shippingText,
    discount: toEuro(initial.discountNet),
    discountText: initial.discountText,
    note: initial.note,
  });
  const [billTo, setBillTo] = useState(initial.billTo);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const payload: InvoicePayload = useMemo(
    () => ({
      date: f.date,
      serviceDate: f.serviceDate,
      dueDays: Number(f.dueDays) || 0,
      lines: lines.map((l) => ({ text: l.text, qty: toNum(l.qty), unit: l.unit, price: toCents(l.price), deposit: Math.round(toNum(l.deposit)) })),
      shippingNet: toCents(f.shipping),
      shippingText: f.shippingText,
      discountNet: toCents(f.discount),
      discountText: f.discountText,
      note: f.note,
      billTo,
    }),
    [f, lines, billTo],
  );
  const t = invoiceTotals({ ...payload, vatRate: 19 });

  const run = (mode: "save" | "release" | "paid" | "unpaid") =>
    start(async () => {
      const res = await saveInvoiceAction(orderId, payload, mode).catch(() => ({ ok: false as const, error: "Keine Verbindung." }));
      setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });

  const setLine = (i: number, k: keyof LineForm, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {status ? (
          <>
            <Badge tone={status.paid ? "green" : status.released ? "blue" : "amber"}>{status.paid ? "Bezahlt" : status.released ? "Für Händler freigegeben" : "Entwurf – Händler sieht sie noch nicht"}</Badge>
            {status.replaced.length ? <span className="text-[13px] text-muted">ersetzt {status.replaced.join(", ")}</span> : null}
            <Link className="ml-auto text-[14px] underline" href={`/admin/haendler/bestellungen/${orderId}/rechnung/ansicht`}>
              Ansicht / als PDF speichern →
            </Link>
          </>
        ) : (
          <Badge tone="amber">Noch nicht gespeichert – Vorschlag aus der Bestellung</Badge>
        )}
      </div>
      {status?.released ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Diese Rechnung ist schon freigegeben. Änderungen an Positionen, Beträgen, Daten oder Adresse erzeugen eine <b>Korrektur mit neuer Rechnungsnummer</b> – die alte gilt dann als ersetzt (storniert). Der Händler wird informiert.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <h2 className="border-line border-b px-6 py-4 font-medium text-[15px]">Positionen (netto)</h2>
        <div className="hidden grid-cols-[1fr_6rem_6rem_8rem_6rem_7rem_2rem] gap-2 px-6 pt-3 text-[12px] text-muted lg:grid">
          <span>Bezeichnung</span>
          <span>Menge</span>
          <span>Einheit</span>
          <span>Einzelpreis €</span>
          <span>Pfand-Stück je Einheit</span>
          <span className="text-right">Gesamt</span>
          <span />
        </div>
        <div className="divide-y divide-line">
          {lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
            <div className="grid items-center gap-2 px-6 py-3 lg:grid-cols-[1fr_6rem_6rem_8rem_6rem_7rem_2rem]" key={i}>
              <input aria-label="Bezeichnung" className={input} onChange={(e) => setLine(i, "text", e.target.value)} value={l.text} />
              <input aria-label="Menge" className={`${input} text-right`} inputMode="decimal" onChange={(e) => setLine(i, "qty", e.target.value)} value={l.qty} />
              <input aria-label="Einheit" className={input} onChange={(e) => setLine(i, "unit", e.target.value)} value={l.unit} />
              <input aria-label="Einzelpreis netto" className={`${input} text-right`} inputMode="decimal" onChange={(e) => setLine(i, "price", e.target.value)} value={l.price} />
              <input aria-label="Pfand-Stück je Einheit" className={`${input} text-right`} inputMode="numeric" onChange={(e) => setLine(i, "deposit", e.target.value)} value={l.deposit} />
              <span className="text-right text-[14px] tabular-nums">{formatPrice(Math.round(toNum(l.qty) * toCents(l.price)))}</span>
              <button aria-label="Position entfernen" className="text-muted hover:text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== i))} type="button">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="px-6 py-4">
          <button className={btnSecondary} onClick={() => setLines([...lines, { text: "", qty: "1", unit: "Tray", price: "0,00", deposit: "24" }])} type="button">
            + Position
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-3 rounded-3xl border border-line bg-card p-6">
          <h2 className="font-medium text-[15px]">Versand, Rabatt & Summen</h2>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input aria-label="Text Versand" className={input} onChange={(e) => setF({ ...f, shippingText: e.target.value })} value={f.shippingText} />
            <input aria-label="Versand netto €" className={`${input} text-right`} inputMode="decimal" onChange={(e) => setF({ ...f, shipping: e.target.value })} value={f.shipping} />
            <input aria-label="Text Rabatt" className={input} onChange={(e) => setF({ ...f, discountText: e.target.value })} value={f.discountText} />
            <input aria-label="Rabatt netto €" className={`${input} text-right`} inputMode="decimal" onChange={(e) => setF({ ...f, discount: e.target.value })} value={f.discount} />
          </div>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[14px]">
            <dt className="text-muted">Warenwert netto</dt>
            <dd className="text-right tabular-nums">{formatPrice(t.goodsNet)}</dd>
            <dt className="text-muted">Pfand ({t.depositUnits.toLocaleString("de-DE")} × 0,25 €)</dt>
            <dd className="text-right tabular-nums">{formatPrice(t.depositNet)}</dd>
            <dt className="text-muted">Versand / Rabatt</dt>
            <dd className="text-right tabular-nums">
              {formatPrice(payload.shippingNet)} / −{formatPrice(payload.discountNet)}
            </dd>
            <dt className="text-muted">Summe netto · 19 % USt.</dt>
            <dd className="text-right tabular-nums">
              {formatPrice(t.net)} · {formatPrice(t.vat)}
            </dd>
            <dt className="font-medium">Gesamtbetrag</dt>
            <dd className="text-right font-medium text-[17px] tabular-nums">{formatPrice(t.gross)}</dd>
          </dl>
        </section>

        <section className="grid content-start gap-3 rounded-3xl border border-line bg-card p-6">
          <h2 className="font-medium text-[15px]">Daten & Rechnungsadresse</h2>
          <div className="grid grid-cols-3 gap-2">
            <label className="grid gap-1">
              <span className={label}>Rechnungsdatum</span>
              <input className={input} onChange={(e) => setF({ ...f, date: e.target.value })} type="date" value={f.date} />
            </label>
            <label className="grid gap-1">
              <span className={label}>Leistungsdatum</span>
              <input className={input} onChange={(e) => setF({ ...f, serviceDate: e.target.value })} type="date" value={f.serviceDate} />
            </label>
            <label className="grid gap-1">
              <span className={label}>Zahlungsziel (Tage)</span>
              <input className={input} inputMode="numeric" onChange={(e) => setF({ ...f, dueDays: e.target.value.replace(/\D/g, "") })} value={f.dueDays} />
            </label>
          </div>
          {(["company", "contact", "street"] as const).map((k) => (
            <input aria-label={k} className={input} key={k} onChange={(e) => setBillTo({ ...billTo, [k]: e.target.value })} placeholder={k === "company" ? "Firma" : k === "contact" ? "Ansprechpartner:in" : "Straße und Hausnummer"} value={billTo[k]} />
          ))}
          <div className="grid grid-cols-[7rem_1fr_10rem] gap-2">
            <input aria-label="PLZ" className={input} onChange={(e) => setBillTo({ ...billTo, zip: e.target.value })} placeholder="PLZ" value={billTo.zip} />
            <input aria-label="Ort" className={input} onChange={(e) => setBillTo({ ...billTo, city: e.target.value })} placeholder="Ort" value={billTo.city} />
            <input aria-label="USt-IdNr." className={input} onChange={(e) => setBillTo({ ...billTo, vatId: e.target.value })} placeholder="USt-IdNr." value={billTo.vatId} />
          </div>
          <label className="grid gap-1">
            <span className={label}>Hinweis auf der Rechnung (optional)</span>
            <textarea className={`${input} h-20`} maxLength={1500} onChange={(e) => setF({ ...f, note: e.target.value })} value={f.note} />
          </label>
        </section>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-full border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
        <button className={btnSecondary} disabled={pending} onClick={() => run("save")} type="button">
          {pending ? "…" : "Speichern"}
        </button>
        {!status?.released ? (
          <button className={btn} disabled={pending} onClick={() => run("release")} type="button">
            Speichern & an Händler freigeben
          </button>
        ) : null}
        {status?.paid ? (
          <button className={btnSecondary} disabled={pending} onClick={() => run("unpaid")} type="button">
            Zahlung zurücksetzen
          </button>
        ) : (
          <button className={btn} disabled={pending || !status} onClick={() => run("paid")} title={status ? "" : "Erst speichern"} type="button">
            Als bezahlt markieren
          </button>
        )}
        {msg ? <span className={`text-[14px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span> : null}
      </div>
    </div>
  );
}
