// Server-Helfer: alle Bilder und Videos des Shops für die Übersicht „KI-Kennzeichnung“
import { type AiMediaType, type AiOverrides, SITE_MEDIA, aiMediaType, mediaKey } from "@/lib/ai-media";
import { catalog, getProducts } from "@/lib/catalog";

export type MediaItem = {
  key: string;
  kind: "image" | "video";
  /** Vorschaubild (bei Videos das Standbild) */
  preview: string;
  /** Video-Datei (für die Vorschau beim Darüberfahren) */
  video?: string;
  title: string;
  usage: string[];
  /** Aktueller Stand (wie im Shop angezeigt) */
  type: AiMediaType;
  /** Stammt aus einem Produkt → Hinweis, dass es auch im Produkt-Editor einstellbar ist */
  product?: { handle: string; title: string };
};

export async function collectMedia(overrides: AiOverrides): Promise<MediaItem[]> {
  const products = await getProducts({ includeHidden: true });
  const items = new Map<string, MediaItem>();
  const add = (src: string, data: Omit<MediaItem, "key" | "usage" | "type" | "preview"> & { preview?: string; usage: string; explicit?: AiMediaType }) => {
    const key = mediaKey(src);
    const existing = items.get(key);
    if (existing) {
      if (!existing.usage.includes(data.usage)) existing.usage.push(data.usage);
      return;
    }
    items.set(key, {
      key,
      kind: data.kind,
      preview: data.preview ?? src,
      video: data.video,
      title: data.title,
      usage: [data.usage],
      type: aiMediaType(src, data.explicit, overrides),
      product: data.product,
    });
  };

  for (const m of SITE_MEDIA) {
    add(m.src, { kind: m.kind, preview: m.poster, video: m.kind === "video" ? m.src : undefined, title: m.title, usage: m.usage });
  }
  for (const p of products) {
    for (const v of p.videos ?? []) {
      add(v.src, { kind: "video", preview: v.poster, video: v.src, title: `Video${v.title ? ` „${v.title}“` : ""}`, usage: `Produkt: ${p.title}`, explicit: v.type, product: { handle: p.handle, title: p.title } });
    }
    p.images.forEach((img, i) => {
      add(img.src, { kind: "image", title: `${p.title} · Bild ${i + 1}`, usage: `Produkt: ${p.title}${i === 0 ? " (Hauptbild)" : ""}`, explicit: img.type, product: { handle: p.handle, title: p.title } });
    });
  }
  for (const c of catalog.collections) {
    if (c.image) add(c.image, { kind: "image", title: `Kollektion ${c.title}`, usage: `Kollektion: ${c.title}` });
  }
  // Videos zuerst, dann Fotos – jeweils in der gefundenen Reihenfolge
  return [...items.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "video" ? -1 : 1));
}
