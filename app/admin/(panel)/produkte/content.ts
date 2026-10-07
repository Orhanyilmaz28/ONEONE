import { isAiMediaType } from "@/lib/ai-media";
import type { Product, ProductImage, ProductOption, Variant } from "@/lib/types";

/**
 * Gemeinsame Hilfen für „Bilder & Texte“ und „Neues Produkt“.
 * Läuft im Browser (sofortige Rückmeldung) UND auf dem Server (endgültige Prüfung) – nichts Server-Spezifisches importieren.
 */

export const LIMITS = {
  title: 80,
  subtitle: 120,
  description: 8000,
  highlight: 90,
  highlights: 6,
  capacity: 40,
  images: 12,
  alt: 160,
  options: 3,
  optionName: 30,
  value: 30,
  values: 20,
  variants: 200,
} as const;

/* ───────────────────────── Adresse (Handle) ───────────────────────── */

/** „Damen Slip 3er-Pack“ → „damen-slip-3er-pack“ */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Freie Adresse finden: „damen-slip“, sonst „damen-slip-2“, „damen-slip-3“ … */
export function uniqueHandle(title: string, taken: Set<string>) {
  const base = slugify(title) || "produkt";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/* ───────────────────────── Beschreibung ───────────────────────── */

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string) {
  // **fett** → <strong>
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Einfache Schreibweise → HTML für den Shop. Alles wird maskiert, es entsteht nur <p>, <h3>, <ul>, <li>, <strong>, <br>.
 * - Leerzeile = neuer Absatz
 * - „## Überschrift“ = Zwischenüberschrift
 * - „- Punkt“ = Aufzählung
 * - „**Wort**“ = fett
 */
export function textToHtml(text: string) {
  const blocks: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(`<p>${para.map(inline).join("<br>\n")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>\n${list.map((li) => `<li>${inline(li)}</li>`).join("\n")}\n</ul>`);
    list = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (/^#{1,6}\s+/.test(line)) {
      flushPara();
      flushList();
      blocks.push(`<h3>${inline(line.replace(/^#{1,6}\s+/, ""))}</h3>`);
    } else if (/^[-•*]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^[-•*]\s+/, ""));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.join("\n");
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

function inlineToText(html: string) {
  return decode(
    html
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** HTML aus dem Katalog → einfache Schreibweise zum Bearbeiten */
export function htmlToText(html: string) {
  const blocks: string[] = [];
  for (const m of html.matchAll(/<(h[1-6]|p|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const items = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => `- ${inlineToText(li[1]).replace(/\n/g, " ")}`);
      if (items.length) blocks.push(items.join("\n"));
    } else {
      const text = inlineToText(m[2]);
      if (text) blocks.push(tag === "p" ? text : `## ${text.replace(/\n/g, " ")}`);
    }
  }
  return blocks.length ? blocks.join("\n\n") : inlineToText(html);
}

/* ───────────────────────── Varianten ───────────────────────── */

/** Eingabe einer Option, z. B. { name: "Größe", values: "S, M, L, XL" } */
export type OptionInput = { name: string; values: string };

export function parseValues(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,;\n]/)
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter((v) => {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Alle Kombinationen der Optionen (Farbe × Größe …) */
export function combinations(options: ProductOption[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))), [{}]);
}

/**
 * Varianten neu aufbauen. Bestehende Kombinationen behalten ID, Preis und Verfügbarkeit;
 * neue Kombinationen bekommen `defaults`.
 */
export function buildVariants(handle: string, options: ProductOption[], previous: Variant[], defaults: { price: number; compareAtPrice?: number }): Variant[] {
  const key = (o: Record<string, string>) =>
    Object.entries(o)
      .map(([n, v]) => `${n.toLowerCase()}=${v.toLowerCase()}`)
      .sort()
      .join("|");
  const prev = new Map(previous.map((v) => [key(v.options), v]));
  const usedIds = new Set<string>();
  return combinations(options).map((combo) => {
    const values = options.map((o) => combo[o.name]);
    const title = values.length ? values.join(" / ") : "Standard";
    const old = prev.get(key(combo));
    if (old && !usedIds.has(old.id)) {
      usedIds.add(old.id);
      return { ...old, title, options: combo };
    }
    let id = `${handle}-${slugify(values.join(" ")) || "standard"}`;
    for (let i = 2; usedIds.has(id) || previous.some((p) => p.id === id && key(p.options) !== key(combo)); i++) id = `${handle}-${slugify(values.join(" ")) || "standard"}-${i}`;
    usedIds.add(id);
    return { id, title, price: defaults.price, compareAtPrice: defaults.compareAtPrice, available: true, options: combo };
  });
}

/* ───────────────────────── Prüfen ───────────────────────── */

/** Was im Formular „Bilder & Texte“ bearbeitet wird */
export type ContentInput = {
  title: string;
  subtitle: string;
  description: string;
  images: ProductImage[];
  collections: string[];
  highlights: string;
  capacity: string;
  absorbency: string;
  packSize: string;
  options: OptionInput[];
};

export type ContentValue = Pick<Product, "title" | "descriptionHtml" | "images" | "collections" | "options"> &
  Pick<Product, "subtitle" | "highlights" | "capacity" | "absorbency" | "packSize">;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Prüft alle Felder. Fehler je Feld (Feldname → Meldung) */
export function checkContent(input: ContentInput, knownCollections: string[]): { value?: ContentValue; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = oneLine(input.title);
  if (!title) errors.title = "Bitte einen Produktnamen eingeben.";
  else if (title.length > LIMITS.title) errors.title = `Bitte höchstens ${LIMITS.title} Zeichen.`;

  const subtitle = oneLine(input.subtitle);
  if (subtitle.length > LIMITS.subtitle) errors.subtitle = `Bitte höchstens ${LIMITS.subtitle} Zeichen.`;

  const description = input.description.trim();
  if (description.length > LIMITS.description) errors.description = `Bitte höchstens ${LIMITS.description.toLocaleString("de-DE")} Zeichen.`;

  if (input.images.length > LIMITS.images) errors.images = `Bitte höchstens ${LIMITS.images} Bilder.`;
  // KI-Kennzeichnung je Bild übernehmen; „original“ wird nicht gespeichert (gilt ohne Angabe)
  const images = input.images.map((img) => ({ src: img.src, alt: oneLine(img.alt).slice(0, LIMITS.alt) || title, ...(isAiMediaType(img.type) && img.type !== "original" ? { type: img.type } : {}) }));
  if (images.some((img) => !/^\/(media|produkte|imported|bilder)\/[\w./-]+$/.test(img.src) || img.src.includes(".."))) errors.images = "Ein Bild ist ungültig. Bitte lade die Seite neu.";

  const collections = input.collections.filter((c) => knownCollections.includes(c));

  const highlights = input.highlights
    .split("\n")
    .map(oneLine)
    .filter(Boolean);
  if (highlights.length > LIMITS.highlights) errors.highlights = `Bitte höchstens ${LIMITS.highlights} Stichpunkte.`;
  else if (highlights.some((h) => h.length > LIMITS.highlight)) errors.highlights = `Jeder Stichpunkt höchstens ${LIMITS.highlight} Zeichen.`;

  const capacity = oneLine(input.capacity);
  if (capacity.length > LIMITS.capacity) errors.capacity = `Bitte höchstens ${LIMITS.capacity} Zeichen.`;

  const absorbency = input.absorbency === "1" || input.absorbency === "2" || input.absorbency === "3" ? (Number(input.absorbency) as 1 | 2 | 3) : undefined;

  let packSize: number | undefined;
  if (input.packSize.trim()) {
    const n = Number(input.packSize.trim());
    if (!Number.isInteger(n) || n < 1 || n > 100) errors.packSize = "Bitte eine ganze Zahl von 1 bis 100.";
    else packSize = n;
  }

  const options: ProductOption[] = [];
  const names = new Set<string>();
  input.options.forEach((o, i) => {
    const name = oneLine(o.name);
    const values = parseValues(o.values);
    if (!name && !values.length) return;
    if (!name) errors[`option.${i}.name`] = "Bitte einen Namen eingeben, z. B. „Größe“.";
    else if (name.length > LIMITS.optionName) errors[`option.${i}.name`] = `Bitte höchstens ${LIMITS.optionName} Zeichen.`;
    else if (names.has(name.toLowerCase())) errors[`option.${i}.name`] = "Diesen Namen gibt es schon.";
    if (!values.length) errors[`option.${i}.values`] = "Bitte mindestens einen Wert eingeben, z. B. „S, M, L“.";
    else if (values.length > LIMITS.values) errors[`option.${i}.values`] = `Bitte höchstens ${LIMITS.values} Werte.`;
    else if (values.some((v) => v.length > LIMITS.value)) errors[`option.${i}.values`] = `Jeder Wert höchstens ${LIMITS.value} Zeichen.`;
    names.add(name.toLowerCase());
    options.push({ name, values });
  });
  if (options.length > LIMITS.options) errors.options = `Bitte höchstens ${LIMITS.options} Auswahl-Möglichkeiten.`;
  const count = options.reduce((n, o) => n * Math.max(1, o.values.length), 1);
  if (count > LIMITS.variants) errors.options = `Das wären ${count} Varianten – bitte höchstens ${LIMITS.variants}.`;

  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      title,
      subtitle: subtitle || undefined,
      descriptionHtml: textToHtml(description),
      images,
      collections,
      highlights: highlights.length ? highlights : undefined,
      capacity: capacity || undefined,
      absorbency,
      packSize,
      options,
    },
    errors,
  };
}

/** Anzahl Varianten für eine Eingabe (für den Hinweis im Formular) */
export function variantCount(options: OptionInput[]) {
  return options.reduce((n, o) => (oneLine(o.name) || parseValues(o.values).length ? n * Math.max(1, parseValues(o.values).length) : n), 1);
}
