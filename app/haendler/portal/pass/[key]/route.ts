import { getCurrentDealer } from "@/lib/dealer-auth";
import { readPass } from "@/lib/dealer-data";

/** Artikelpass (PDF) – nur für angemeldete, freigegebene Händler */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getCurrentDealer())) return new Response("Bitte melde dich im Händlerbereich an.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { key } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(key)) return new Response("Nicht gefunden", { status: 404 });
  const pass = await readPass(key);
  if (!pass) return new Response("Dieser Artikelpass ist noch nicht hochgeladen.", { status: 404 });
  return new Response(new Uint8Array(pass.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pass.name.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
