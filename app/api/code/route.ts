import { findByCode } from "@/lib/influencers";

/** Influencer-Code prüfen (Warenkorb). Liefert nur, ob er gilt und wie viel Rabatt er bringt – keine Daten zum Influencer. */
export const dynamic = "force-dynamic";

// Einfache Bremse gegen Durchprobieren von Codes (je Server-Instanz)
const hits = new Map<string, { n: number; until: number }>();
const LIMIT = 30;
const WINDOW = 10 * 60_000;

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && h.until > now) {
    if (h.n >= LIMIT) return Response.json({ valid: false, error: "Zu viele Versuche – bitte später erneut versuchen." }, { status: 429 });
    h.n++;
  } else {
    hits.set(ip, { n: 1, until: now + WINDOW });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  }
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const inf = await findByCode(code).catch(() => undefined);
  if (!inf?.code) return Response.json({ valid: false });
  return Response.json({ valid: true, code: inf.code, pct: inf.discountPct }, { headers: { "Cache-Control": "no-store" } });
}
