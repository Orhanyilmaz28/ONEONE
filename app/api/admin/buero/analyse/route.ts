import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { logActivity } from "@/lib/office/activity";
import { analyticsPdf, analyticsSheets } from "@/lib/office/analytics-export";
import { loadAnalytics, parseAnalyticsRequest } from "@/lib/office/analytics-service";
import { companyInfo } from "@/lib/office/documents-service";
import { filterSummaryForLog } from "@/lib/office/filters";
import { logoImage } from "@/lib/office/logo";
import { OfficeAccessError, principalLabel } from "@/lib/office/roles";
import { buildXlsx } from "@/lib/office/xlsx";

/**
 * Export der Verkaufsanalysen (Excel oder PDF). Nur angemeldet mit Recht „Analysen exportieren“, nur per Formular von
 * der eigenen Seite (POST + gleiche Herkunft), begrenzt und protokolliert. Unvollständige Daten werden nicht exportiert.
 * Die Datei wird direkt ausgeliefert – nie gespeichert, nie zwischengespeichert.
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

export async function POST(request: Request) {
  const origin = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>>;
  try {
    who = await assertOffice("office.analytics.export");
  } catch (e) {
    const status = e instanceof OfficeAccessError ? e.status : 401;
    if (status === 403) await logSecurityEvent("office_denied", { ...origin, detail: "Analyse-Export ohne Berechtigung" });
    return Response.json({ error: status === 403 ? "Keine Berechtigung für Exporte." : "Bitte anmelden." }, { status, headers: NO_STORE });
  }
  if (!sameOrigin(request)) return Response.json({ error: "Ungültige Anfrage." }, { status: 403, headers: NO_STORE });
  const form = await request.formData();
  const p: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && k.length < 30) p[k] = v.slice(0, 200);
  const params = new URLSearchParams(p);
  params.delete("format");
  const back = (error: string) => {
    params.set("fehler", error);
    return Response.redirect(new URL(`/admin/buero/analysen?${params.toString()}`, request.url), 303);
  };
  if (!(await hitLimit("officeAnalytics", origin.ip)).ok) return back("Zu viele Exporte in kurzer Zeit. Bitte später erneut versuchen.");
  const format = p.format === "pdf" ? "pdf" : "xlsx";
  const now = Date.now();
  const parsed = parseAnalyticsRequest(p, now);
  if (!parsed.ok) return back(parsed.error);
  const base = { kind: "analyse" as const, mode: format, range: parsed.req.range.label, preset: parsed.req.preset, filters: `${filterSummaryForLog(parsed.req.filters)}${parsed.req.code ? ` · Code ${parsed.req.code}` : ""}`, positions: 0, refs: [] };
  let a: Awaited<ReturnType<typeof loadAnalytics>>;
  try {
    a = await loadAnalytics(parsed.req, now);
  } catch {
    await logActivity(who, { ...base, orders: 0, result: "fehler", error: "Daten nicht ladbar" }, now);
    return back("Die Analyse konnte nicht geladen werden. Bitte später erneut versuchen.");
  }
  if (!a.complete) {
    await logActivity(who, { ...base, orders: 0, result: "fehler", error: a.errors.join(" ") }, now);
    return back(`Nicht exportiert, weil die Daten unvollständig sind: ${a.errors.join(" ")}`);
  }
  const meta = { createdBy: principalLabel(who), now };
  let file: Buffer;
  try {
    file = format === "pdf" ? analyticsPdf(a, await companyInfo(), await logoImage(), meta) : buildXlsx(analyticsSheets(a, meta), { title: "EXSTASE Verkaufsanalyse", created: new Date(now) });
  } catch {
    await logActivity(who, { ...base, orders: a.orderCount, result: "fehler", error: "Datei konnte nicht erstellt werden" }, now);
    return back("Die Datei konnte nicht erstellt werden.");
  }
  await logActivity(who, { ...base, orders: a.orderCount, result: "ok" }, now);
  await logSecurityEvent("office_analytics", { ...origin, detail: `${principalLabel(who)} · ${format} · ${a.req.range.label}` });
  const stamp = new Date(now).toISOString().slice(0, 10);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="exstase-verkaufsanalyse-${stamp}.${format}"`,
      "Content-Length": String(file.length),
      ...NO_STORE,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function GET() {
  return Response.json({ error: "Bitte den Export über das Dashboard starten." }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}
