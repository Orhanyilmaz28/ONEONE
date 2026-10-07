import { isAdmin } from "@/lib/admin-auth";
import { getDealer } from "@/lib/dealer-store";
import { getBinary } from "@/lib/store";

/** Gewerbenachweis eines Händlers ansehen (nur Dashboard). Route-Handler sind nicht durch das Layout geschützt – daher selbst prüfen. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Nicht angemeldet.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const dealer = await getDealer(id);
  if (!dealer?.proof) return new Response("Kein Nachweis hinterlegt.", { status: 404 });
  const data = await getBinary(dealer.proof.id);
  if (!data) return new Response("Datei nicht gefunden.", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": dealer.proof.type,
      "Content-Disposition": `inline; filename="${dealer.proof.name.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
