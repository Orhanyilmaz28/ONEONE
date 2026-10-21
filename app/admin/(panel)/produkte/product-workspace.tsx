"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, btn, btnSecondary } from "@/components/admin/ui";
import { type ProductFormState, resetProduct, saveProductAll } from "./actions";
import { Check, DeleteSection, DescriptionField, ImageManager, OptionsEditor, TextArea, TextField } from "./content-editor";
import { type ContentInput, LIMITS, checkContent, combinations, parseValues, variantCount } from "./content";
import {
  BulkTools,
  CheckIcon,
  type EditorProduct,
  MaterialField,
  MiniButton,
  ResetIcon,
  Spinner,
  StatusDot,
  Track,
  type Values,
  VariantRow,
  btnSecondarySm,
  describeChanges,
  differs,
  toValues,
  variantLabel,
} from "./pricing-fields";
import { type VariantInput, centsToInput, checkMaterial, checkVariant, cleanMaterial, euro, field, parseEuro } from "./pricing";

/**
 * Bearbeiten-Seite eines Produkts: alles auf einer Seite mit EINEM Speichern-Knopf.
 * Oben das Wichtigste (Preis, Verkauf, Zutaten), darunter Bilder und Texte, Seltenes eingeklappt.
 * Rechts „Startklar?“ (was fehlt noch) und die Stammdaten aus dem Artikelpass (nur lesen).
 */

export type WorkspaceSku = { artNr?: string; ean?: string; gebinde?: string; tray?: string; mhd?: string; duplicateWith: string[] };
export type WorkspaceNav = { listHref: string; prevHref?: string; nextHref?: string; position: number; total: number; listLabel?: string };

type Props = {
  product: EditorProduct;
  featuredCount: number;
  content: { initial: ContentInput; collections: { handle: string; title: string }[]; existingVariants: Record<string, string>[]; fromCatalog: boolean };
  sku: WorkspaceSku;
  nav: WorkspaceNav;
};

type FoldKey = "varianten" | "details" | "original" | "loeschen";
const CONTENT_FOLD: Record<string, FoldKey> = { options: "varianten", collections: "details", highlights: "details", packSize: "details", capacity: "details" };

export function ProductWorkspace({ product, featuredCount, content, sku, nav }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProductAll, {});
  const [resetState, resetAction, resetPending] = useActionState<ProductFormState, FormData>(resetProduct, {});

  /* ── Preise & Verkauf ── */
  const initial = useMemo(() => toValues(product), [product]);
  const initialKey = JSON.stringify(initial);
  const [valuesState, setValues] = useState(initial);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /* ── Bilder & Texte ── */
  const contentKey = JSON.stringify(content.initial);
  const [textState, setText] = useState<ContentInput>(content.initial);
  const [syncedContentKey, setSyncedContentKey] = useState(contentKey);
  const [uploading, setUploading] = useState(0);

  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState<string>();
  // Meldungen ausblenden, sobald weiter bearbeitet wird (neue Ergebnisse erscheinen automatisch wieder)
  const [dismissed, setDismissed] = useState<ProductFormState | null>(null);
  const [dismissedReset, setDismissedReset] = useState<ProductFormState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [open, setOpen] = useState<Record<FoldKey, boolean>>({ varianten: false, details: false, original: false, loeschen: false });
  /** Nach erfolgreichem Speichern hierhin wechseln („Speichern & nächstes“) */
  const goAfterSave = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Nach dem Speichern / Zurücksetzen kommt ein neuer Stand vom Server → Felder daran anpassen.
  // In diesem einen Durchlauf schon mit dem neuen Stand rechnen (Varianten können neue IDs haben).
  const values = syncedKey !== initialKey ? initial : valuesState;
  const text = syncedContentKey !== contentKey ? content.initial : textState;
  if (syncedKey !== initialKey) {
    setSyncedKey(initialKey);
    setValues(initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
  }
  if (syncedContentKey !== contentKey) {
    setSyncedContentKey(contentKey);
    setText(content.initial);
    setSubmitted(false);
  }

  const showResult = dismissed !== state;
  const showResetResult = dismissedReset !== resetState;

  /* ── Prüfen ── */
  const checks = useMemo(() => Object.fromEntries(product.variants.map((v) => [v.id, checkVariant(values.variants[v.id])])), [product.variants, values.variants]);
  const materialCheck = useMemo(() => checkMaterial(values.material), [values.material]);
  const known = useMemo(() => content.collections.map((c) => c.handle), [content.collections]);
  const textCheck = useMemo(() => checkContent(text, known), [text, known]);
  const pricingErrors = product.variants.reduce((n, v) => n + Object.keys(checks[v.id].errors).length, 0) + (materialCheck.error ? 1 : 0);
  const textErrors = Object.keys(textCheck.errors).length;

  const unsavedVariants = product.variants.filter((v) => differs(values.variants[v.id], v.saved)).length;
  const pricingDirty = unsavedVariants > 0 || values.visible === product.saved.hidden || values.featured !== product.saved.featured || materialCheck.value !== product.material;
  const textDirty = JSON.stringify(text) !== contentKey;
  const dirty = pricingDirty || textDirty;
  const errorCount = (pricingDirty ? pricingErrors : 0) + (textDirty ? textErrors : 0);

  const textFieldErrors: Record<string, string | undefined> = { ...(submitted ? textCheck.errors : {}), ...(showResult ? state.fieldErrors : {}) };

  // Warnung beim Verlassen der Seite mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  // „Speichern & nächstes“: nach erfolgreichem Speichern weiter
  useEffect(() => {
    if (state.ok && state.savedAt && !state.warning && goAfterSave.current) {
      const to = goAfterSave.current;
      goAfterSave.current = null;
      router.push(to);
    } else if ((!state.ok && state.error) || state.warning) goAfterSave.current = null;
  }, [state, router]);

  /* ── Ändern ── */
  function afterEdit() {
    setDismissed(state);
    setDismissedReset(resetState);
    setLocalError(undefined);
  }
  function edit(change: (v: Values) => Values) {
    setValues(change);
    afterEdit();
  }
  function editText<K extends keyof ContentInput>(key: K, value: ContentInput[K]) {
    setText((t) => ({ ...t, [key]: value }));
    afterEdit();
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
      const t = centsToInput(parsed.cents);
      if (t !== values.variants[id][key]) setValues((v) => ({ ...v, variants: { ...v.variants, [id]: { ...v.variants[id], [key]: t } } }));
    }
    touch([key === "price" ? field.price(id) : field.compare(id)]);
  }

  function discard() {
    setValues(initial);
    setText(content.initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
    setDismissed(state);
  }

  /* ── Speichern ── */
  function save(next?: string) {
    if (pending || uploading || !dirty) return;
    setSubmitted(true);
    setDismissed(state);
    if (errorCount) {
      setLocalError(errorCount === 1 ? "Bitte korrigiere das rot markierte Feld." : `Bitte korrigiere die ${errorCount} rot markierten Felder.`);
      // Eingeklappte Bereiche mit Fehlern aufklappen, dann zum ersten Fehler springen
      const toOpen = Object.keys(textCheck.errors).map((k) => CONTENT_FOLD[k.startsWith("option.") ? "options" : k]).filter(Boolean);
      if (toOpen.length) setOpen((o) => ({ ...o, ...Object.fromEntries(toOpen.map((k) => [k, true])) }));
      setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 50);
      return;
    }
    setLocalError(undefined);
    const data = new FormData();
    data.set("handle", product.handle);
    data.set("parts", [pricingDirty ? "preise" : "", textDirty ? "inhalt" : ""].filter(Boolean).join(","));
    if (pricingDirty) {
      data.set("visible", values.visible ? "1" : "0");
      data.set("featured", values.featured ? "1" : "0");
      data.set("material", values.material);
      for (const v of product.variants) {
        const x = values.variants[v.id];
        data.set(field.price(v.id), x.price);
        data.set(field.compare(v.id), x.compare);
        data.set(field.available(v.id), x.available ? "1" : "0");
      }
    }
    if (textDirty) data.set("content", JSON.stringify(text));
    goAfterSave.current = next ?? null;
    startTransition(() => action(data));
  }

  function reset() {
    const data = new FormData();
    data.set("handle", product.handle);
    setConfirmReset(false);
    setDismissed(state);
    startTransition(() => resetAction(data));
  }

  /** Links weg von der Seite: bei ungespeicherten Änderungen erst nachfragen */
  function guard(e: MouseEvent) {
    if (dirty && !window.confirm("Du hast ungespeicherte Änderungen. Seite trotzdem verlassen? Die Änderungen gehen dann verloren.")) e.preventDefault();
  }

  /* ── Live-Werte (Kopfzeile, Startklar) ── */
  const live = product.variants.map((v) => ({ ...(checks[v.id].value ?? v.saved), available: values.variants[v.id].available }));
  const prices = live.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const availableCount = live.filter((x) => x.available).length;
  const soldOut = availableCount === 0;
  const image = text.images[0];

  /* ── Varianten gruppieren (bei mehreren Optionen nach der ersten, z. B. Farbe) ── */
  const groupOption = product.options.length > 1 ? product.options[0] : undefined;
  const groups = groupOption
    ? [
        ...groupOption.values.map((value) => ({
          key: value,
          title: `${groupOption.name}: ${value}`,
          variants: product.variants.filter((v) => v.options[groupOption.name] === value),
        })),
        { key: "__weitere", title: "Weitere Varianten", variants: product.variants.filter((v) => !groupOption.values.includes(v.options[groupOption.name])) },
      ].filter((g) => g.variants.length)
    : [{ key: "alle", title: "", variants: product.variants }];
  const allIds = product.variants.map((v) => v.id);

  /* ── Varianten-Vorschau (neue / wegfallende) ── */
  const optionCount = variantCount(text.options);
  const variantDiff = useMemo(() => {
    const opts = text.options.map((o) => ({ name: o.name.replace(/\s+/g, " ").trim(), values: parseValues(o.values) })).filter((o) => o.name && o.values.length);
    const key = (o: Record<string, string>) =>
      Object.entries(o)
        .map(([n, v]) => `${n.toLowerCase()}=${v.toLowerCase()}`)
        .sort()
        .join("|");
    const next = new Set(combinations(opts).map(key));
    const prev = new Set(content.existingVariants.map(key));
    return { added: [...next].filter((k) => !prev.has(k)).length, removed: [...prev].filter((k) => !next.has(k)).length };
  }, [text.options, content.existingVariants]);

  /* ── Startklar? ── */
  const ready: { ok: boolean; text: string; href?: string; neutral?: boolean }[] = [
    { ok: text.images.length > 0, text: text.images.length ? (text.images.length === 1 ? "1 Bild" : `${text.images.length} Bilder`) : "Noch kein Bild", href: "#bilder" },
    { ok: true, text: min === max ? `Preis ${euro(min)}` : `Preis ${euro(min)} – ${euro(max)}`, href: "#preis" },
    { ok: Boolean(materialCheck.value), text: materialCheck.value ? "Zutaten & Nährwerte" : "Zutaten & Nährwerte fehlen", href: "#zutaten" },
    {
      ok: Boolean(sku.artNr) && !sku.duplicateWith.length,
      text: !sku.artNr ? "Artikelnummer fehlt" : sku.duplicateWith.length ? `Artikelnummer ${sku.artNr} doppelt (auch bei ${sku.duplicateWith.join(", ")})` : `Artikelnummer ${sku.artNr}`,
      href: "#stammdaten",
    },
    {
      ok: !soldOut,
      text: soldOut ? "Ausverkauft" : availableCount === product.variants.length ? "Lieferbar" : `${availableCount} von ${product.variants.length} Varianten lieferbar`,
      href: "#preis",
    },
    { ok: values.visible, neutral: !values.visible, text: values.visible ? "Im Shop sichtbar" : "Im Shop ausgeblendet", href: "#preis" },
  ];
  const openPoints = ready.filter((r) => !r.ok && !r.neutral).length;

  /* ── Statuszeile ── */
  let status: { tone: "neutral" | "amber" | "red" | "green"; text: string };
  if (pending) status = { tone: "neutral", text: "Wird gespeichert …" };
  else if (uploading) status = { tone: "neutral", text: uploading === 1 ? "1 Bild wird hochgeladen …" : `${uploading} Bilder werden hochgeladen …` };
  else if (localError) status = { tone: "red", text: localError };
  else if (showResult && state.error) status = { tone: "red", text: state.error };
  else if (dirty) status = { tone: "amber", text: "Ungespeicherte Änderungen" };
  else if (showResult && state.message) status = { tone: state.warning ? "amber" : "green", text: state.message };
  else status = { tone: "neutral", text: "Alles gespeichert" };
  // Unten angeheftet nur, solange es etwas zu tun oder zu melden gibt – sonst liegt die Leiste ruhig am Ende
  const barSticky = dirty || pending || uploading > 0 || status.tone === "red" || status.tone === "green" || (showResult && Boolean(state.warning));

  return (
    <div ref={rootRef}>
      {/* ── Kopf: zurück + blättern ── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          className="-ml-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[14px] text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          href={nav.listHref}
          onClick={guard}
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m15 6-6 6 6 6" />
          </svg>
          {nav.listLabel ? `Liste: ${nav.listLabel}` : "Alle Produkte"}
        </Link>
        {nav.total > 1 ? (
          <nav aria-label="Zwischen Produkten blättern" className="flex items-center gap-1">
            <PagerLink href={nav.prevHref} label="Vorheriges Produkt" onClick={guard}>
              <path d="m15 6-6 6 6 6" />
            </PagerLink>
            <span className="px-1.5 text-[13.5px] text-muted tabular-nums">
              {nav.position} von {nav.total}
            </span>
            <PagerLink href={nav.nextHref} label="Nächstes Produkt" onClick={guard}>
              <path d="m9 6 6 6-6 6" />
            </PagerLink>
          </nav>
        ) : null}
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-xl bg-cream ring-1 ring-line ${values.visible ? "" : "opacity-50 grayscale"}`}>
          {image ? <Image alt="" className="object-cover" fill sizes="48px" src={image.src} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-medium text-[22px] leading-tight tracking-[-0.02em] sm:truncate sm:text-[28px]">{product.title}</h1>
          <p className="text-[14px] text-muted">
            {product.collections.join(", ") || "Ohne Kollektion"} · <span className="tabular-nums">{min !== max ? `ab ${euro(min)}` : euro(min)}</span> ·{" "}
            {values.visible ? <span className="text-emerald-700">im Shop sichtbar</span> : <span>ausgeblendet</span>}
            {soldOut ? <span className="text-red-700"> · ausverkauft</span> : null}
          </p>
        </div>
        {product.saved.hidden ? null : (
          <div className="hidden shrink-0 sm:block">
            <a className={btnSecondary} href={`/products/${product.handle}`} rel="noreferrer" target="_blank">
              Im Shop ansehen ↗
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr]">
        {/* ── Startklar? (Handy: ganz oben) ── */}
        <div className="xl:col-start-2 xl:row-start-1">
          <Card actions={openPoints ? <Badge tone="amber">{openPoints === 1 ? "1 Punkt offen" : `${openPoints} Punkte offen`}</Badge> : <Badge tone="green">Alles da</Badge>} title="Startklar?">
            <ul className="space-y-2 text-[14px]">
              {ready.map((r) => (
                <li key={r.text}>
                  <a className="-mx-1.5 flex items-start gap-2.5 rounded-lg px-1.5 py-0.5 transition hover:bg-ink/[0.03]" href={r.href}>
                    <span
                      aria-hidden
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] ${r.ok ? "bg-emerald-100 text-emerald-700" : r.neutral ? "bg-ink/10 text-ink/60" : "bg-amber-100 text-amber-800"}`}
                    >
                      {r.ok ? "✓" : r.neutral ? "–" : "!"}
                    </span>
                    <span className={r.ok || r.neutral ? "" : "text-amber-900"}>{r.text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ── Hauptspalte ── */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Card actions={product.variants.length > 1 ? <span className="text-[13px] text-muted tabular-nums">{product.variants.length} Varianten</span> : null} title={<span id="preis">Preis & Verkauf</span>}>
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

            <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
              <SwitchLine
                checked={values.visible}
                hint="Aus = im Shop nicht mehr zu finden, auch nicht über einen direkten Link"
                label="Im Shop sichtbar"
                onChange={(visible) => edit((v) => ({ ...v, visible }))}
              />
              <SwitchLine
                checked={values.featured}
                hint={`Steht oben bei „Beliebt“ und im Vorschaubild beim Teilen (gerade ${featuredCount} ausgewählt, am besten 6–8)`}
                label="Bestseller"
                onChange={(featured) => edit((v) => ({ ...v, featured }))}
              />
            </div>
            {!values.visible && !product.saved.hidden ? (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
                Nach dem Speichern verschwindet das Produkt aus dem Shop. Liegt es schon in einem Warenkorb, kann es nicht mehr bezahlt werden.
              </p>
            ) : null}
            {values.visible && values.featured && soldOut ? (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
                Tipp: Alles ist ausverkauft. Ein ausverkauftes Produkt als Bestseller zu zeigen, kann Kund:innen enttäuschen.
              </p>
            ) : null}
            <p className="mt-3 text-[12.5px] text-muted leading-relaxed">
              An der Kasse gilt immer der gespeicherte Preis – auch für Artikel, die schon im Warenkorb liegen. Erlaubt sind {euro(50)} bis {euro(999_900)}.
            </p>
          </Card>

          <Card actions={materialCheck.value ? <Badge tone="green">Eingetragen</Badge> : <Badge tone="amber">fehlt noch</Badge>} title={<span id="zutaten">Zutaten & Nährwerte</span>}>
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

          <Card actions={<span className="text-[13px] text-muted tabular-nums">{text.images.length} / {LIMITS.images}</span>} title={<span id="bilder">Bilder</span>}>
            <ImageManager
              error={textFieldErrors.images}
              images={text.images}
              onChange={(images) => editText("images", images)}
              onUploading={(n) => setUploading((u) => u + n)}
              title={text.title}
            />
          </Card>

          <Card title={<span id="texte">Name & Beschreibung</span>}>
            <div className="flex flex-col gap-5">
              <TextField error={textFieldErrors.title} label="Produktname" max={LIMITS.title} onChange={(v) => editText("title", v)} placeholder="z. B. Classic" required value={text.title} />
              <TextField
                error={textFieldErrors.subtitle}
                help="Kurzer Satz unter dem Namen auf Produktkarten."
                label="Untertitel"
                max={LIMITS.subtitle}
                onChange={(v) => editText("subtitle", v)}
                optional
                placeholder="z. B. Der Klassiker · 250 ml"
                value={text.subtitle}
              />
              <DescriptionField error={textFieldErrors.description} onChange={(v) => editText("description", v)} value={text.description} />
            </div>
          </Card>

          {/* ── Seltenes, eingeklappt ── */}
          <div className="flex flex-col gap-3">
            <Fold
              onToggle={(o) => setOpen((x) => ({ ...x, varianten: o }))}
              open={open.varianten}
              sub={`${optionCount === 1 ? "1 Variante" : `${optionCount} Varianten`}${text.options.length ? ` · ${text.options.map((o) => o.name).filter(Boolean).join(", ")}` : ""}`}
              title="Packungsgrößen & Varianten"
              warn={Object.keys(textFieldErrors).some((k) => k === "options" || k.startsWith("option."))}
            >
              <OptionsEditor errors={textFieldErrors} onChange={(options) => editText("options", options)} options={text.options} />
              <div className="mt-4 rounded-2xl bg-cream/70 px-4 py-3 text-[13.5px] text-ink/80 leading-relaxed" role="status">
                {textFieldErrors.options ? (
                  <span className="text-red-700">{textFieldErrors.options}</span>
                ) : (
                  <>
                    Ergibt <b className="tabular-nums">{optionCount === 1 ? "1 Variante" : `${optionCount} Varianten`}</b>
                    {variantDiff.added || variantDiff.removed ? (
                      <>
                        {" "}
                        ({variantDiff.added ? `${variantDiff.added} neu` : ""}
                        {variantDiff.added && variantDiff.removed ? ", " : ""}
                        {variantDiff.removed ? `${variantDiff.removed} fällt weg` : ""}).
                        {variantDiff.added ? " Neue Varianten bekommen den Preis der ersten Variante – nach dem Speichern kannst du ihn oben bei „Preis & Verkauf“ ändern." : ""}
                        {variantDiff.removed ? " Weggefallene Varianten verschwinden aus dem Shop." : ""}
                      </>
                    ) : (
                      "."
                    )}
                  </>
                )}
              </div>
            </Fold>

            <Fold
              onToggle={(o) => setOpen((x) => ({ ...x, details: o }))}
              open={open.details}
              sub={
                [
                  text.collections.map((h) => content.collections.find((c) => c.handle === h)?.title ?? h).join(", ") || "Ohne Kollektion",
                  text.highlights.trim() ? `${text.highlights.split("\n").filter((l) => l.trim()).length} Stichpunkte` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              title="Kollektionen & Stichpunkte"
              warn={["collections", "highlights", "packSize", "capacity"].some((k) => textFieldErrors[k])}
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <fieldset>
                  <legend className="mb-3 text-[13px] text-muted">In welchen Bereichen des Shops erscheint das Produkt?</legend>
                  <div className="flex flex-col gap-2">
                    {content.collections.map((c) => (
                      <Check
                        checked={text.collections.includes(c.handle)}
                        key={c.handle}
                        label={c.title}
                        onChange={(on) => editText("collections", on ? [...text.collections, c.handle] : text.collections.filter((x) => x !== c.handle))}
                      />
                    ))}
                  </div>
                  {text.collections.length === 0 ? <p className="mt-3 text-[13px] text-amber-800">Ohne Kollektion ist das Produkt nur unter „Alle Produkte“ zu finden.</p> : null}
                </fieldset>
                <div className="flex flex-col gap-5">
                  <TextArea
                    error={textFieldErrors.highlights}
                    help={`Ein Vorteil pro Zeile, höchstens ${LIMITS.highlights}. Erscheinen als Häkchen-Liste.`}
                    label="Stichpunkte"
                    onChange={(v) => editText("highlights", v)}
                    optional
                    placeholder={"z. B. 250-ml-Dose\nGekühlt am besten"}
                    rows={4}
                    value={text.highlights}
                  />
                  <TextField
                    error={textFieldErrors.packSize}
                    help="Wie viele Dosen im Paket sind (1 = Einzeldose)."
                    inputMode="numeric"
                    label="Dosen im Paket"
                    max={3}
                    onChange={(v) => editText("packSize", v.replace(/[^\d]/g, ""))}
                    optional
                    placeholder="1"
                    value={text.packSize}
                  />
                </div>
              </div>
            </Fold>

            <Fold
              onToggle={(o) => setOpen((x) => ({ ...x, original: o }))}
              open={open.original}
              sub={product.changed ? `Geändert: ${describeChanges(product.changed)}` : "Es gelten die Original-Werte"}
              title="Original-Werte & Zurücksetzen"
            >
              {product.changed ? (
                <>
                  <p className="text-[14px] text-ink/80 leading-relaxed">
                    Du hast bei diesem Produkt {describeChanges(product.changed)} geändert. Mit „Zurücksetzen“ gelten wieder die ursprünglichen Werte aus dem Katalog.
                  </p>
                  {confirmReset ? (
                    <div aria-label="Zurücksetzen bestätigen" className="mt-4 rounded-2xl border border-red-200 bg-red-50/60 p-4" role="group">
                      <p className="font-medium text-[14px] text-red-900">Wirklich alles zurücksetzen?</p>
                      <p className="mt-1 text-[13px] text-red-900/80">
                        Preise, Streichpreise, Verfügbarkeit, Sichtbarkeit und Bestseller werden auf das Original gestellt. Zutaten & Nährwerte bleiben erhalten.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center justify-center rounded-full bg-red-700 px-4 py-2 font-medium text-sm text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-50"
                          disabled={resetPending}
                          onClick={reset}
                          type="button"
                        >
                          Ja, zurücksetzen
                        </button>
                        <button className={btnSecondarySm} onClick={() => setConfirmReset(false)} type="button">
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-card px-4 py-2 font-medium text-red-700 text-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-50"
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
            </Fold>

            <Fold danger onToggle={(o) => setOpen((x) => ({ ...x, loeschen: o }))} open={open.loeschen} sub="Aus dem Shop entfernen" title="Produkt löschen">
              <DeleteSection fromCatalog={content.fromCatalog} handle={product.handle} title={content.initial.title} />
            </Fold>
          </div>
        </div>

        {/* ── Stammdaten (Handy: ganz unten) ── */}
        <div className="xl:col-start-2 xl:row-start-2">
          <Card title={<span id="stammdaten">Stammdaten</span>}>
            {sku.artNr || sku.ean ? (
              <dl className="space-y-2 text-[13.5px]">
                <SpecRow label="Artikelnummer" value={sku.artNr} warn={!sku.artNr ? "fehlt" : sku.duplicateWith.length ? "doppelt" : undefined} />
                <SpecRow label="EAN" value={sku.ean} />
                <SpecRow label="Gebinde" value={sku.gebinde} />
                <SpecRow label="Tray" value={sku.tray} />
                <SpecRow label="Haltbarkeit" value={sku.mhd} />
              </dl>
            ) : (
              <p className="text-[13.5px] text-ink/80 leading-relaxed">Für dieses Produkt ist noch kein Artikelpass hinterlegt – Artikelnummer und EAN fehlen.</p>
            )}
            <p className="mt-3 text-[12.5px] text-muted leading-relaxed">Aus dem Artikelpass des Herstellers – hier nur zum Nachschauen.</p>
          </Card>
        </div>
      </div>

      {/* ── Speichern-Leiste (bleibt beim Scrollen unten sichtbar, solange es etwas zu tun gibt) ── */}
      <div className={`${barSticky ? "sticky bottom-3" : ""} z-20 mt-6`}>
        <div
          className={`flex flex-col gap-3 rounded-2xl border bg-card/95 p-3 shadow-[0_10px_30px_-12px_rgba(20,20,20,0.25)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:pl-5 ${dirty ? "border-ink/25" : "border-line"}`}
        >
          <p aria-live="polite" className="flex min-w-0 items-center gap-2.5 px-2 text-[14px] sm:px-0" role="status">
            <StatusDot tone={status.tone} />
            <span className={status.tone === "red" ? "text-red-700" : status.tone === "green" ? "text-emerald-800" : "text-ink/80"}>{status.text}</span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {dirty ? (
              <button className={`${btnSecondary} flex-1 sm:flex-none`} disabled={pending} onClick={discard} type="button">
                Verwerfen
              </button>
            ) : null}
            {nav.nextHref ? (
              dirty ? (
                <button className={`${btnSecondary} flex-1 sm:flex-none`} disabled={pending || resetPending || uploading > 0} onClick={() => save(nav.nextHref)} type="button">
                  Speichern & nächstes ›
                </button>
              ) : (
                <Link className={`${btnSecondary} flex-1 sm:flex-none`} href={nav.nextHref}>
                  Nächstes Produkt ›
                </Link>
              )
            ) : null}
            <button className={`${btn} flex-1 sm:flex-none sm:min-w-32`} disabled={pending || resetPending || uploading > 0 || !dirty} onClick={() => save()} type="button">
              {pending ? <Spinner /> : null}
              {pending ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Bausteine ───────────────────────── */

function PagerLink({ href, label, onClick, children }: { href?: string; label: string; onClick: (e: MouseEvent) => void; children: ReactNode }) {
  const cls = "flex size-9 items-center justify-center rounded-full border border-line bg-card transition";
  const icon = (
    <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {children}
    </svg>
  );
  if (!href)
    return (
      <span aria-disabled className={`${cls} text-ink/25`} title={label}>
        {icon}
      </span>
    );
  return (
    <Link aria-label={label} className={`${cls} text-ink/70 hover:border-ink/30 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10`} href={href} onClick={onClick} title={label}>
      {icon}
    </Link>
  );
}

function SwitchLine({ label: text, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-ink/[0.02] has-focus-visible:ring-4 has-focus-visible:ring-ink/15">
      <span className="min-w-0">
        <span className="block text-[15px]">{text}</span>
        <span className="block text-[12.5px] text-muted leading-snug">{hint}</span>
      </span>
      <input checked={checked} className="peer sr-only" onChange={(e) => onChange(e.target.checked)} role="switch" type="checkbox" />
      <Track />
    </label>
  );
}

function Fold({
  title,
  sub,
  open,
  onToggle,
  danger = false,
  warn = false,
  children,
}: {
  title: string;
  sub: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  danger?: boolean;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04)]" onToggle={(e) => onToggle(e.currentTarget.open)} open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-6 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className={`block font-medium text-[15px] ${danger ? "text-red-700" : ""}`}>
            {title}
            {warn ? <span className="ml-2 align-middle text-[12px] text-red-700">bitte prüfen</span> : null}
          </span>
          <span className="block truncate text-[13px] text-muted">{sub}</span>
        </span>
        <svg aria-hidden className="size-4 shrink-0 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-line border-t px-6 py-5">{children}</div>
    </details>
  );
}

function SpecRow({ label: text, value, warn }: { label: string; value?: string; warn?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{text}</dt>
      <dd className="min-w-0 text-right tabular-nums">
        {value ?? "–"}
        {warn ? <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-px text-[11.5px] text-amber-800 ring-1 ring-amber-200/60">{warn}</span> : null}
      </dd>
    </div>
  );
}
