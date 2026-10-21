import type { ImageResponse } from "next/og";

/*
 * WhatsApp zeigt das große Vorschaubild nur, wenn die Datei kleiner als ca. 300 KB ist.
 * Sonst kommt nur ein kleines, quadratisch abgeschnittenes Bildchen.
 * Darum wandeln wir das Vorschaubild in ein JPEG um (meist unter 120 KB).
 */
export const OG_CONTENT_TYPE = "image/jpeg";

export async function toJpeg(image: ImageResponse): Promise<Response> {
  const png = Buffer.from(await image.arrayBuffer());
  try {
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(png).flatten({ background: "#0b0b12" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: { "Content-Type": OG_CONTENT_TYPE },
    });
  } catch {
    // Notfalls das PNG ausliefern – lieber zu groß als gar kein Bild
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
  }
}
