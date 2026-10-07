"use client";

import Image from "next/image";
import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Card, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { type ProductFormState, resetProduct, saveProduct } from "./actions";
import {
  MATERIAL_MAX,
  type MaterialCheck,
  type VariantInput,
  type VariantValue,
  centsToInput,
  checkMaterial,
  checkVariant,
  cleanMaterial,
  euro,
  field,
  parseEuro,
  rangeError,
} from "./pricing";

/** Kleinere Variante des Zweit-Knopfs */
const btnSecondarySm = btnSecondary.replace("px-5 py-2.5", "px-4 py-2");

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

type Values = { visible: boolean; featured: boolean; material: string; variants: Record<string, VariantInput> };

function toValues(p: EditorProduct): Values {
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
function differs(entry: VariantInput, ref: VariantValue) {
  const price = parseEuro(entry.price);
  const compare = parseEuro(entry.compare);
  if (price.error || compare.error) return true;
  return price.cents !== ref.price || (compare.cents ?? undefined) !== ref.compareAtPrice || entry.available !== ref.available;
}

/** Beschriftung einer Variante innerhalb ihrer Gruppe, z. B. „Größe S“ */
function variantLabel(v: EditorVariant, groupOption?: string) {
  const rest = Object.entries(v.options).filter(([name]) => name !== groupOption);
  if (!rest.length) return v.title;
  // „Größe Damen S · Größe Herren M“ → „Damen S · Herren M“ (gemeinsames erstes Wort weglassen)
  const firstWords = rest.map(([name]) => name.split(" "));
  const shared = rest.length > 1 && firstWords.every((w) => w.length > 1 && w[0] === firstWords[0][0]);
  return rest.map(([name, value]) => `${shared ? name.split(" ").slice(1).join(" ") : name} ${value}`).join(" · ");
}

function percentOff(price: number, compare?: number) {
  if (!compare || compare <= price) return 0;
  return Math.round((1 - price / compare) * 100);
}

/* ───────────────────────── Editor ───────────────────────── */

type Props = {
  product: EditorProduct;
  /** Wie viele sichtbare Produkte gerade als Bestseller markiert sind */
  featuredCount: number;
};

export function ProductEditor({ product, featuredCount }: Props) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProduct, {});
  const [resetState, resetAction, resetPending] = useActionState<ProductFormState, FormData>(resetProduct, {});

  const initial = useMemo(() => toValues(product), [product]);
  const initialKey = JSON.stringify(initial);
  const [values, setValues] = useState(initial);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState<string>();
  // Meldungen ausblenden, sobald weiter bearbeitet wird (neue Ergebnisse erscheinen automatisch wieder)
  const [dismissed, setDismissed] = useState<ProductFormState | null>(null);
  const [dismissedReset, setDismissedReset] = useState<ProductFormState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach dem Speichern / Zurücksetzen kommt ein neuer Stand vom Server → Felder daran anpassen
  if (syncedKey !== initialKey) {
    setSyncedKey(initialKey);
    setValues(initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
  }

  const showResult = dismissed !== state;
  const showResetResult = dismissedReset !== resetState;

  // Prüfung aller Varianten (für Fehlermeldungen, Vorschau und „ungespeichert“)
  const checks = useMemo(() => Object.fromEntries(product.variants.map((v) => [v.id, checkVariant(values.variants[v.id])])), [product.variants, values.variants]);
  const materialCheck = useMemo(() => checkMaterial(values.material), [values.material]);
  const errorCount = product.variants.reduce((n, v) => n + Object.keys(checks[v.id].errors).length, 0) + (materialCheck.error ? 1 : 0);
  const unsavedVariants = product.variants.filter((v) => differs(values.variants[v.id], v.saved)).length;
  const materialChanged = materialCheck.value !== product.material;
  const dirty = unsavedVariants > 0 || values.visible === product.saved.hidden || values.featured !== product.saved.featured || materialChanged;

  // Warnung beim Verlassen der Seite mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ── Ändern ── */
  function edit(change: (v: Values) => Values) {
    setValues(change);
    setDismissed(state);
    setDismissedReset(resetState);
    setLocalError(undefined);
  }
  function setVariants(ids: string[], patch: Partial<VariantInput>) {
    edit((v) => {
      const variants = { ...v.variants };
      for (const id of ids) variants[id] = { ...variants[id], ...patch };
      return { ...v, variants };
    });
  }
  function touch(names: string[]) {
    setTouched((t) => ({ ...t, ...Object.fromEntries(names.map((n) => [n, true])) }));
  }
  /** Beim Verlassen eines Feldes „31,9“ schön als „31,90“ schreiben */
  function normalize(id: string, key: "price" | "compare") {
    const parsed = parseEuro(values.variants[id][key]);
    if (!parsed.error && parsed.cents !== null) {
      const text = centsToInput(parsed.cents);
      if (text !== values.variants[id][key]) setValues((v) => ({ ...v, variants: { ...v.variants, [id]: { ...v.variants[id], [key]: text } } }));
    }
    touch([key === "price" ? field.price(id) : field.compare(id)]);
  }

  function discard() {
    setValues(initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
    setDismissed(state);
  }

  /* ── Speichern ── */
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    // Selbst absenden statt nur über `action`: React setzt Formulare nach einer Action sonst zurück.
    e.preventDefault();
    if (pending) return;
    setSubmitted(true);
    if (errorCount) {
      setLocalError(errorCount === 1 ? "Bitte korrigiere das rot markierte Feld." : `Bitte korrigiere die ${errorCount} rot markierten Felder.`);
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setLocalError(undefined);
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  function reset() {
    const data = new FormData();
    data.set("handle", product.handle);
    setConfirmReset(false);
    setDismissed(state);
    startTransition(() => resetAction(data));
  }

  /* ── Vorschau mit den eingegebenen Werten ── */
  const live = product.variants.map((v) => ({ ...(checks[v.id].value ?? v.saved), available: values.variants[v.id].available }));
  const prices = live.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const cheapestCompare = live.filter((x) => x.price === min && x.compareAtPrice && x.compareAtPrice > x.price).map((x) => x.compareAtPrice as number);
  const liveCompare = cheapestCompare.length ? Math.min(...cheapestCompare) : undefined;
  const availableCount = live.filter((x) => x.available).length;
  const soldOut = availableCount === 0;

  /* ── Varianten gruppieren (bei mehreren Optionen nach der ersten, z. B. Farbe) ── */
  const groupOption = product.options.length > 1 ? product.options[0] : undefined;
  const groups = groupOption
    ? [
        ...groupOption.values.map((value) => ({
          key: value,
          title: `${groupOption.name}: ${value}`,
          variants: product.variants.filter((v) => v.options[groupOption.name] === value),
        })),
        // Sicherheitsnetz: Varianten ohne passenden Wert trotzdem zeigen
        { key: "__weitere", title: "Weitere Varianten", variants: product.variants.filter((v) => !groupOption.values.includes(v.options[groupOption.name])) },
      ].filter((g) => g.variants.length)
    : [{ key: "alle", title: "", variants: product.variants }];
  const allIds = product.variants.map((v) => v.id);

  /* ── Statuszeile unten ── */
  let status: { tone: "neutral" | "amber" | "red" | "green"; text: string };
  if (pending) status = { tone: "neutral", text: "Wird gespeichert …" };
  else if (localError) status = { tone: "red", text: localError };
  else if (showResult && state.error) status = { tone: "red", text: state.error };
  else if (dirty)
    status = {
      tone: "amber",
      text:
        unsavedVariants > 0
          ? `Ungespeicherte Änderungen bei ${unsavedVariants === 1 ? "1 Variante" : `${unsavedVariants} Varianten`}`
          : "Ungespeicherte Änderungen",
    };
  else if (showResult && state.message) status = { tone: "green", text: state.message };
  else status = { tone: "neutral", text: "Alles gespeichert" };
  // Unten angeheftet nur, solange es etwas zu tun oder zu melden gibt – sonst liegt die Leiste ruhig am Ende
  const barSticky = dirty || pending || status.tone === "red" || status.tone === "green";

  return (
    <form action={action} className="relative" noValidate onSubmit={onSubmit} ref={formRef}>
      <input name="handle" type="hidden" value={product.handle} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr]">
        {/* ── Rechts oben (auf dem Handy zuerst): Vorschau + Sichtbarkeit ── */}
        <div className="flex flex-col gap-6 xl:col-start-2 xl:row-start-1">
          <Card padded={false}>
            <div className="flex gap-4 p-5">
              <div className={`relative h-[125px] w-[100px] shrink-0 overflow-hidden rounded-2xl bg-cream ring-1 ring-line transition ${values.visible ? "" : "opacity-50 grayscale"}`}>
                {product.image ? <Image alt={product.image.alt} className="object-cover" fill sizes="100px" src={product.image.src} /> : null}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] text-muted uppercase tracking-[0.1em]">Vorschau im Shop</p>
                <p className="mt-1 font-medium leading-snug">{product.title}</p>
                <p className="mt-1 text-[15px] tabular-nums">
                  {min !== max ? <span className="text-muted">ab </span> : null}
                  <span className="font-medium">{euro(min)}</span>
                  {liveCompare ? (
                    <>
                      {" "}
                      <s className="text-[13px] text-muted">{euro(liveCompare)}</s>
                    </>
                  ) : null}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {values.visible ? <Badge tone="green">Sichtbar</Badge> : <Badge>Ausgeblendet</Badge>}
                  {values.featured ? <Badge tone="amber">Bestseller</Badge> : null}
                  {soldOut ? <Badge tone="red">Ausverkauft</Badge> : null}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 border-line border-t text-[13px]">
              <div className="border-line border-r px-5 py-3">
                <dt className="text-muted">Kollektion</dt>
                <dd className="mt-0.5 truncate">{product.collections.join(", ") || "–"}</dd>
              </div>
              <div className="px-5 py-3">
                <dt className="text-muted">Verfügbar</dt>
                <dd className="mt-0.5 tabular-nums">
                  {availableCount} von {product.variants.length} Varianten
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Sichtbarkeit">
            <div className="flex flex-col gap-3">
              <SwitchRow
                checked={values.visible}
                description="Ausgeschaltet ist das Produkt im Shop nicht mehr zu finden – auch nicht über einen direkten Link."
                label="Im Shop anzeigen"
                name="visible"
                onChange={(visible) => edit((v) => ({ ...v, visible }))}
              />
              <SwitchRow
                checked={values.featured}
                description={`Erscheint im Bereich „Bestseller“ auf der Startseite (bis zu 8 Produkte, gerade ${featuredCount === 1 ? "1 ausgewählt" : `${featuredCount} ausgewählt`}).`}
                label="Als Bestseller auf der Startseite"
                name="featured"
                onChange={(featured) => edit((v) => ({ ...v, featured }))}
              />
            </div>
            {!values.visible && !product.saved.hidden ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
                Nach dem Speichern verschwindet das Produkt aus dem Shop. Liegt es schon in einem Warenkorb, kann es nicht mehr bezahlt werden.
              </p>
            ) : null}
            {values.visible && values.featured && soldOut ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
                Tipp: Alle Varianten sind ausverkauft. Ein ausverkauftes Produkt als Bestseller zu zeigen, kann Kund:innen enttäuschen.
              </p>
            ) : null}
          </Card>

          <Card actions={materialCheck.value ? <Badge tone="green">Eingetragen</Badge> : <Badge tone="amber">fehlt noch</Badge>} title="Material">
            <MaterialField
              check={materialCheck}
              error={((submitted || touched.material) && materialCheck.error) || (showResult ? state.fieldErrors?.material : undefined)}
              onBlur={() => {
                const clean = cleanMaterial(values.material);
                if (clean !== values.material) setValues((v) => ({ ...v, material: clean }));
                touch(["material"]);
              }}
              onChange={(material) => edit((v) => ({ ...v, material }))}
              value={values.material}
            />
          </Card>
        </div>

        {/* ── Links: Preise & Verfügbarkeit ── */}
        <div className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Card actions={<span className="text-[13px] text-muted tabular-nums">{product.variants.length} Varianten</span>} title="Preise & Verfügbarkeit">
            <div className="@container">
              {product.variants.length > 1 ? (
                <BulkTools
                  count={product.variants.length}
                  key={syncedKey}
                  onAvailability={(available) => setVariants(allIds, { available })}
                  onCompare={(compare) => {
                    setVariants(allIds, { compare });
                    touch(allIds.map(field.compare));
                  }}
                  onPrice={(price) => {
                    setVariants(allIds, { price });
                    touch(allIds.flatMap((id) => [field.price(id), field.compare(id)]));
                  }}
                />
              ) : null}

              {/* Spaltenköpfe (nur breit) */}
              <div
                aria-hidden
                className="hidden gap-4 border-line border-b pb-2.5 text-[12px] text-muted uppercase tracking-[0.08em] @[34rem]:grid @[34rem]:grid-cols-[minmax(0,1fr)_8rem_8rem_5.5rem]"
              >
                <span>Variante</span>
                <span>Preis</span>
                <span>Streichpreis</span>
                <span>Verfügbar</span>
              </div>

              {groups.map((g) => {
                const ids = g.variants.map((v) => v.id);
                const unavailable = g.variants.filter((v) => !values.variants[v.id].available).length;
                return (
                  <section aria-label={g.title || "Varianten"} className={g.title ? "mt-5 first-of-type:mt-3" : ""} key={g.key}>
                    {g.title ? (
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-cream/70 px-4 py-2.5">
                        <h3 className="font-medium text-[14px]">
                          {g.title}{" "}
                          <span className="font-normal text-muted">
                            · {g.variants.length} Varianten{unavailable ? `, ${unavailable} ausverkauft` : ""}
                          </span>
                        </h3>
                        <div className="flex gap-1.5">
                          <MiniButton disabled={unavailable === 0} onClick={() => setVariants(ids, { available: true })}>
                            Alle verfügbar<span className="sr-only"> ({g.title})</span>
                          </MiniButton>
                          <MiniButton disabled={unavailable === g.variants.length} onClick={() => setVariants(ids, { available: false })}>
                            Alle ausverkauft<span className="sr-only"> ({g.title})</span>
                          </MiniButton>
                        </div>
                      </div>
                    ) : null}
                    <ul className="divide-y divide-line">
                      {g.variants.map((v) => (
                        <VariantRow
                          check={checks[v.id]}
                          key={v.id}
                          label={variantLabel(v, groupOption?.name)}
                          onBlur={(key) => normalize(v.id, key)}
                          onChange={(patch) => setVariants([v.id], patch)}
                          serverErrors={showResult ? state.fieldErrors : undefined}
                          showErrors={{ price: submitted || Boolean(touched[field.price(v.id)]), compare: submitted || Boolean(touched[field.compare(v.id)]) }}
                          value={values.variants[v.id]}
                          variant={v}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </Card>
          <p className="mt-4 px-1 text-[13px] text-muted leading-relaxed">
            Nach dem Speichern sind die Änderungen innerhalb weniger Sekunden im Shop sichtbar. An der Kasse gilt immer der neue Preis – auch für Artikel, die
            schon im Warenkorb liegen. Erlaubt sind Preise von {euro(50)} bis {euro(999_900)}. Ein blauer Punkt{" "}
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-sky-500 align-middle" /> zeigt Varianten, die vom Original abweichen – mit{" "}
            <ResetIcon className="inline size-3.5 align-[-2px] text-sky-700" /> holst du dort die Original-Werte zurück.
          </p>
        </div>

        {/* ── Rechts unten (auf dem Handy ganz unten): Zurücksetzen ── */}
        <div className="xl:col-start-2 xl:row-start-2">
          <Card title="Original-Werte">
            {product.changed ? (
              <>
                <p className="text-[14px] text-ink/80 leading-relaxed">
                  Du hast bei diesem Produkt {describeChanges(product.changed)} geändert. Mit „Zurücksetzen“ gelten wieder die ursprünglichen Werte aus dem Katalog.
                </p>
                {confirmReset ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/60 p-4" role="group" aria-label="Zurücksetzen bestätigen">
                    <p className="font-medium text-[14px] text-red-900">Wirklich alles zurücksetzen?</p>
                    <p className="mt-1 text-[13px] text-red-900/80">
                      Preise, Streichpreise, Verfügbarkeit, Sichtbarkeit und Bestseller werden auf das Original gestellt. Zutaten & Nährwerte bleiben erhalten.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="inline-flex items-center justify-center rounded-full bg-red-700 px-4 py-2 font-medium text-sm text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-50" disabled={resetPending} onClick={reset} type="button">
                        Ja, zurücksetzen
                      </button>
                      <button className={btnSecondarySm} onClick={() => setConfirmReset(false)} type="button">
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 font-medium text-red-700 text-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-50"
                    disabled={resetPending || pending}
                    onClick={() => setConfirmReset(true)}
                    type="button"
                  >
                    <ResetIcon />
                    {resetPending ? "Wird zurückgesetzt …" : "Zurücksetzen auf Original"}
                  </button>
                )}
              </>
            ) : (
              <p className="flex gap-2.5 text-[14px] text-ink/80 leading-relaxed">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>Es gelten die Original-Werte aus dem Katalog. Du hast hier noch nichts geändert.</span>
              </p>
            )}
            {showResetResult && (resetState.message || resetState.error) ? (
              <p className={`mt-3 text-[13px] ${resetState.error ? "text-red-700" : "text-emerald-700"}`} role="status">
                {resetState.error ?? resetState.message}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {/* ── Speichern-Leiste (bleibt beim Scrollen unten sichtbar) ── */}
      <div className={`${barSticky ? "sticky bottom-3" : ""} z-20 mt-6`}>
        <div
          className={`flex flex-col gap-3 rounded-2xl border bg-white/95 p-3 shadow-[0_10px_30px_-12px_rgba(20,20,20,0.25)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:pl-5 ${dirty ? "border-ink/25" : "border-line"}`}
        >
          <p aria-live="polite" className="flex min-w-0 items-center gap-2.5 px-2 text-[14px] sm:px-0" role="status">
            <StatusDot tone={status.tone} />
            <span className={status.tone === "red" ? "text-red-700" : status.tone === "green" ? "text-emerald-800" : "text-ink/80"}>{status.text}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            {dirty ? (
              <button className={`${btnSecondary} flex-1 sm:flex-none`} disabled={pending} onClick={discard} type="button">
                Verwerfen
              </button>
            ) : null}
            <button className={`${btn} flex-1 sm:flex-none sm:min-w-32`} disabled={pending || resetPending || !dirty} type="submit">
              {pending ? <Spinner /> : null}
              {pending ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function describeChanges(c: NonNullable<EditorProduct["changed"]>) {
  const parts: string[] = [];
  if (c.variants) parts.push(c.variants === 1 ? "1 Variante" : `${c.variants} Varianten`);
  if (c.hidden) parts.push("die Sichtbarkeit");
  if (c.featured) parts.push("die Bestseller-Markierung");
  if (parts.length < 2) return parts[0] ?? "etwas";
  return `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
}

/* ───────────────────────── Bausteine ───────────────────────── */

/** Zutaten & Nährwerte mit Zeichenzähler und Erklärung der Pflicht */
function MaterialField({ value, check, error, onChange, onBlur }: { value: string; check: MaterialCheck; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
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
        rows={2}
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
        Pflichtangabe beim Online-Verkauf von Lebensmitteln (LMIV): Kund:innen müssen vor dem Kauf Zutaten, Allergene und Nährwerte sehen. Am besten genau wie
        auf der Dose – inklusive Koffeingehalt. Steht im Shop unter „Zutaten & Nährwerte“.
      </p>
    </div>
  );
}

/** Schalter mit verstecktem Rückfallwert „0“, damit der Server „aus“ sicher erkennt */
function SwitchRow({ name, label: text, description, checked, onChange }: { name: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
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

function Track({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative mt-0.5 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-ink after:absolute after:top-0.5 after:left-0.5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.25)] after:transition-transform after:content-[''] ${small ? "h-5 w-9 after:size-4 peer-checked:after:translate-x-4" : "h-6 w-11 after:size-5 peer-checked:after:translate-x-5"}`}
    />
  );
}

function MiniButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="rounded-full border border-line bg-white px-3 py-1 font-medium text-[12.5px] text-ink/80 transition hover:border-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 disabled:cursor-default disabled:opacity-40 disabled:hover:border-line"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Schnell-Aktionen: einen Preis / Streichpreis / die Verfügbarkeit für alle Varianten eintragen */
function BulkTools({ count, onPrice, onCompare, onAvailability }: { count: number; onPrice: (text: string) => void; onCompare: (text: string) => void; onAvailability: (v: boolean) => void }) {
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
function EuroInput({ value, onChange, invalid, className = "", ...rest }: EuroInputProps) {
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
function VariantRow({
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

function OriginalText({ o }: { o: VariantValue }) {
  return (
    <>
      Original: {euro(o.price)}
      {o.compareAtPrice ? <> statt {euro(o.compareAtPrice)}</> : null}
      {o.available ? null : <> · ausverkauft</>}
    </>
  );
}

function StatusDot({ tone }: { tone: "neutral" | "amber" | "red" | "green" }) {
  if (tone === "green") return <CheckIcon className="size-4 shrink-0 text-emerald-600" />;
  const color = { neutral: "bg-ink/25", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function ResetIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
