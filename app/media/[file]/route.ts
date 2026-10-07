import { getBinary } from "@/lib/store";

/** Liefert hochgeladene Produktbilder aus (/media/<id>.webp) */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const match = /^([a-f0-9]{24})\.webp$/.exec((await params).file);
  if (!match) return new Response("Nicht gefunden", { status: 404 });
  let data: Buffer | null = null;
  try {
    data = await getBinary(match[1]);
  } catch (error) {
    console.error("[media] Lesen fehlgeschlagen", error);
    return new Response("Vorübergehend nicht verfügbar", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      // Inhalt ändert sich nie (Adresse = Fingerabdruck) → dauerhaft zwischenspeichern
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
