import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { keyToSlug } from "@/lib/office/model";
import { OfficeAccessError } from "@/lib/office/roles";
import { parseActionForm, parseBulkForm, runBulk, runSingle } from "@/lib/office/workflow-service";

/**
 * Bearbeitungsschritte der Büroverwaltung (Prüfen, Freigeben, Zurückstellen, Logistik-Weitergabe dokumentieren, Versand,
 * Abschließen, Markierung, Zuständigkeit, Korrektur) – einzeln oder als Sammelaktion.
 * Nur angemeldet mit Recht „Bearbeiten“ (serverseitig), nur per Formular von der eigenen Seite (POST + gleiche Herkunft).
 * Antwortet immer mit einer Weiterleitung zurück auf die Seite (Ergebnis bzw. Fehler in der Adresse, ohne Kundendaten).
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

function to(request: Request, path: string, params: Record<string, string>) {
  const url = new URL(path, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v.slice(0, 600));
  return new Response(null, { status: 303, headers: { Location: url.toString(), ...NO_STORE } });
}

export async function POST(request: Request) {
  const origin = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>>;
  try {
    who = await assertOffice("office.workflow");
  } catch (e) {
    const status = e instanceof OfficeAccessError ? e.status : 401;
    if (status === 403) await logSecurityEvent("office_denied", { ...origin, detail: "Bürostatus ohne Berechtigung" });
    return Response.json({ error: status === 403 ? "Keine Berechtigung zum Bearbeiten." : "Bitte anmelden." }, { status, headers: NO_STORE });
  }
  if (!sameOrigin(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: NO_STORE });

  const form = await request.formData();
  const p: Record<string, string | string[]> = {};
  let count = 0;
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" || k.length > 30 || ++count > 200) continue;
    const value = v.slice(0, 400);
    if (k === "eintrag") p.eintrag = [...((p.eintrag as string[] | undefined) ?? []), value];
    else p[k] = value;
  }

  if (p.sammel === "1") {
    const b = parseBulkForm(p);
    if (!b.ok) return to(request, "/admin/buero/sammelaktion", { fehler: b.error });
    const r = await runBulk(b, who, origin);
    if (!r.ok) return to(request, "/admin/buero/sammelaktion", { fehler: r.error });
    return to(request, "/admin/buero/sammelaktion", { ergebnis: r.id });
  }

  const parsed = parseActionForm(p);
  if (!parsed.ok) return to(request, "/admin/buero/bestellungen", { fehler: parsed.error });
  if (parsed.input.action === "korrektur" && who.role !== "admin") {
    await logSecurityEvent("office_denied", { ...origin, detail: "Statuskorrektur ohne Berechtigung" });
    return Response.json({ error: "Nur Administrator:innen dürfen den Status korrigieren." }, { status: 403, headers: NO_STORE });
  }
  const page = `/admin/buero/bestellungen/${keyToSlug(parsed.key)}`;
  let r: Awaited<ReturnType<typeof runSingle>>;
  try {
    r = await runSingle(parsed, who, origin);
  } catch {
    console.error("[office] Bearbeitungsschritt fehlgeschlagen");
    return to(request, page, { bearbeitung: "Der Schritt konnte nicht ausgeführt werden. Bitte später erneut versuchen." });
  }
  if (r.ok) return to(request, page, { erledigt: r.duplicate ? "doppelt" : parsed.retrySync ? "abgeglichen" : parsed.input.action });
  if (r.code === "forbidden") return Response.json({ error: r.error }, { status: 403, headers: NO_STORE });
  const blockers = "blockers" in r && r.blockers?.length ? ` ${r.blockers.join(" ")}` : "";
  return to(request, page, { bearbeitung: `${r.error}${blockers}`, ...(r.code === "conflict" ? { konflikt: "1" } : {}) });
}

export function GET() {
  return Response.json({ error: "Bitte über das Dashboard bearbeiten." }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
