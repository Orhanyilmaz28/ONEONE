"use server";

import { revalidatePath } from "next/cache";
import { getCurrentDealer } from "@/lib/dealer-auth";
import { markRead } from "@/lib/dealer-messages";

/** Nachrichten als gelesen markieren (nur eigene bzw. Rundschreiben) */
export async function markReadAction(ids: string[]): Promise<void> {
  const dealer = await getCurrentDealer();
  if (!dealer || !Array.isArray(ids)) return;
  const clean = ids.filter((id) => typeof id === "string" && /^[a-f0-9]{16}$/.test(id)).slice(0, 200);
  if (!clean.length) return;
  await markRead(dealer.id, clean).catch(() => undefined);
  revalidatePath("/haendler/portal", "layout");
}
