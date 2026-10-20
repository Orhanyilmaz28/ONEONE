import { NextResponse } from "next/server";
import { handleCron } from "@/lib/backup/cron";
import { defaultDeps } from "@/lib/backup/service";

/** Tägliche Datensicherung – Aufruf durch Vercel Cron (siehe docs/DATENSICHERUNG.md). Geschützt durch CRON_SECRET. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { status, body } = await handleCron(request.headers.get("authorization"), defaultDeps);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
