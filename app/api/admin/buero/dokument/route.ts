import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { parseDocRequest, runDocument } from "@/lib/office/documents-service";
import { OfficeAccessError } from "@/lib/office/roles";

/**
 * PDF-Dokumente der Büroverwaltung (Lieferscheine, Versandliste, Artikel-Sammelliste, Tagesbericht).
 * Nur angemeldet mit Berechtigung „Dokumente“ (serverseitig geprüft), nur per Formular von der eigenen Seite (POST + gleiche Herkunft).
 * Die Datei wird direkt ausgeliefert – nie öffentlich gespeichert, nie zwischengespeichert.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store, private, max-age=0" };

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

/** Zurück zur Seite, von der das Formular kam (nur Seiten der Büroverwaltung), mit Fehlermeldung */
function back(request: Request, target: string, error: string) {
  const path = /^\/admin\/buero(\/[A-Za-z0-9_-]+){0,3}$/.test(target) ? target : "/admin/buero";
  const url = new URL(path, request.url);
  url.searchParams.set("fehler", error.slice(0, 300));
  return Response.redirect(url, 303);
}

export async function POST(request: Request) {
  const origin = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>>;
  try {
    who = await assertOffice("office.documents");
  } catch (e) {
    const status = e instanceof OfficeAccessError ? e.status : 401;
    if (status === 403) await logSecurityEvent("office_denied", { ...origin, detail: "PDF-Dokument ohne Berechtigung" });
    return Response.json({ error: status === 403 ? "Keine Berechtigung für Dokumente." : "Bitte anmelden." }, { status, headers: NO_STORE });
  }
  if (!sameOrigin(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: NO_STORE });

  const form = await request.formData();
  const p: Record<string, string | string[]> = {};
  let count = 0;
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" || k.length > 30 || ++count > 600) continue;
    const value = v.slice(0, 300);
    if (k === "auswahl") p.auswahl = [...((p.auswahl as string[] | undefined) ?? []), value];
    else p[k] = value;
  }
  const target = typeof p.zurueck === "string" ? p.zurueck : "/admin/buero";
  const parsed = parseDocRequest(p, Date.now());
  if (!parsed.ok) return back(request, target, parsed.error);

  let r: Awaited<ReturnType<typeof runDocument>>;
  try {
    r = await runDocument(parsed.req, who, origin);
  } catch {
    console.error("[office] Dokument fehlgeschlagen");
    return back(request, target, "Das Dokument konnte nicht erstellt werden. Bitte später erneut versuchen.");
  }
  if (!r.ok) return back(request, target, r.error);
  return new Response(new Uint8Array(r.file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${r.inline ? "inline" : "attachment"}; filename="${r.filename}"`,
      "Content-Length": String(r.file.length),
      ...NO_STORE,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function GET() {
  return Response.json({ error: "Bitte das Dokument über das Dashboard erstellen." }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
