import { isAdmin } from "@/lib/admin-auth";
import { saveUpload } from "@/lib/media";
import { StoreUnavailableError } from "@/lib/store";

/** Größte erlaubte Datei (Vercel nimmt höchstens 4,5 MB pro Anfrage an – der Browser verkleinert vorher) */
const MAX_BYTES = 4_400_000;

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** Bild hochladen (nur angemeldet). Antwort: { src, width, height } */
export async function POST(request: Request) {
  if (!(await isAdmin())) return error("Du bist nicht mehr angemeldet. Bitte lade die Seite neu.", 401);
  // Nur Anfragen von der eigenen Seite annehmen
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && new URL(origin).host !== host) return error("Ungültige Anfrage.", 403);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 10_000) return error("Das Bild ist zu groß (höchstens 4 MB).", 413);

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return error("Das Bild konnte nicht gelesen werden.");
  }
  if (!(file instanceof File) || file.size === 0) return error("Bitte ein Bild auswählen.");
  if (file.size > MAX_BYTES) return error("Das Bild ist zu groß (höchstens 4 MB).", 413);

  try {
    const saved = await saveUpload(Buffer.from(await file.arrayBuffer()));
    return Response.json(saved);
  } catch (e) {
    if (e instanceof StoreUnavailableError) return error(e.message, 503);
    console.error("[media] Upload fehlgeschlagen", e);
    return error("Das Bild konnte nicht verarbeitet werden. Bitte als JPG oder PNG versuchen.", 422);
  }
}
