"use client";

import { type DragEvent, type ReactNode, startTransition, useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { Card, btn, btnSecondary, input, label } from "@/components/admin/ui";
import type { AiMediaType } from "@/lib/ai-media";
import type { ProductImage } from "@/lib/types";
import { type ProductFormState, createProduct, deleteProduct, saveContent } from "./actions";
import { type ContentInput, LIMITS, type OptionInput, checkContent, combinations, parseValues, slugify, textToHtml, variantCount } from "./content";
import { MATERIAL_MAX, centsToInput, checkMaterial, checkVariant, cleanMaterial, parseEuro } from "./pricing";

const btnSecondarySm = btnSecondary.replace("px-5 py-2.5", "px-4 py-2");
const invalidInput = "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100";

export type ContentEditorProps = {
  mode: "edit" | "create";
  handle?: string;
  initial: ContentInput;
  collections: { handle: string; title: string }[];
  /** Nur beim Bearbeiten: bestehende Varianten (für „x neu, y entfällt“) */
  existingVariants?: Record<string, string>[];
  /** Nur beim Bearbeiten: stammt das Produkt aus dem ursprünglichen Sortiment? (dann wiederherstellbar) */
  fromCatalog?: boolean;
};

type SaleValues = { price: string; compare: string; material: string; visible: boolean; featured: boolean };

export function ContentEditor({ mode, handle = "", initial, collections, existingVariants = [], fromCatalog = false }: ContentEditorProps) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(mode === "create" ? createProduct : saveContent, {});
  const initialKey = JSON.stringify(initial);
  const [values, setValues] = useState<ContentInput>(initial);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  const [sale, setSale] = useState<SaleValues>({ price: "", compare: "", material: "", visible: true, featured: false });
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState<ProductFormState | null>(null);
  const [uploading, setUploading] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach dem Speichern kommt ein neuer Stand vom Server → Felder daran anpassen
  if (syncedKey !== initialKey) {
    setSyncedKey(initialKey);
    setValues(initial);
    setSubmitted(false);
  }

  const showResult = dismissed !== state;
  const known = useMemo(() => collections.map((c) => c.handle), [collections]);
  const check = useMemo(() => checkContent(values, known), [values, known]);
  const priceCheck = useMemo(() => checkVariant({ price: sale.price, compare: sale.compare, available: true }), [sale.price, sale.compare]);
  const materialCheck = useMemo(() => checkMaterial(sale.material), [sale.material]);

  const errors: Record<string, string | undefined> = {
    ...(submitted ? check.errors : {}),
    ...(submitted && mode === "create" ? { price: priceCheck.errors.price, compare: priceCheck.errors.compare, material: materialCheck.error } : {}),
    ...(showResult ? state.fieldErrors : {}),
  };
  const errorCount =
    Object.keys(check.errors).length + (mode === "create" ? Object.keys(priceCheck.errors).length + (materialCheck.error ? 1 : 0) : 0);

  const dirty = mode === "create" ? Boolean(values.title.trim() || values.images.length) : JSON.stringify(values) !== initialKey;

  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  function edit(change: (v: ContentInput) => ContentInput) {
    setValues(change);
    setDismissed(state);
  }
  const set = <K extends keyof ContentInput>(key: K, value: ContentInput[K]) => edit((v) => ({ ...v, [key]: value }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    setSubmitted(true);
    setDismissed(state);
    if (errorCount) {
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const data = new FormData();
    data.set("handle", handle);
    data.set("content", JSON.stringify(values));
    if (mode === "create") {
      data.set("price", sale.price);
      data.set("compare", sale.compare);
      data.set("material", sale.material);
      data.set("visible", sale.visible ? "1" : "0");
      data.set("featured", sale.featured ? "1" : "0");
    }
    startTransition(() => action(data));
  }

  /* ── Varianten-Vorschau ── */
  const optionCount = variantCount(values.options);
  const variantDiff = useMemo(() => {
    if (mode !== "edit") return null;
    const opts = values.options.map((o) => ({ name: o.name.replace(/\s+/g, " ").trim(), values: parseValues(o.values) })).filter((o) => o.name && o.values.length);
    const key = (o: Record<string, string>) =>
      Object.entries(o)
        .map(([n, v]) => `${n.toLowerCase()}=${v.toLowerCase()}`)
        .sort()
        .join("|");
    const next = new Set(combinations(opts).map(key));
    const prev = new Set(existingVariants.map(key));
    return { added: [...next].filter((k) => !prev.has(k)).length, removed: [...prev].filter((k) => !next.has(k)).length };
  }, [mode, values.options, existingVariants]);

  /* ── Statuszeile ── */
  let status: { tone: "neutral" | "amber" | "red" | "green"; text: string };
  if (pending) status = { tone: "neutral", text: mode === "create" ? "Produkt wird angelegt …" : "Wird gespeichert …" };
  else if (uploading) status = { tone: "neutral", text: uploading === 1 ? "1 Bild wird hochgeladen …" : `${uploading} Bilder werden hochgeladen …` };
  else if (submitted && errorCount) status = { tone: "red", text: errorCount === 1 ? "Bitte korrigiere das rot markierte Feld." : `Bitte korrigiere die ${errorCount} rot markierten Felder.` };
  else if (showResult && state.error) status = { tone: "red", text: state.error };
  else if (mode === "edit" && dirty) status = { tone: "amber", text: "Ungespeicherte Änderungen" };
  else if (showResult && state.message) status = { tone: "green", text: state.message };
  else if (mode === "create") status = { tone: "neutral", text: "Pflicht sind nur Name und Preis – alles andere kannst du später ergänzen." };
  else status = { tone: "neutral", text: "Alles gespeichert" };
  const barSticky = dirty || pending || uploading > 0 || status.tone === "red" || status.tone === "green";

  const slug = slugify(values.title);

  return (
    <>
      <form className="relative" noValidate onSubmit={onSubmit} ref={formRef}>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card actions={<span className="text-[13px] text-muted tabular-nums">{values.images.length} / {LIMITS.images}</span>} title="Bilder">
              <ImageManager
                error={errors.images}
                images={values.images}
                onChange={(images) => set("images", images)}
                onUploading={(n) => setUploading((u) => u + n)}
                title={values.title}
              />
            </Card>

            <Card title="Name & Beschreibung">
              <div className="flex flex-col gap-5">
                <TextField
                  error={errors.title}
                  help={
                    mode === "create" && slug ? (
                      <>
                        Adresse im Shop: <span className="text-ink/80">/products/{slug}</span> (bleibt fest, auch wenn du den Namen später änderst)
                      </>
                    ) : undefined
                  }
                  label="Produktname"
                  max={LIMITS.title}
                  onChange={(v) => set("title", v)}
                  placeholder="z. B. Classic"
                  required
                  value={values.title}
                />
                <TextField
                  error={errors.subtitle}
                  help="Kurzer Satz unter dem Namen auf Produktkarten."
                  label="Untertitel"
                  max={LIMITS.subtitle}
                  onChange={(v) => set("subtitle", v)}
                  optional
                  placeholder="z. B. Mehr Abdeckung, mehr Ruhe"
                  value={values.subtitle}
                />
                <DescriptionField error={errors.description} onChange={(v) => set("description", v)} value={values.description} />
              </div>
            </Card>

            <Card title="Größen, Farben & Varianten">
              <OptionsEditor
                errors={errors}
                onChange={(options) => set("options", options)}
                options={values.options}
              />
              <div className="mt-4 rounded-2xl bg-cream/70 px-4 py-3 text-[13.5px] text-ink/80 leading-relaxed" role="status">
                {errors.options ? (
                  <span className="text-red-700">{errors.options}</span>
                ) : (
                  <>
                    Ergibt <b className="tabular-nums">{optionCount === 1 ? "1 Variante" : `${optionCount} Varianten`}</b>
                    {variantDiff && (variantDiff.added || variantDiff.removed) ? (
                      <>
                        {" "}
                        ({variantDiff.added ? `${variantDiff.added} neu` : ""}
                        {variantDiff.added && variantDiff.removed ? ", " : ""}
                        {variantDiff.removed ? `${variantDiff.removed} fällt weg` : ""}).
                        {variantDiff.added ? " Neue Varianten bekommen den Preis der ersten Variante – anpassen kannst du ihn danach unter „Preise & Verfügbarkeit“." : ""}
                        {variantDiff.removed ? " Weggefallene Varianten verschwinden aus dem Shop." : ""}
                      </>
                    ) : (
                      "."
                    )}
                    {mode === "create" ? " Alle Varianten bekommen zuerst den Preis unten – einzeln ändern kannst du ihn nach dem Anlegen." : ""}
                  </>
                )}
              </div>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {mode === "create" ? (
              <Card title="Preis & Verkauf">
                <SaleFields errors={errors} onChange={(patch) => setSale((s) => ({ ...s, ...patch }))} values={sale} />
              </Card>
            ) : null}

            <Card title="Kollektionen">
              <fieldset>
                <legend className="mb-3 text-[13px] text-muted">In welchen Bereichen des Shops erscheint das Produkt?</legend>
                <div className="flex flex-col gap-2">
                  {collections.map((c) => (
                    <Check
                      checked={values.collections.includes(c.handle)}
                      key={c.handle}
                      label={c.title}
                      onChange={(on) => set("collections", on ? [...values.collections, c.handle] : values.collections.filter((x) => x !== c.handle))}
                    />
                  ))}
                </div>
                {values.collections.length === 0 ? (
                  <p className="mt-3 text-[13px] text-amber-800">Ohne Kollektion ist das Produkt nur unter „Alle Produkte“ zu finden.</p>
                ) : null}
              </fieldset>
            </Card>

            <Card title="Details">
              <div className="flex flex-col gap-5">
                <TextArea
                  error={errors.highlights}
                  help={`Ein Vorteil pro Zeile, höchstens ${LIMITS.highlights}. Erscheinen als Häkchen-Liste.`}
                  label="Stichpunkte"
                  onChange={(v) => set("highlights", v)}
                  optional
                  placeholder={"z. B. 250-ml-Dose\nGekühlt am besten"}
                  rows={4}
                  value={values.highlights}
                />
                <TextField
                  error={errors.packSize}
                  help="Wie viele Dosen im Paket sind (1 = Einzeldose)."
                  inputMode="numeric"
                  label="Dosen im Paket"
                  max={3}
                  onChange={(v) => set("packSize", v.replace(/[^\d]/g, ""))}
                  optional
                  placeholder="1"
                  value={values.packSize}
                />
              </div>
            </Card>
          </div>
        </div>

        {/* ── Speichern-Leiste ── */}
        <div className={`${barSticky ? "sticky bottom-3" : ""} z-20 mt-6`}>
          <div
            className={`flex flex-col gap-3 rounded-2xl border bg-card/95 p-3 shadow-[0_10px_30px_-12px_rgba(20,20,20,0.25)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:pl-5 ${dirty ? "border-ink/25" : "border-line"}`}
          >
            <p aria-live="polite" className="flex min-w-0 items-center gap-2.5 px-2 text-[14px] sm:px-0" role="status">
              <StatusDot tone={status.tone} />
              <span className={status.tone === "red" ? "text-red-700" : status.tone === "green" ? "text-emerald-800" : "text-ink/80"}>{status.text}</span>
            </p>
            <div className="flex shrink-0 gap-2">
              {mode === "edit" && dirty ? (
                <button
                  className={`${btnSecondary} flex-1 sm:flex-none`}
                  disabled={pending}
                  onClick={() => {
                    setValues(initial);
                    setSubmitted(false);
                    setDismissed(state);
                  }}
                  type="button"
                >
                  Verwerfen
                </button>
              ) : null}
              <button className={`${btn} flex-1 sm:flex-none sm:min-w-32`} disabled={pending || uploading > 0 || (mode === "edit" && !dirty)} type="submit">
                {pending ? <Spinner /> : null}
                {mode === "create" ? (pending ? "Wird angelegt …" : "Produkt anlegen") : pending ? "Speichern …" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {mode === "edit" ? <DeleteCard fromCatalog={fromCatalog} handle={handle} title={initial.title} /> : null}
    </>
  );
}

/* ───────────────────────── Bilder ───────────────────────── */

type Pending = { key: string; name: string; error?: string };

/** Bild im Browser verkleinern (Handy-Fotos sind oft 5–15 MB) – höchstens 2400 px, JPEG */
async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3_000_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.9));
  } catch {
    // Format kann der Browser nicht lesen (z. B. HEIC am PC) – kleine Dateien trotzdem versuchen, der Server prüft
    if (file.size < 4_000_000) return file;
    throw new Error("Dieses Bild kann nicht gelesen werden. Bitte als JPG oder PNG speichern und erneut versuchen.");
  }
}

async function uploadImage(file: File): Promise<{ src: string }> {
  const blob = await prepareImage(file);
  const data = new FormData();
  data.set("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
  const res = await fetch("/api/admin/media", { method: "POST", body: data }).catch(() => null);
  if (!res) throw new Error("Keine Verbindung. Bitte prüfe das Internet und versuche es erneut.");
  const body = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
  if (!res.ok || !body.src) throw new Error(body.error ?? "Hochladen hat nicht geklappt. Bitte versuche es erneut.");
  return { src: body.src };
}

function ImageManager({
  images,
  onChange,
  onUploading,
  title,
  error,
}: {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  onUploading: (delta: number) => void;
  title: string;
  error?: string;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const id = useId();

  const free = LIMITS.images - images.length - pending.filter((p) => !p.error).length;

  async function addFiles(list: FileList | File[]) {
    const files = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    const accepted = files.slice(0, Math.max(0, free));
    const skipped = files.length - accepted.length;
    const items = accepted.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name }));
    setPending((p) => [...p, ...items, ...(skipped ? [{ key: `skip-${Date.now()}`, name: "", error: `Höchstens ${LIMITS.images} Bilder – ${skipped === 1 ? "1 Bild wurde" : `${skipped} Bilder wurden`} nicht hinzugefügt.` }] : [])]);
    onUploading(accepted.length);
    // Nacheinander hochladen, damit die Reihenfolge stimmt
    for (const [i, file] of accepted.entries()) {
      const item = items[i];
      try {
        const { src } = await uploadImage(file);
        onChange([...imagesRef.current, { src, alt: "" }]);
        setPending((p) => p.filter((x) => x.key !== item.key));
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === item.key ? { ...x, error: e instanceof Error ? e.message : "Hochladen hat nicht geklappt." } : x)));
      } finally {
        onUploading(-1);
      }
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function onDropZone(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition ${dragIndex === i ? "border-ink/40 opacity-50" : "border-line"}`}
            draggable
            key={img.src}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              if (dragIndex !== i) {
                move(dragIndex, i);
                setDragIndex(i);
              }
            }}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            <div className="relative aspect-[4/5] cursor-grab bg-cream active:cursor-grabbing">
              {/* biome-ignore lint/performance/noImgElement: Vorschau im Dashboard */}
              <img alt={img.alt || title || "Produktbild"} className="absolute inset-0 size-full object-cover" draggable={false} loading="lazy" src={img.src} />
              <span className="absolute top-2 left-2 rounded-full bg-card/90 px-2 py-0.5 font-medium text-[11.5px] text-ink/80 tabular-nums shadow-sm">
                {i === 0 ? "Hauptbild" : i + 1}
              </span>
              <button
                aria-label={`Bild ${i + 1} entfernen`}
                className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-card/95 text-red-700 shadow-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
                onClick={() => onChange(images.filter((_, k) => k !== i))}
                title="Entfernen"
                type="button"
              >
                <TrashIcon />
              </button>
            </div>
            <div className="flex items-center gap-1 border-line border-t p-1.5">
              <IconButton disabled={i === 0} label={`Bild ${i + 1} nach vorne`} onClick={() => move(i, i - 1)}>
                <path d="m15 6-6 6 6 6" />
              </IconButton>
              <IconButton disabled={i === images.length - 1} label={`Bild ${i + 1} nach hinten`} onClick={() => move(i, i + 1)}>
                <path d="m9 6 6 6-6 6" />
              </IconButton>
              <span className="ml-auto" />
              <IconButton disabled={i === 0} label={i === 0 ? "Ist das Hauptbild" : `Bild ${i + 1} als Hauptbild`} onClick={() => move(i, 0)}>
                <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
              </IconButton>
            </div>
            <label className="sr-only" htmlFor={`${id}-alt-${i}`}>
              Bildbeschreibung für Bild {i + 1}
            </label>
            <input
              className="border-line border-t px-3 py-2 text-[12.5px] outline-none placeholder:text-ink/35 focus:bg-cream/40"
              id={`${id}-alt-${i}`}
              maxLength={LIMITS.alt}
              onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))}
              placeholder="Bildbeschreibung (optional)"
              value={img.alt}
            />
            <label className="sr-only" htmlFor={`${id}-ki-${i}`}>
              Herkunft von Bild {i + 1}
            </label>
            <select
              className={`border-line border-t bg-card px-2.5 py-2 text-[12.5px] outline-none focus:bg-cream/40 ${img.type && img.type !== "original" ? "text-ink" : "text-ink/60"}`}
              id={`${id}-ki-${i}`}
              onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, type: e.target.value as AiMediaType } : x)))}
              title="Mit KI erstellte oder bearbeitete Bilder werden im Shop gekennzeichnet"
              value={img.type ?? "original"}
            >
              <option value="original">Echtes Foto</option>
              <option value="ai-generated">KI-generiert</option>
              <option value="ai-edited">KI-bearbeitet</option>
            </select>
          </li>
        ))}

        {pending
          .filter((p) => !p.error)
          .map((p) => (
            <li className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-2xl border border-line border-dashed bg-cream/50 p-3 text-center" key={p.key}>
              <span aria-hidden className="size-6 animate-spin rounded-full border-2 border-ink/15 border-t-ink/60" />
              <span className="line-clamp-2 break-all text-[12px] text-muted">{p.name}</span>
            </li>
          ))}

        {free > 0 ? (
          <li>
            <button
              className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${dropActive ? "border-ink/50 bg-ink/5" : error ? "border-red-300 bg-red-50/40" : "border-line bg-paper hover:border-ink/30 hover:bg-card"}`}
              onClick={() => fileRef.current?.click()}
              onDragLeave={() => setDropActive(false)}
              onDragOver={(e) => {
                if (dragIndex !== null) return;
                e.preventDefault();
                setDropActive(true);
              }}
              onDrop={onDropZone}
              type="button"
            >
              <svg aria-hidden className="size-7 text-ink/50" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
                <rect height="16" rx="3" width="18" x="3" y="4" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="m21 16-5-5-8 8M12 2v5M9.5 4.5 12 2l2.5 2.5" />
              </svg>
              <span className="font-medium text-[14px]">Bilder hinzufügen</span>
              <span className="text-[12px] text-muted leading-snug">Klicken oder hierher ziehen · JPG, PNG, WebP</span>
            </button>
            <input accept="image/*" className="hidden" multiple onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }} ref={fileRef} type="file" />
          </li>
        ) : null}
      </ul>

      {pending.some((p) => p.error) ? (
        <ul className="mt-3 flex flex-col gap-2" role="alert">
          {pending
            .filter((p) => p.error)
            .map((p) => (
              <li className="flex items-start justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800" key={p.key}>
                <span>
                  {p.name ? <b className="break-all">{p.name}: </b> : null}
                  {p.error}
                </span>
                <button className="shrink-0 underline underline-offset-2" onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))} type="button">
                  OK
                </button>
              </li>
            ))}
        </ul>
      ) : null}
      {error ? <p className="mt-3 text-[13px] text-red-700">{error}</p> : null}
      <p className="mt-4 text-[12.5px] text-muted leading-relaxed">
        Das erste Bild ist das Hauptbild auf Produktkarten. Reihenfolge per Pfeil, Stern (= Hauptbild) oder durch Ziehen ändern. Am schönsten im Hochformat (4:5) vor ruhigem,
        hellem Hintergrund. Große Handy-Fotos werden automatisch verkleinert, Standortdaten werden entfernt. Mit KI erstellte oder bearbeitete Bilder bitte unten am Bild als „KI-generiert“ bzw. „KI-bearbeitet“ markieren – sie bekommen im Shop eine kleine Kennzeichnung. Erst mit „Speichern“ erscheinen Änderungen im Shop.
      </p>
    </div>
  );
}

function IconButton({ label: text, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={text}
      className="flex size-8 items-center justify-center rounded-full text-ink/70 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-30 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
      title={text}
      type="button"
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  );
}

/* ───────────────────────── Texte ───────────────────────── */

function FieldLabel({ htmlFor, text, optional, required, counter }: { htmlFor: string; text: string; optional?: boolean; required?: boolean; counter?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <label className={label} htmlFor={htmlFor}>
        {text}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
        {required ? <span className="font-normal text-muted"> *</span> : null}
      </label>
      {counter}
    </div>
  );
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span aria-hidden className={`mb-1.5 shrink-0 text-[12.5px] tabular-nums ${length > max ? "text-red-700" : length > max * 0.9 ? "text-amber-700" : "text-muted"}`}>
      {length}/{max}
    </span>
  );
}

function TextField({
  label: text,
  value,
  onChange,
  error,
  help,
  max,
  placeholder,
  optional,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: ReactNode;
  max: number;
  placeholder?: string;
  optional?: boolean;
  required?: boolean;
  inputMode?: "numeric";
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel counter={max > 10 ? <Counter length={value.length} max={max} /> : null} htmlFor={id} optional={optional} required={required} text={text} />
      <input
        aria-describedby={`${id}-msg`}
        aria-invalid={error ? true : undefined}
        className={`${input} placeholder:text-ink/35 ${error ? invalidInput : ""}`}
        id={id}
        inputMode={inputMode}
        maxLength={max + 20}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <div id={`${id}-msg`}>
        {error ? <p className="mt-1.5 text-[13px] text-red-700">{error}</p> : help ? <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed">{help}</p> : null}
      </div>
    </div>
  );
}

function TextArea({
  label: text,
  value,
  onChange,
  error,
  help,
  placeholder,
  optional,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: ReactNode;
  placeholder?: string;
  optional?: boolean;
  rows?: number;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} optional={optional} text={text} />
      <textarea
        aria-describedby={`${id}-msg`}
        aria-invalid={error ? true : undefined}
        className={`${input} resize-y leading-snug placeholder:text-ink/35 ${error ? invalidInput : ""}`}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
      <div id={`${id}-msg`}>
        {error ? <p className="mt-1.5 text-[13px] text-red-700">{error}</p> : help ? <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed">{help}</p> : null}
      </div>
    </div>
  );
}

function SelectField({ label: text, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} text={text} />
      <select className={`${input} appearance-auto`} id={id} onChange={(e) => onChange(e.target.value)} value={value}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function DescriptionField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /** Markierten Text mit Zeichen umgeben bzw. Zeilen mit einem Präfix versehen */
  function format(kind: "bold" | "heading" | "list") {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    let next: string;
    let cursor: number;
    if (kind === "bold") {
      const sel = value.slice(a, b) || "fetter Text";
      next = `${value.slice(0, a)}**${sel}**${value.slice(b)}`;
      cursor = a + sel.length + 4;
    } else {
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      const prefix = kind === "heading" ? "## " : "- ";
      const lines = value.slice(lineStart, b).split("\n");
      const changed = lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l.replace(/^(## |- )/, ""))).join("\n");
      next = value.slice(0, lineStart) + changed + value.slice(b);
      cursor = lineStart + changed.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div>
      <FieldLabel counter={<Counter length={value.length} max={LIMITS.description} />} htmlFor={id} optional text="Beschreibung" />
      <div className={`overflow-hidden rounded-2xl border bg-card transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/10 ${error ? "border-red-300" : "border-line"}`}>
        <div className="flex flex-wrap items-center gap-1 border-line border-b bg-paper px-2 py-1.5">
          <ToolButton disabled={preview} onClick={() => format("bold")} title="Fett">
            <b>F</b>
          </ToolButton>
          <ToolButton disabled={preview} onClick={() => format("heading")} title="Zwischenüberschrift">
            Überschrift
          </ToolButton>
          <ToolButton disabled={preview} onClick={() => format("list")} title="Aufzählung">
            • Liste
          </ToolButton>
          <span className="ml-auto" />
          <ToolButton onClick={() => setPreview((p) => !p)} pressed={preview} title="So sieht es im Shop aus">
            {preview ? "Bearbeiten" : "Vorschau"}
          </ToolButton>
        </div>
        {preview ? (
          <div
            className="prose-shop max-h-[28rem] min-h-[12rem] overflow-y-auto px-4 py-3 text-[15px]"
            // textToHtml maskiert alle Eingaben – es entstehen nur einfache, sichere Tags
            // biome-ignore lint/security/noDangerouslySetInnerHtml: siehe oben
            dangerouslySetInnerHTML={{ __html: textToHtml(value) || "<p><em>Noch keine Beschreibung.</em></p>" }}
          />
        ) : (
          <textarea
            aria-describedby={`${id}-help`}
            aria-invalid={error ? true : undefined}
            className="block min-h-[12rem] w-full resize-y px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink/35"
            id={id}
            onChange={(e) => onChange(e.target.value)}
            placeholder={"Was macht das Produkt besonders?\n\n## Geschmack\n- Fruchtig und erfrischend\n- Gekühlt am besten"}
            ref={textRef}
            rows={10}
            value={value}
          />
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed" id={`${id}-help`}>
        {error ? <span className="text-red-700">{error} </span> : null}
        Leerzeile = neuer Absatz · <code className="rounded bg-ink/5 px-1">## </code> am Zeilenanfang = Zwischenüberschrift ·{" "}
        <code className="rounded bg-ink/5 px-1">- </code> = Aufzählung · <code className="rounded bg-ink/5 px-1">**Wort**</code> = fett
      </p>
    </div>
  );
}

function ToolButton({ children, onClick, title, disabled, pressed }: { children: ReactNode; onClick: () => void; title: string; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      aria-pressed={pressed}
      className={`rounded-lg px-2.5 py-1 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-35 ${pressed ? "bg-accent text-white" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

/* ───────────────────────── Varianten ───────────────────────── */

const SUGGESTIONS: OptionInput[] = [
  { name: "Packung", values: "6er Pack, 12er Pack, 24er Pack" },
];

function OptionsEditor({ options, onChange, errors }: { options: OptionInput[]; onChange: (o: OptionInput[]) => void; errors: Record<string, string | undefined> }) {
  const id = useId();
  const update = (i: number, patch: Partial<OptionInput>) => onChange(options.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const unused = SUGGESTIONS.filter((s) => !options.some((o) => o.name.trim().toLowerCase() === s.name.toLowerCase()));

  return (
    <div>
      <p className="mb-4 text-[13.5px] text-ink/75 leading-relaxed">
        Wähle, was Kund:innen beim Kauf aussuchen – z. B. die Packungsgröße („6er Pack“, „12er Pack“) – daraus berechnet der Shop auch das Pfand. Aus allen Kombinationen entstehen die Varianten. Ohne Auswahl gibt es genau eine
        Variante.
      </p>
      {options.length ? (
        <ul className="flex flex-col gap-3">
          {options.map((o, i) => {
            const values = parseValues(o.values);
            const nameError = errors[`option.${i}.name`];
            const valuesError = errors[`option.${i}.values`];
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: Reihenfolge ist die Identität
              <li className="rounded-2xl border border-line p-4" key={i}>
                <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start">
                  <div>
                    <label className={label} htmlFor={`${id}-n${i}`}>
                      Name
                    </label>
                    <input
                      aria-invalid={nameError ? true : undefined}
                      className={`${input} placeholder:text-ink/35 ${nameError ? invalidInput : ""}`}
                      id={`${id}-n${i}`}
                      maxLength={LIMITS.optionName + 10}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder="z. B. Packung"
                      value={o.name}
                    />
                    {nameError ? <p className="mt-1.5 text-[13px] text-red-700">{nameError}</p> : null}
                  </div>
                  <div>
                    <label className={label} htmlFor={`${id}-v${i}`}>
                      Werte <span className="font-normal text-muted">(mit Komma trennen)</span>
                    </label>
                    <input
                      aria-invalid={valuesError ? true : undefined}
                      className={`${input} placeholder:text-ink/35 ${valuesError ? invalidInput : ""}`}
                      id={`${id}-v${i}`}
                      onChange={(e) => update(i, { values: e.target.value })}
                      placeholder="z. B. S, M, L, XL"
                      value={o.values}
                    />
                    {valuesError ? (
                      <p className="mt-1.5 text-[13px] text-red-700">{valuesError}</p>
                    ) : values.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {values.map((v) => (
                          <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[12.5px] text-ink/80" key={v}>
                            {v}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="justify-self-start rounded-full px-3 py-2 text-[13px] text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 sm:mt-6"
                    onClick={() => onChange(options.filter((_, k) => k !== i))}
                    type="button"
                  >
                    Entfernen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {options.length < LIMITS.options ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {unused.map((s) => (
            <button className={btnSecondarySm} key={s.name} onClick={() => onChange([...options, s])} type="button">
              + {s.name}
            </button>
          ))}
          <button className={btnSecondarySm} onClick={() => onChange([...options, { name: "", values: "" }])} type="button">
            + Eigene Auswahl
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Neues Produkt: Preis & Verkauf ───────────────────────── */

function SaleFields({ values, onChange, errors }: { values: SaleValues; onChange: (p: Partial<SaleValues>) => void; errors: Record<string, string | undefined> }) {
  const id = useId();
  const normalize = (key: "price" | "compare") => {
    const p = parseEuro(values[key]);
    if (!p.error && p.cents !== null) onChange({ [key]: centsToInput(p.cents) });
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor={`${id}-p`} required text="Preis" />
          <Euro error={errors.price} id={`${id}-p`} onBlur={() => normalize("price")} onChange={(price) => onChange({ price })} placeholder="29,90" value={values.price} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-c`} text="Streichpreis" />
          <Euro error={errors.compare} id={`${id}-c`} onBlur={() => normalize("compare")} onChange={(compare) => onChange({ compare })} placeholder="–" value={values.compare} />
        </div>
      </div>
      {errors.price || errors.compare ? <p className="-mt-3 text-[13px] text-red-700">{errors.price ?? errors.compare}</p> : null}
      <div>
        <FieldLabel counter={<Counter length={values.material.length} max={MATERIAL_MAX} />} htmlFor={`${id}-m`} text="Zutaten & Nährwerte" />
        <textarea
          aria-invalid={errors.material ? true : undefined}
          className={`${input} min-h-[4.5rem] resize-y leading-snug placeholder:text-ink/35 ${errors.material ? invalidInput : ""}`}
          id={`${id}-m`}
          maxLength={MATERIAL_MAX}
          onBlur={() => onChange({ material: cleanMaterial(values.material) })}
          onChange={(e) => onChange({ material: e.target.value })}
          placeholder="z. B. Zutaten: Wasser, Zucker, … · Nährwerte je 100 ml: … · Koffein: … mg/100 ml"
          rows={2}
          value={values.material}
        />
        <p className={`mt-1.5 text-[12.5px] leading-relaxed ${errors.material ? "text-red-700" : "text-muted"}`}>
          {errors.material ?? "Pflichtangabe bei Lebensmitteln – wie auf der Dose. Kann auch später ergänzt werden."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Check checked={values.visible} description="Aus = erst einmal ausgeblendet, z. B. bis alle Bilder da sind." label="Gleich im Shop zeigen" onChange={(visible) => onChange({ visible })} />
        <Check checked={values.featured} label="Als Bestseller auf der Startseite" onChange={(featured) => onChange({ featured })} />
      </div>
    </div>
  );
}

function Euro({ id, value, onChange, onBlur, placeholder, error }: { id: string; value: string; onChange: (v: string) => void; onBlur: () => void; placeholder: string; error?: string }) {
  return (
    <div className="relative">
      <input
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        className={`${input} pr-8 text-right tabular-nums placeholder:text-ink/35 ${error ? invalidInput : ""}`}
        id={id}
        inputMode="decimal"
        maxLength={20}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[14px] text-muted">
        €
      </span>
    </div>
  );
}

function Check({ label: text, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line px-4 py-3 transition hover:border-ink/30 has-focus-visible:ring-4 has-focus-visible:ring-ink/15" htmlFor={id}>
      <input checked={checked} className="mt-0.5 size-[18px] shrink-0 accent-ink" id={id} onChange={(e) => onChange(e.target.checked)} type="checkbox" />
      <span>
        <span className="block text-[15px]">{text}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] text-muted leading-snug">{description}</span> : null}
      </span>
    </label>
  );
}

/* ───────────────────────── Löschen ───────────────────────── */

function DeleteCard({ handle, title, fromCatalog }: { handle: string; title: string; fromCatalog: boolean }) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(deleteProduct, {});
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-10">
      <Card title="Produkt löschen">
        <p className="text-[14px] text-ink/80 leading-relaxed">
          Das Produkt verschwindet aus dem Shop, aus Suchergebnissen und aus Warenkörben.{" "}
          {fromCatalog
            ? "Es gehört zum ursprünglichen Sortiment und lässt sich später in der Produktliste unter „Gelöschte Produkte“ wiederherstellen."
            : "Selbst angelegte Produkte lassen sich nicht wiederherstellen – auch die Bilder werden gelöscht."}{" "}
          Nur vorübergehend nicht verkaufen? Dann besser unter „Preise & Verfügbarkeit“ ausblenden.
        </p>
        {confirm ? (
          <form action={action} aria-label="Löschen bestätigen" className="mt-4 rounded-2xl border border-red-200 bg-red-50/60 p-4">
            <input name="handle" type="hidden" value={handle} />
            <p className="font-medium text-[14px] text-red-900">„{title}“ wirklich löschen?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-700 px-4 py-2 font-medium text-sm text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:opacity-50"
                disabled={pending}
                type="submit"
              >
                {pending ? <Spinner /> : null}
                {pending ? "Wird gelöscht …" : "Ja, endgültig löschen"}
              </button>
              <button className={btnSecondarySm} disabled={pending} onClick={() => setConfirm(false)} type="button">
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <button
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-card px-4 py-2 font-medium text-red-700 text-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
            onClick={() => setConfirm(true)}
            type="button"
          >
            <TrashIcon />
            Produkt löschen
          </button>
        )}
        {state.error ? (
          <p className="mt-3 text-[13px] text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/* ───────────────────────── Kleinteile ───────────────────────── */

function StatusDot({ tone }: { tone: "neutral" | "amber" | "red" | "green" }) {
  if (tone === "green")
    return (
      <svg aria-hidden className="size-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  const color = { neutral: "bg-ink/25", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function TrashIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

