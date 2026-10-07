"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { type CustomProducts, type ProductOverrides, applyOverride, catalog, getBaseProduct, getOverrides, isDeleted, mergeBase } from "@/lib/catalog";
import { isAiMediaType, mediaKey } from "@/lib/ai-media";
import { clearAiOverrides } from "@/lib/ai-media-store";
import { deleteUnused } from "@/lib/media";
import { KEYS, StoreUnavailableError, updateJSON } from "@/lib/store";
import type { Product } from "@/lib/types";
import { type ContentInput, buildVariants, checkContent, uniqueHandle } from "./content";
import { type DesiredProduct, buildOverride, checkMaterial, checkVariant, field } from "./pricing";

export type ProductFormState = {
  ok?: boolean;
  /** Erfolgsmeldung */
  message?: string;
  /** Allgemeiner Fehler */
  error?: string;
  /** Fehler an einzelnen Feldern (Feldname → Meldung) */
  fieldErrors?: Record<string, string>;
  /** Zeitpunkt der letzten erfolgreichen Speicherung (damit die Meldung neu erscheint) */
  savedAt?: number;
};

const NOT_LOGGED_IN = "Du bist nicht mehr angemeldet. Bitte lade die Seite neu und melde dich wieder an.";
const SAVE_FAILED = "Speichern hat leider nicht geklappt. Bitte versuche es gleich noch einmal.";

/**
 * Checkbox mit verstecktem Rückfallwert lesen: `<input type="hidden" value="0">` + `<input type="checkbox" value="1">`.
 * So erkennen wir „nicht angehakt“ sicher und eine unvollständige Anfrage führt nicht zu Änderungen.
 */
function readCheckbox(form: FormData, name: string): boolean | undefined {
  const values = form.getAll(name);
  if (values.length === 0) return undefined;
  return values.includes("1");
}

/** Alle Pfade neu laden, die Produktdaten zeigen */
function refresh(handle: string) {
  revalidateShop();
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/produkte/${handle}`);
}

/** Sichtbarkeit, Bestseller, Zutaten & Nährwerte, Preise, Streichpreise und Verfügbarkeit eines Produkts speichern */
export async function saveProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  // Server Actions sind öffentlich erreichbar – deshalb immer zuerst die Anmeldung prüfen
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }

  const handle = String(form.get("handle") ?? "");
  const base = /^[a-z0-9-]{1,120}$/.test(handle) ? await getBaseProduct(handle) : undefined;
  if (!base) return { error: "Dieses Produkt gibt es nicht (mehr). Bitte lade die Seite neu." };

  const visible = readCheckbox(form, "visible");
  const featured = readCheckbox(form, "featured");
  const materialRaw = form.get("material");
  if (visible === undefined || featured === undefined || typeof materialRaw !== "string" || materialRaw.length > 2000) {
    return { error: "Die Angaben sind unvollständig. Bitte lade die Seite neu und versuche es noch einmal." };
  }

  const fieldErrors: Record<string, string> = {};
  const material = checkMaterial(materialRaw);
  if (material.error) fieldErrors.material = material.error;

  const desired: DesiredProduct = { hidden: !visible, featured, variants: {}, material: material.value };

  for (const v of base.variants) {
    const price = form.get(field.price(v.id));
    const compare = form.get(field.compare(v.id));
    const available = readCheckbox(form, field.available(v.id));
    if (typeof price !== "string" || typeof compare !== "string" || available === undefined || price.length > 40 || compare.length > 40) {
      return { error: "Die Angaben sind unvollständig. Bitte lade die Seite neu und versuche es noch einmal." };
    }
    const { value, errors } = checkVariant({ price, compare, available });
    if (errors.price) fieldErrors[field.price(v.id)] = errors.price;
    if (errors.compare) fieldErrors[field.compare(v.id)] = errors.compare;
    if (value) desired.variants[v.id] = value;
  }

  const errorCount = Object.keys(fieldErrors).length;
  if (errorCount) {
    return {
      error: errorCount === 1 ? "Bitte prüfe das rot markierte Feld." : `Bitte prüfe die ${errorCount} rot markierten Felder.`,
      fieldErrors,
    };
  }

  const override = buildOverride(base, desired);
  try {
    // Nur dieses Produkt anfassen – Änderungen an anderen Produkten bleiben erhalten
    await updateJSON<ProductOverrides>(KEYS.products, {}, (all) => {
      const next = { ...all };
      if (override) next[handle] = override;
      else delete next[handle];
      return next;
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[produkte] Speichern fehlgeschlagen", handle, error);
    return { error: SAVE_FAILED };
  }

  refresh(handle);

  const message = desired.hidden
    ? "Gespeichert – das Produkt ist jetzt im Shop ausgeblendet."
    : override
      ? "Gespeichert – die Änderungen sind in wenigen Sekunden im Shop zu sehen."
      : "Gespeichert – alles entspricht wieder dem Original.";
  return { ok: true, message, savedAt: Date.now() };
}

/**
 * Alle Änderungen an Preisen, Verfügbarkeit, Sichtbarkeit und Bestseller verwerfen – danach gelten wieder die Original-Werte.
 * Zutaten & Nährwerte bleiben erhalten (sie ist eine Pflichtangabe und kein „geänderter“ Katalogwert).
 */
export async function resetProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }

  const handle = String(form.get("handle") ?? "");
  if (!/^[a-z0-9-]{1,120}$/.test(handle) || !(await getBaseProduct(handle))) return { error: "Dieses Produkt gibt es nicht (mehr). Bitte lade die Seite neu." };

  let keptMaterial = false;
  try {
    await updateJSON<ProductOverrides>(KEYS.products, {}, (all) => {
      const next = { ...all };
      const material = all[handle]?.material;
      keptMaterial = material !== undefined;
      if (material !== undefined) next[handle] = { material };
      else delete next[handle];
      return next;
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[produkte] Zurücksetzen fehlgeschlagen", handle, error);
    return { error: SAVE_FAILED };
  }

  refresh(handle);
  return {
    ok: true,
    message: keptMaterial ? "Zurückgesetzt – es gelten wieder die Original-Werte. Zutaten & Nährwerte bleiben erhalten." : "Zurückgesetzt – es gelten wieder die Original-Werte.",
    savedAt: Date.now(),
  };
}

/* ───────────────────────── Bilder & Texte · Neues Produkt · Löschen ───────────────────────── */

const RESERVED = new Set(["neu"]);
const INCOMPLETE = "Die Angaben sind unvollständig. Bitte lade die Seite neu und versuche es noch einmal.";

function readContent(form: FormData): ContentInput | null {
  const raw = form.get("content");
  if (typeof raw !== "string" || raw.length > 100_000) return null;
  try {
    const c = JSON.parse(raw) as Partial<ContentInput>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    if (!Array.isArray(c.images) || !Array.isArray(c.collections) || !Array.isArray(c.options)) return null;
    return {
      title: str(c.title),
      subtitle: str(c.subtitle),
      description: str(c.description),
      images: c.images.filter((i) => i && typeof i.src === "string").map((i) => ({ src: i.src, alt: str(i.alt), type: isAiMediaType(i.type) ? i.type : undefined })),
      collections: c.collections.filter((x): x is string => typeof x === "string"),
      highlights: str(c.highlights),
      capacity: str(c.capacity),
      absorbency: str(c.absorbency),
      packSize: str(c.packSize),
      options: c.options.filter((o) => o && typeof o === "object").map((o) => ({ name: str(o.name), values: str(o.values) })),
    };
  } catch {
    return null;
  }
}

function errorSummary(fieldErrors: Record<string, string>): ProductFormState {
  const n = Object.keys(fieldErrors).length;
  return { error: n === 1 ? "Bitte prüfe das rot markierte Feld." : `Bitte prüfe die ${n} rot markierten Felder.`, fieldErrors };
}

/** Alle Bildadressen, die im Shop noch verwendet werden (für das Aufräumen alter Bilder) */
function usedImages(custom: CustomProducts) {
  return [...mergeBase(custom).flatMap((p) => p.images.map((i) => i.src)), ...catalog.collections.flatMap((c) => (c.image ? [c.image] : []))];
}

/** Texte, Bilder, Kollektionen und Varianten eines Produkts speichern */
export async function saveContent(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }
  const handle = String(form.get("handle") ?? "");
  const input = readContent(form);
  if (!/^[a-z0-9-]{1,120}$/.test(handle) || !input) return { error: INCOMPLETE };

  const { value, errors } = checkContent(input, catalog.collections.map((c) => c.handle));
  if (!value) return errorSummary(errors);

  let before: Product | undefined;
  let after: CustomProducts | undefined;
  try {
    const overrides = await getOverrides();
    after = await updateJSON<CustomProducts>(KEYS.custom, {}, (all) => {
      const entry = all[handle];
      const base = isDeleted(entry) ? undefined : (entry ?? catalog.products.find((p) => p.handle === handle));
      if (!base) throw new NotFoundError();
      before = base;
      // Neue Varianten bekommen den Preis, der gerade im Shop für die erste Variante gilt
      const first = applyOverride(base, overrides[handle]).variants[0];
      const variants = buildVariants(handle, value.options, base.variants, { price: first?.price ?? 1000, compareAtPrice: first?.compareAtPrice });
      return { ...all, [handle]: { ...base, ...value, variants } };
    });
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "Dieses Produkt gibt es nicht (mehr). Bitte lade die Seite neu." };
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[produkte] Inhalt speichern fehlgeschlagen", handle, error);
    return { error: SAVE_FAILED };
  }
  if (before && after) await deleteUnused(before.images.map((i) => i.src), usedImages(after));
  // Die Auswahl „Echtes Foto / KI“ im Editor steht jetzt am Bild – eine ältere Auswahl aus der KI-Übersicht für diese Bilder entfernen
  await clearAiOverrides(value.images.map((i) => mediaKey(i.src))).catch((e) => console.error("[produkte] KI-Auswahl aufräumen fehlgeschlagen", e));

  refresh(handle);
  revalidatePath(`/admin/produkte/${handle}/inhalt`);
  return { ok: true, message: "Gespeichert – die Änderungen sind in wenigen Sekunden im Shop zu sehen.", savedAt: Date.now() };
}

class NotFoundError extends Error {}

/** Neues Produkt anlegen – danach geht es direkt zum Produkt */
export async function createProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }
  const input = readContent(form);
  const visible = readCheckbox(form, "visible");
  const featured = readCheckbox(form, "featured");
  const priceRaw = form.get("price");
  const compareRaw = form.get("compare");
  const materialRaw = form.get("material");
  if (!input || visible === undefined || featured === undefined || typeof priceRaw !== "string" || typeof compareRaw !== "string" || typeof materialRaw !== "string") {
    return { error: INCOMPLETE };
  }

  const { value, errors } = checkContent(input, catalog.collections.map((c) => c.handle));
  const fieldErrors = { ...errors };
  const price = checkVariant({ price: priceRaw.slice(0, 40), compare: compareRaw.slice(0, 40), available: true });
  if (price.errors.price) fieldErrors.price = price.errors.price;
  if (price.errors.compare) fieldErrors.compare = price.errors.compare;
  const material = checkMaterial(materialRaw.slice(0, 2000));
  if (material.error) fieldErrors.material = material.error;
  if (!value || !price.value || Object.keys(fieldErrors).length) return errorSummary(fieldErrors);

  let handle = "";
  try {
    await updateJSON<CustomProducts>(KEYS.custom, {}, (all) => {
      const taken = new Set([...RESERVED, ...catalog.products.map((p) => p.handle), ...Object.keys(all)]);
      handle = uniqueHandle(value.title, taken);
      const product: Product = {
        handle,
        vendor: catalog.brand.name,
        tags: [],
        createdAt: new Date().toISOString(),
        ...value,
        featured: featured || undefined,
        material: material.value || undefined,
        variants: buildVariants(handle, value.options, [], { price: price.value?.price ?? 0, compareAtPrice: price.value?.compareAtPrice }),
      };
      return { ...all, [handle]: product };
    });
    if (!visible) {
      await updateJSON<ProductOverrides>(KEYS.products, {}, (all) => ({ ...all, [handle]: { hidden: true } }));
    }
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[produkte] Anlegen fehlgeschlagen", error);
    return { error: SAVE_FAILED };
  }

  refresh(handle);
  redirect(`/admin/produkte/${handle}?angelegt=1`);
}

/** Produkt löschen. Katalogprodukte lassen sich später wiederherstellen, selbst angelegte nicht. */
export async function deleteProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }
  const handle = String(form.get("handle") ?? "");
  if (!/^[a-z0-9-]{1,120}$/.test(handle)) return { error: INCOMPLETE };

  let removed: Product | undefined;
  let after: CustomProducts | undefined;
  try {
    after = await updateJSON<CustomProducts>(KEYS.custom, {}, (all) => {
      const entry = all[handle];
      const fromCatalog = catalog.products.find((p) => p.handle === handle);
      if (isDeleted(entry) || (!entry && !fromCatalog)) throw new NotFoundError();
      removed = entry ?? fromCatalog;
      const next = { ...all };
      if (fromCatalog) next[handle] = { deleted: true, title: removed?.title ?? handle, deletedAt: new Date().toISOString() };
      else delete next[handle];
      return next;
    });
    await updateJSON<ProductOverrides>(KEYS.products, {}, (all) => {
      if (!(handle in all)) return all;
      const next = { ...all };
      delete next[handle];
      return next;
    });
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "Dieses Produkt gibt es nicht (mehr). Bitte lade die Seite neu." };
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[produkte] Löschen fehlgeschlagen", handle, error);
    return { error: SAVE_FAILED };
  }
  if (removed && after) await deleteUnused(removed.images.map((i) => i.src), usedImages(after));

  refresh(handle);
  redirect(`/admin/produkte?geloescht=${encodeURIComponent(removed?.title ?? handle)}`);
}

/** Gelöschtes Katalogprodukt wiederherstellen (im Original-Zustand) */
export async function restoreProduct(form: FormData): Promise<void> {
  await assertAdmin();
  const handle = String(form.get("handle") ?? "");
  if (!catalog.products.some((p) => p.handle === handle)) return;
  await updateJSON<CustomProducts>(KEYS.custom, {}, (all) => {
    if (!isDeleted(all[handle])) return all;
    const next = { ...all };
    delete next[handle];
    return next;
  });
  refresh(handle);
  redirect(`/admin/produkte/${handle}`);
}
