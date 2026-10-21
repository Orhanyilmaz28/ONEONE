import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

/** Früher eigener Reiter „Bilder, Texte & Varianten“ – jetzt steht alles auf einer Seite */
export default async function ProductContentPage({ params }: { params: Promise<{ handle: string }> }) {
  await requireAdmin();
  const { handle } = await params;
  redirect(`/admin/produkte/${encodeURIComponent(handle)}#bilder`);
}
