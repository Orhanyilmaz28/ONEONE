import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/backup/cron";
import { runScheduled } from "@/lib/office/automation-service";

/**
 * Büroautomatisierung (Phase 3D) – Aufruf durch Vercel Cron. Geschützt durch CRON_SECRET (wie die Datensicherung).
 * Erstellt nur fällige, im Büro eingeschaltete Berichte (standardmäßig keine). Keine Kunden-E-Mails, keine Logistik.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "Nicht berechtigt" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const r = await runScheduled({ now: Date.now() });
    return NextResponse.json({ ok: r.failed === 0, ran: r.ran, failed: r.failed, skipped: r.skipped, digest: r.digest?.status ?? null }, { status: r.failed ? 500 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[office] Automatisierung fehlgeschlagen");
    return NextResponse.json({ ok: false, error: "Datenspeicher nicht erreichbar" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
