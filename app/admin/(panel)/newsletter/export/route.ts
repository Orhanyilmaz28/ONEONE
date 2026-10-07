import { isAdmin } from "@/lib/admin-auth";
import { getSubscribers, subscribersToCsv } from "@/lib/newsletter-store";

/**
 * CSV-Download aller Newsletter-Anmeldungen (für Excel oder zum Import in Brevo).
 * Wichtig: Route-Handler sind NICHT durch das Dashboard-Layout geschützt – daher hier selbst prüfen.
 */
export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" });

export async function GET() {
  if (!(await isAdmin())) {
    return new Response("Nicht angemeldet. Bitte melde dich unter /admin/login an.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const csv = subscribersToCsv(await getSubscribers());
  const filename = `newsletter-${dayFmt.format(new Date())}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
