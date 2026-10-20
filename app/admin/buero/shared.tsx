import Link from "next/link";
import { Badge, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { CHANNELS, EXPORTED, PAYMENTS, STATUSES } from "@/lib/office/filters";
import { type OfficeOrder, PAYMENT_LABEL, PROCESSING_LABEL, SHIPPING_LABEL } from "@/lib/office/model";
import { PRESETS } from "@/lib/office/time";
import type { Product } from "@/lib/types";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Suchparameter → einfache Werte (je Name der erste) */
export async function paramsOf(sp: SearchParams): Promise<Record<string, string>> {
  const raw = await sp;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) ?? ""]));
}

/** Parameter für Zeitraum und Filter, die zwischen Übersicht, Liste und Export weitergegeben werden */
export const PASS_KEYS = ["zeitraum", "tag", "kw", "monat", "jahr", "von", "bis", "typ", "zahlung", "status", "exportiert", "kunde", "produkt", "sorte", "q"] as const;
export function passParams(p: Record<string, string>, extra: Record<string, string> = {}) {
  const out = new URLSearchParams();
  for (const k of PASS_KEYS) if (p[k]) out.set(k, p[k]);
  for (const [k, v] of Object.entries(extra)) if (v) out.set(k, v);
  return out.toString();
}

export function PaymentBadge({ o }: { o: OfficeOrder }) {
  const tone = o.paymentStatus === "bezahlt" ? "green" : o.paymentStatus === "offen" ? "amber" : "blue";
  return <Badge tone={tone}>{PAYMENT_LABEL[o.paymentStatus]}</Badge>;
}
export function ProcessingBadge({ o }: { o: OfficeOrder }) {
  const tone = o.processing === "storniert" ? "red" : o.processing === "offen" ? "amber" : o.processing === "in_bearbeitung" ? "blue" : "green";
  return <Badge tone={tone}>{PROCESSING_LABEL[o.processing]}</Badge>;
}
export function ShippingBadge({ o }: { o: OfficeOrder }) {
  return <Badge tone={o.shippingStatus === "versendet" ? "green" : o.shippingStatus === "storniert" ? "red" : "neutral"}>{SHIPPING_LABEL[o.shippingStatus]}</Badge>;
}

const select = `${input} pr-8`;

/** Zeitraum-Auswahl: Voreinstellung plus Felder für Tag, KW, Monat, Jahr und individuellen Zeitraum */
export function RangeFields({ p, defaultPreset = "monat" }: { p: Record<string, string>; defaultPreset?: string }) {
  const preset = p.zeitraum || defaultPreset;
  const custom = ["tag", "kw", "monat-wahl", "jahr-wahl", "zeitraum"].includes(preset);
  return (
    <fieldset className="space-y-3">
      <legend className={label}>Zeitraum (deutsche Zeit)</legend>
      <select aria-label="Zeitraum" className={select} defaultValue={preset} name="zeitraum">
        {PRESETS.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
          </option>
        ))}
      </select>
      <details className="rounded-2xl border border-line px-4 py-3" open={custom}>
        <summary className="cursor-pointer text-[13px] text-ink/70">Bestimmter Tag, KW, Monat, Jahr oder eigener Zeitraum</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="f-tag">
              Bestimmter Tag
            </label>
            <input className={input} defaultValue={p.tag} id="f-tag" name="tag" type="date" />
          </div>
          <div>
            <label className={label} htmlFor="f-kw">
              Kalenderwoche (z. B. 2026-W43)
            </label>
            <input className={input} defaultValue={p.kw} id="f-kw" name="kw" pattern="\d{4}-W\d{1,2}" placeholder="2026-W43" type="week" />
          </div>
          <div>
            <label className={label} htmlFor="f-monat">
              Monat
            </label>
            <input className={input} defaultValue={p.monat} id="f-monat" name="monat" placeholder="2026-10" type="month" />
          </div>
          <div>
            <label className={label} htmlFor="f-jahr">
              Jahr
            </label>
            <input className={input} defaultValue={p.jahr} id="f-jahr" inputMode="numeric" max={2100} min={2000} name="jahr" placeholder="2026" type="number" />
          </div>
          <div>
            <label className={label} htmlFor="f-von">
              Von
            </label>
            <input className={input} defaultValue={p.von} id="f-von" name="von" type="date" />
          </div>
          <div>
            <label className={label} htmlFor="f-bis">
              Bis (einschließlich)
            </label>
            <input className={input} defaultValue={p.bis} id="f-bis" name="bis" type="date" />
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted">Das passende Feld zur Auswahl oben wird verwendet, die anderen werden ignoriert.</p>
      </details>
    </fieldset>
  );
}

/** Filterfelder (frei kombinierbar) */
export function FilterFields({ p, products, lockChannel }: { p: Record<string, string>; products: Product[]; lockChannel?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <label className={label} htmlFor="f-typ">
          Kundenart
        </label>
        <select className={select} defaultValue={p.typ || "alle"} disabled={lockChannel} id="f-typ" name="typ">
          {CHANNELS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-zahlung">
          Zahlung
        </label>
        <select className={select} defaultValue={p.zahlung} id="f-zahlung" name="zahlung">
          {PAYMENTS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-status">
          Status
        </label>
        <select className={select} defaultValue={p.status} id="f-status" name="status">
          {STATUSES.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-exportiert">
          Export
        </label>
        <select className={select} defaultValue={p.exportiert} id="f-exportiert" name="exportiert">
          {EXPORTED.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-kunde">
          Bestimmter Kunde
        </label>
        <input className={input} defaultValue={p.kunde} id="f-kunde" maxLength={100} name="kunde" placeholder="Name, Firma oder E-Mail" type="search" />
      </div>
      <div>
        <label className={label} htmlFor="f-produkt">
          Produkt
        </label>
        <select className={select} defaultValue={p.produkt} id="f-produkt" name="produkt">
          <option value="">Alle Produkte</option>
          {products.map((x) => (
            <option key={x.handle} value={x.handle}>
              {x.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-sorte">
          Sorte (auch in Mixpaketen)
        </label>
        <select className={select} defaultValue={p.sorte} id="f-sorte" name="sorte">
          <option value="">Alle Sorten</option>
          {products
            .filter((x) => !x.contents?.length)
            .map((x) => (
              <option key={x.handle} value={x.handle}>
                {x.title}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="f-q">
          Suche
        </label>
        <input className={input} defaultValue={p.q} id="f-q" maxLength={100} name="q" placeholder="Nr., Name, Ort, PLZ, Sendungsnr." type="search" />
      </div>
    </div>
  );
}

export function FormButtons({ reset, submit }: { reset: string; submit: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} type="submit">
        {submit}
      </button>
      <Link className={btnSecondary} href={reset}>
        Zurücksetzen
      </Link>
    </div>
  );
}

/** Produkte für Auswahllisten (alphabetisch, ohne Duplikate) */
export function productOptions(products: Map<string, Product>) {
  return [...new Map([...products.values()].map((p) => [p.handle, p])).values()].sort((a, b) => a.title.localeCompare(b.title, "de"));
}
