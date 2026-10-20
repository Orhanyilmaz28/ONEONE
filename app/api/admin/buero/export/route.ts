import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { OfficeAccessError } from "@/lib/office/roles";
import { parseExportRequest, runExport } from "@/lib/office/service";

/**
 * Excel-Download der Büroverwaltung. Nur angemeldet und mit Berechtigung „Export“ (serverseitig geprüft),
 * nur per Formular von der eigenen Seite (POST + gleiche Herkunft). Die Datei wird direkt ausgeliefert –
 * nie öffentlich gespeichert, nie zwischengespeichert.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const back = (request: Request, params: URLSearchParams, error: string) => {
  params.set("fehler", error);
  params.set("vorschau", "1");
  return Response.redirect(new URL(`/admin/buero/export?${params.toString()}`, request.url), 303);
};

export async function POST(request: Request) {
  const origin = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>>;
  try {
    who = await assertOffice("office.export");
  } catch (e) {
    const status = e instanceof OfficeAccessError ? e.status : 401;
    if (status === 403) await logSecurityEvent("office_denied", { ...origin, detail: "Excel-Export ohne Berechtigung" });
    return Response.json({ error: status === 403 ? "Keine Berechtigung für Exporte." : "Bitte anmelden." }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (!sameOrigin(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const form = await request.formData();
  const p: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k.length < 30) p[k] = v.slice(0, 200);
  const params = new URLSearchParams(p);
  const parsed = parseExportRequest(p, Date.now());
  if (!parsed.ok) return back(request, params, parsed.error);

  let r: Awaited<ReturnType<typeof runExport>>;
  try {
    r = await runExport(parsed.req, who, origin);
  } catch {
    console.error("[office] Export fehlgeschlagen");
    return back(request, params, "Der Export konnte nicht erstellt werden. Bitte später erneut versuchen.");
  }
  if (!r.ok) return back(request, params, r.error);
  return new Response(new Uint8Array(r.file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${r.filename}"`,
      "Content-Length": String(r.file.length),
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function GET() {
  return Response.json({ error: "Bitte den Export über das Dashboard starten." }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
