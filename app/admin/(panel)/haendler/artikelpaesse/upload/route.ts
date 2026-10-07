import { isAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { savePass } from "@/lib/dealer-data";
import { revalidatePath } from "next/cache";

/**
 * Artikelpässe hochladen (PDF, je bis 4 MB – Obergrenze für Uploads auf Vercel).
 * Entweder gezielt für ein Produkt (Feld „key“) oder mehrere Dateien auf einmal: dann entscheidet der Dateiname
 * (z. B. „classic.pdf“, „xtea-peach.pdf“ oder „katalog.pdf“). Route-Handler sind nicht durch das Dashboard-Layout geschützt – daher selbst prüfen.
 */
export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024;

function back(request: Request, params: Record<string, string>) {
  const url = new URL("/admin/haendler/artikelpaesse", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url, 303);
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return new Response("Nicht angemeldet.", { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(request, { error: "Der Upload war zu groß oder ist fehlgeschlagen (höchstens 4 MB insgesamt)." });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return back(request, { error: "Bitte wähle mindestens eine PDF-Datei." });
  const only = String(form.get("key") ?? "");
  const handles = new Set((await getProducts({ includeHidden: true })).map((p) => p.handle));
  handles.add("katalog");

  let ok = 0;
  const problems: string[] = [];
  for (const f of files) {
    const key = only || f.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!handles.has(key)) {
      problems.push(`„${f.name}“ passt zu keinem Produkt (Dateiname = Produktname, z. B. classic.pdf)`);
      continue;
    }
    if (f.size > MAX) {
      problems.push(`„${f.name}“ ist größer als 4 MB`);
      continue;
    }
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.subarray(0, 4).toString("latin1") !== "%PDF") {
      problems.push(`„${f.name}“ ist keine PDF-Datei`);
      continue;
    }
    try {
      await savePass(key, `${key}.pdf`, buf);
      ok++;
    } catch (e) {
      problems.push(`„${f.name}“ konnte nicht gespeichert werden (${e instanceof Error ? e.message : "Fehler"})`);
    }
  }
  revalidatePath("/haendler/portal", "layout");
  return back(request, { ok: String(ok), ...(problems.length ? { error: problems.join(" · ") } : {}) });
}
