/**
 * Kennzeichnung von KI-Medien (Bilder & Videos).
 *
 * So wird ein Medium als KI markiert – zwei Wege, beide gleichwertig:
 * 1. Direkt am Medium: in data/products.json bzw. im Dashboard bei einem Produktbild/-video `type: "ai-generated"` oder `"ai-edited"`.
 * 2. Zentral in AI_MEDIA_FILES unten – gilt dann überall, wo die Datei im Shop vorkommt (Startseite, Produktseite, Karten …).
 *
 * Ohne Angabe gilt ein Medium als Original (echtes Foto/Video) und bekommt KEINE Kennzeichnung.
 * Darf auch im Browser geladen werden (keine Server-Abhängigkeiten).
 */

export type AiMediaType = "original" | "ai-generated" | "ai-edited";

export const AI_MEDIA_TYPES: AiMediaType[] = ["original", "ai-generated", "ai-edited"];

export const AI_MEDIA_LABEL: Record<Exclude<AiMediaType, "original">, string> = {
  "ai-generated": "KI-generierte Darstellung",
  "ai-edited": "KI-bearbeitete Darstellung",
};

/**
 * Zentrale Liste der KI-Medien. Schlüssel = Pfad ohne Dateiendung, z. B. "/video/alltag" –
 * das erfasst automatisch alltag.mp4, alltag.webm und das Vorschaubild alltag-poster.webp.
 * Echte Produktfotos hier NICHT eintragen.
 */
export const AI_MEDIA_FILES: Record<string, AiMediaType> = {
  // "/video/alltag": "ai-generated",
  // "/bilder/lifestyle": "ai-edited",
};

export function isAiMediaType(value: unknown): value is AiMediaType {
  return value === "original" || value === "ai-generated" || value === "ai-edited";
}

/** Standbilder, die aus einem Video stammen – sie folgen der Kennzeichnung des Videos */
export const MEDIA_ALIAS: Record<string, string> = {};

/** Einheitlicher Schlüssel eines Mediums: "/video/frau-poster.webp?x=1" → "/video/frau" */
export function mediaKey(src: string) {
  const key = src
    .replace(/[?#].*$/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/-poster$/, "");
  return MEDIA_ALIAS[key] ?? key;
}

/** Im Dashboard („KI-Kennzeichnung“) gewählte Einstellungen: Schlüssel → Art (auch „original“, um etwas zurückzunehmen) */
export type AiOverrides = Record<string, AiMediaType>;

/**
 * Art eines Mediums. Reihenfolge: Auswahl im Dashboard → Angabe am Medium (Produktdaten) → zentrale Liste → „original“.
 */
export function aiMediaType(src: string | undefined, explicit?: AiMediaType | null, overrides?: AiOverrides): AiMediaType {
  const key = src ? mediaKey(src) : "";
  if (key && overrides && isAiMediaType(overrides[key])) return overrides[key];
  if (isAiMediaType(explicit)) return explicit;
  if (!key) return "original";
  return AI_MEDIA_FILES[key] ?? "original";
}

/**
 * Medien, die fest im Shop eingebaut sind (nicht an einem Produkt hängen) – für die Übersicht im Dashboard.
 * Produktbilder und -videos kommen automatisch dazu.
 */
export const SITE_MEDIA: { src: string; kind: "image" | "video"; poster?: string; title: string; usage: string }[] = [];

export const isAi = (type: AiMediaType) => type !== "original";
