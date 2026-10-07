import { createHash } from "node:crypto";
import sharp from "sharp";
import { deleteBinary, putBinary } from "./store";

/**
 * Hochgeladene Produktbilder: werden gedreht (Handy-Fotos), verkleinert, als WebP gespeichert
 * und von allen Zusatzdaten befreit (z. B. GPS-Standort aus Handy-Fotos).
 */

/** Adresse eines hochgeladenen Bildes: /media/<id>.webp */
export const MEDIA_PATH = /^\/media\/([a-f0-9]{24})\.webp$/;
export const MEDIA_ID = /^[a-f0-9]{24}$/;

/** Größte Seitenlänge der gespeicherten Bilder */
const MAX_SIDE = 2000;

export async function saveUpload(input: Buffer): Promise<{ src: string; width: number; height: number }> {
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  const id = createHash("sha256").update(data).digest("hex").slice(0, 24);
  await putBinary(id, data);
  return { src: `/media/${id}.webp`, width: info.width, height: info.height };
}

/** IDs hochgeladener Bilder aus einer Liste von Bildadressen */
export function mediaIds(srcs: string[]) {
  return srcs.flatMap((src) => {
    const m = MEDIA_PATH.exec(src);
    return m ? [m[1]] : [];
  });
}

/** Bilder löschen, die nirgends mehr verwendet werden */
export async function deleteUnused(candidates: string[], stillUsed: string[]) {
  const used = new Set(mediaIds(stillUsed));
  const unused = [...new Set(mediaIds(candidates))].filter((id) => !used.has(id));
  try {
    await deleteBinary(unused);
  } catch (error) {
    // Aufräumen ist nicht wichtig genug, um das Speichern scheitern zu lassen
    console.error("[media] Aufräumen fehlgeschlagen", error);
  }
}
