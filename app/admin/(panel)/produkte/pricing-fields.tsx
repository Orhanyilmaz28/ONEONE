"use client";

/** Bausteine für „Preis & Verkauf“ und „Zutaten & Nährwerte“ auf der Bearbeiten-Seite (product-workspace.tsx) */
import { type ReactNode, useId, useState } from "react";
import { btnSecondary, input, label } from "@/components/admin/ui";
import {
  MATERIAL_MAX,
  type MaterialCheck,
  type VariantInput,
  type VariantValue,
  centsToInput,
  checkVariant,
  euro,
  field,
  parseEuro,
  rangeError,
} from "./pricing";

/** Kleinere Variante des Zweit-Knopfs */
export const btnSecondarySm = btnSecondary.replace("px-5 py-2.5", "px-4 py-2");

/* ───────────────────────── Daten, die die Seite mitgibt ───────────────────────── */

export type EditorVariant = {
  id: string;
  title: string;
  options: Record<string, string>;
  /** Werte aus dem Grundkatalog */
  original: VariantValue;
  /** Aktuell gespeicherter Stand (mit Dashboard-Änderungen) */
  saved: VariantValue;
};

export type EditorProduct = {
  handle: string;
  title: string;
  image?: { src: string; alt: string };
  collections: string[];
  options: { name: string; values: string[] }[];
  variants: EditorVariant[];
  saved: { hidden: boolean; featured: boolean };
  /** Gespeicherte Zutaten & Nährwerte („“ = fehlt noch) */
  material: string;
  /** Was ist gegenüber dem Original gespeichert? (für „Zurücksetzen“) */
  changed: { hidden: boolean; featured: boolean; variants: number } | null;
};

export type Values = { visible: boolean; featured: boolean; material: string; variants: Record<string, VariantInput> };

export function toValues(p: EditorProduct): Values {
  return {
    visible: !p.saved.hidden,
    featured: p.saved.featured,
    material: p.material,
    variants: Object.fromEntries(
      p.variants.map((v) => [v.id, { price: centsToInput(v.saved.price), compare: centsToInput(v.saved.compareAtPrice), available: v.saved.available }]),
    ),
  };
}

/** Unterscheidet sich die Eingabe von einem Stand? (Vergleich in Cent, nicht als Text) */
export function differs(entry: VariantInput, ref: VariantValue) {
  const price = parseEuro(entry.price);
  const compare = parseEuro(entry.compare);
  if (price.error || compare.error) return true;
  return price.cents !== ref.price || (compare.cents ?? undefined) !== ref.compareAtPrice || entry.available !== ref.available;
}

/** Beschriftung einer Variante innerhalb ihrer Gruppe, z. B. „Größe S“ */
export function variantLabel(v: EditorVariant, groupOption?: string) {
  const rest = Object.entries(v.options).filter(([name]) => name !== groupOption);
  if (!rest.length) return v.title;
  // „Größe Damen S · Größe Herren M“ → „Damen S · Herren M“ (gemeinsames erstes Wort weglassen)
  const firstWords = rest.map(([name]) => name.split(" "));
  const shared = rest.length > 1 && firstWords.every((w) => w.length > 1 && w[0] === firstWords[0][0]);
  return rest.map(([name, value]) => `${shared ? name.split(" ").slice(1).join(" ") : name} ${value}`).join(" · ");
}

export function percentOff(price: number, compare?: number) {
  if (!compare || compare <= price) return 0;
  return Math.round((1 - price / compare) * 100);
}

export function describeChanges(c: NonNullable<EditorProduct["changed"]>) {
  const parts: string[] = [];
  if (c.variants) parts.push(c.variants === 1 ? "1 Variante" : `${c.variants} Varianten`);
  if (c.hidden) parts.push("die Sichtbarkeit");
  if (c.featured) parts.push("die Bestseller-Markierung");
  if (parts.length < 2) return parts[0] ?? "etwas";
  return `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
}

/* ───────────────────────── Bausteine ───────────────────────── */

/** Zutaten & Nährwerte mit Zeichenzähler und Erklärung der Pflicht */
export function MaterialField({ value, check, error, onChange, onBlur }: { value: string; check: MaterialCheck; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const id = useId();
  const length = check.value.length;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label className={label} htmlFor={`${id}-material`}>
          Zutaten, Nährwerte & Allergene
        </label>
        <span aria-hidden className={`mb-1.5 shrink-0 text-[12.5px] tabular-nums ${length > MATERIAL_MAX ? "text-red-700" : length > MATERIAL_MAX - 20 ? "text-amber-700" : "text-muted"}`}>
          {length}/{MATERIAL_MAX}
        </span>
      </div>
      <textarea
        aria-describedby={`${id}-material-msg ${id}-material-help`}
        aria-invalid={error ? true : undefined}
        className={`${input} min-h-[4.5rem] resize-y leading-snug placeholder:text-ink/35 ${error ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : check.value ? "" : "border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-100"}`}
        id={`${id}-material`}
        maxLength={MATERIAL_MAX}
        name="material"
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder="z. B. Zutaten: Wasser, Zucker, … · Nährwerte je 100 ml: Brennwert … · Koffein: … mg/100 ml"
        rows={3}
        value={value}
      />
      <div id={`${id}-material-msg`}>
        {error ? (
          <p className="mt-1.5 text-[13px] text-red-700 leading-snug">{error}</p>
        ) : check.hint ? (
          <p className="mt-1.5 text-[13px] text-amber-800 leading-snug">{check.hint}</p>
        ) : null}
      </div>
      <p className="mt-2 text-[12.5px] text-muted leading-relaxed" id={`${id}-material-help`}>
        Pflicht beim Online-Verkauf von Lebensmitteln: Zutaten, Allergene und Nährwerte – am besten genau wie auf der Dose, mit Koffeingehalt. Steht im Shop unter
        „Zutaten & Nährwerte“.
      </p>
    </div>
  );
}

/** Schalter mit verstecktem Rückfallwert „0“, damit der Server „aus“ sicher erkennt */
export function SwitchRow({ name, label: text, description, checked, onChange }: { name: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label
      className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4 transition hover:border-ink/30 has-focus-visible:ring-4 has-focus-visible:ring-ink/15"
      htmlFor={id}
    >
      <span className="min-w-0">
        <span className="block font-medium text-[15px]">{text}</span>
        <span className="mt-0.5 block text-[13px] text-muted leading-snug">{description}</span>
      </span>
      <input name={name} type="hidden" value="0" />
      <input checked={checked} className="peer sr-only" id={id} name={name} onChange={(e) => onChange(e.target.checked)} role="switch" type="checkbox" value="1" />
      <Track />
    </label>
  );
}

export function Track({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative mt-0.5 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-ink after:absolute after:top-0.5 after:left-0.5 after:rounded-full after:bg-card after:shadow-[0_1px_3px_rgba(0,0,0,0.25)] after:transition-transform after:content-[''] ${small ? "h-5 w-9 after:size-4 peer-checked:after:translate-x-4" : "h-6 w-11 after:size-5 peer-checked:after:translate-x-5"}`}
    />
  );
}

export function MiniButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="rounded-full border border-line bg-card px-3 py-1 font-medium text-[12.5px] text-ink/80 transition hover:border-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 disabled:cursor-default disabled:opacity-40 disabled:hover:border-line"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Schnell-Aktionen: einen Preis / Streichpreis / die Verfügbarkeit für alle Varianten eintragen */
export function BulkTools({ count, onPrice, onCompare, onAvailability }: { count: number; onPrice: (text: string) => void; onCompare: (text: string) => void; onAvailability: (v: boolean) => void }) {
  const [price, setPrice] = useState("");
  const [compare, setCompare] = useState("");
  const [priceError, setPriceError] = useState<string>();
  const [compareError, setCompareError] = useState<string>();
  const [message, setMessage] = useState("");
  const id = useId();

  function applyPrice() {
    const p = parseEuro(price);
    const err = p.error ?? (p.cents === null || p.cents === undefined ? "Bitte zuerst einen Preis eingeben." : rangeError(p.cents));
    setPriceError(err);
    if (err || p.cents == null) return;
    onPrice(centsToInput(p.cents));
    setPrice(centsToInput(p.cents));
    setMessage(`Preis ${euro(p.cents)} bei allen ${count} Varianten eingetragen – jetzt noch speichern.`);
  }
  function applyCompare() {
    const c = parseEuro(compare);
    if (c.error) return setCompareError(c.error);
    if (c.cents === null || c.cents === undefined) {
      setCompareError(undefined);
      onCompare("");
      setMessage(`Streichpreise bei allen ${count} Varianten entfernt – jetzt noch speichern.`);
      return;
    }
    const err = rangeError(c.cents, "Der Streichpreis");
    setCompareError(err);
    if (err) return;
    onCompare(centsToInput(c.cents));
    setCompare(centsToInput(c.cents));
    setMessage(`Streichpreis ${euro(c.cents)} bei allen ${count} Varianten eingetragen – jetzt noch speichern.`);
  }
  function onEnter(e: React.KeyboardEvent<HTMLInputElement>, apply: () => void) {
    // Enter soll hier nur übernehmen – nicht das ganze Formular speichern
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <p className="font-medium text-[14px]">Für alle {count} Varianten auf einmal</p>
      <div className="mt-3 grid gap-4 @[34rem]:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${id}-price`}>
            Preis setzen
          </label>
          <div className="flex gap-2">
            <EuroInput
              aria-describedby={priceError ? `${id}-price-error` : undefined}
              aria-invalid={priceError ? true : undefined}
              id={`${id}-price`}
              invalid={Boolean(priceError)}
              onChange={(v) => {
                setPrice(v);
                setPriceError(undefined);
              }}
              onKeyDown={(e) => onEnter(e, applyPrice)}
              placeholder="z. B. 29,90"
              value={price}
            />
            <button className={`${btnSecondarySm} shrink-0`} onClick={applyPrice} type="button">
              Übernehmen
            </button>
          </div>
          {priceError ? (
            <p className="mt-1.5 text-[13px] text-red-700" id={`${id}-price-error`}>
              {priceError}
            </p>
          ) : null}
        </div>
        <div>
          <label className={label} htmlFor={`${id}-compare`}>
            Streichpreis setzen <span className="font-normal text-muted">(leer = entfernen)</span>
          </label>
          <div className="flex gap-2">
            <EuroInput
              aria-describedby={compareError ? `${id}-compare-error` : undefined}
              aria-invalid={compareError ? true : undefined}
              id={`${id}-compare`}
              invalid={Boolean(compareError)}
              onChange={(v) => {
                setCompare(v);
                setCompareError(undefined);
              }}
              onKeyDown={(e) => onEnter(e, applyCompare)}
              placeholder="z. B. 39,90"
              value={compare}
            />
            <button className={`${btnSecondarySm} shrink-0`} onClick={applyCompare} type="button">
              {compare.trim() ? "Übernehmen" : "Entfernen"}
            </button>
          </div>
          {compareError ? (
            <p className="mt-1.5 text-[13px] text-red-700" id={`${id}-compare-error`}>
              {compareError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-ink/70">Verfügbarkeit:</span>
        <MiniButton
          onClick={() => {
            onAvailability(true);
            setMessage(`Alle ${count} Varianten als verfügbar markiert – jetzt noch speichern.`);
          }}
        >
          Alle verfügbar
        </MiniButton>
        <MiniButton
          onClick={() => {
            onAvailability(false);
            setMessage(`Alle ${count} Varianten als ausverkauft markiert – jetzt noch speichern.`);
          }}
        >
          Alle ausverkauft
        </MiniButton>
      </div>
      <p aria-live="polite" className={`mt-3 text-[13px] ${message ? "text-sky-800" : "text-muted"}`} role="status">
        {message || "Diese Knöpfe füllen nur die Felder unten aus. Gespeichert wird erst mit „Speichern“."}
      </p>
    </div>
  );
}

type EuroInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
};

/** Eingabefeld für Euro-Beträge (Komma als Dezimaltrennzeichen, „€“ rechts) */
export function EuroInput({ value, onChange, invalid, className = "", ...rest }: EuroInputProps) {
  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <input
        {...rest}
        autoComplete="off"
        className={`${input} py-2 pr-8 text-right tabular-nums placeholder:text-ink/35 ${invalid ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100" : ""}`}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        type="text"
        value={value}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[14px] text-muted">
        €
      </span>
    </div>
  );
}

/** Eine Zeile je Variante: Preis, Streichpreis, Verfügbar */
export function VariantRow({
  variant: v,
  label: text,
  value,
  check,
  showErrors,
  serverErrors,
  onChange,
  onBlur,
}: {
  variant: EditorVariant;
  label: string;
  value: VariantInput;
  check: ReturnType<typeof checkVariant>;
  showErrors: { price: boolean; compare: boolean };
  serverErrors?: Record<string, string>;
  onChange: (patch: Partial<VariantInput>) => void;
  onBlur: (key: "price" | "compare") => void;
}) {
  const id = useId();
  const priceError = (showErrors.price ? check.errors.price : undefined) ?? serverErrors?.[field.price(v.id)];
  const compareError = (showErrors.compare ? check.errors.compare : undefined) ?? serverErrors?.[field.compare(v.id)];
  const changed = differs(value, v.original);
  const off = check.value ? percentOff(check.value.price, check.value.compareAtPrice) : 0;
  const o = v.original;

  const describe = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 py-4 @[34rem]:grid-cols-[minmax(0,1fr)_8rem_8rem_5.5rem] @[34rem]:gap-x-4 @[34rem]:py-3">
      {/* Bezeichnung + Original-Werte aus dem Katalog */}
      <div className="col-span-3 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 @[34rem]:col-span-1 @[34rem]:block">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {changed ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-sky-500" title="angepasst" /> : null}
          <span className={`font-medium text-[15px] ${value.available ? "" : "text-ink/50"}`}>
            {text}
            {changed ? <span className="sr-only"> (angepasst)</span> : null}
          </span>
          {off > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-px font-medium text-[11.5px] text-emerald-700 ring-1 ring-emerald-200/60">−{off} %</span> : null}
          {changed ? (
            // Nach einer Änderung: Klick holt die Original-Werte dieser Variante zurück
            <button
              aria-label={`Original-Werte für ${v.title} wieder eintragen`}
              className="-my-1 inline-flex size-6 items-center justify-center rounded-full text-sky-700 transition hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              onClick={() => onChange({ price: centsToInput(o.price), compare: centsToInput(o.compareAtPrice), available: o.available })}
              title="Original-Werte wieder eintragen"
              type="button"
            >
              <ResetIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        <p className="text-[12.5px] text-muted leading-snug tabular-nums @[34rem]:mt-0.5" id={`${id}-orig`}>
          <OriginalText o={o} />
        </p>
      </div>

      {/* Preis */}
      <div className="min-w-0">
        <span aria-hidden className="mb-1 block text-[12px] text-muted @[34rem]:hidden">
          Preis
        </span>
        <EuroInput
          aria-describedby={describe(`${id}-orig`, priceError ? `${id}-err` : false)}
          aria-invalid={priceError ? true : undefined}
          aria-label={`Preis für ${v.title}`}
          id={`${id}-p`}
          invalid={Boolean(priceError)}
          maxLength={20}
          name={field.price(v.id)}
          onBlur={() => onBlur("price")}
          onChange={(price) => onChange({ price })}
          value={value.price}
        />
      </div>

      {/* Streichpreis */}
      <div className="min-w-0">
        <span aria-hidden className="mb-1 block text-[12px] text-muted @[34rem]:hidden">
          Streichpreis
        </span>
        <EuroInput
          aria-describedby={describe(`${id}-orig`, compareError ? `${id}-err` : false)}
          aria-invalid={compareError ? true : undefined}
          aria-label={`Streichpreis für ${v.title} (optional)`}
          id={`${id}-c`}
          invalid={Boolean(compareError)}
          maxLength={20}
          name={field.compare(v.id)}
          onBlur={() => onBlur("compare")}
          onChange={(compare) => onChange({ compare })}
          placeholder="–"
          value={value.compare}
        />
      </div>

      {/* Verfügbar */}
      <div className="flex flex-col items-start @[34rem]:min-h-10 @[34rem]:justify-center">
        <span aria-hidden className="mb-1 block text-[12px] text-muted @[34rem]:hidden">
          Verfügbar
        </span>
        <label className="flex cursor-pointer items-center gap-2 py-2 has-focus-visible:rounded-full has-focus-visible:ring-4 has-focus-visible:ring-ink/15" htmlFor={`${id}-a`}>
          <input name={field.available(v.id)} type="hidden" value="0" />
          <input
            aria-label={`${v.title} verfügbar`}
            checked={value.available}
            className="peer sr-only"
            id={`${id}-a`}
            name={field.available(v.id)}
            onChange={(e) => onChange({ available: e.target.checked })}
            type="checkbox"
            value="1"
          />
          <Track small />
          <span aria-hidden className={`hidden text-[13px] @[34rem]:inline ${value.available ? "text-ink/80" : "text-red-700"}`}>
            {value.available ? "Ja" : "Nein"}
          </span>
        </label>
      </div>

      {/* Fehler über die ganze Breite, damit sie gut lesbar sind */}
      {priceError || compareError ? (
        <div className="col-span-full -mt-1 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800" id={`${id}-err`}>
          {priceError ? <p>Preis: {priceError}</p> : null}
          {compareError ? <p>Streichpreis: {compareError}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function OriginalText({ o }: { o: VariantValue }) {
  return (
    <>
      Original: {euro(o.price)}
      {o.compareAtPrice ? <> statt {euro(o.compareAtPrice)}</> : null}
      {o.available ? null : <> · ausverkauft</>}
    </>
  );
}

export function StatusDot({ tone }: { tone: "neutral" | "amber" | "red" | "green" }) {
  if (tone === "green") return <CheckIcon className="size-4 shrink-0 text-emerald-600" />;
  const color = { neutral: "bg-ink/25", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${color}`} />;
}

export function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ResetIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
