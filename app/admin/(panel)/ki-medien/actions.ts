"use server";

import { revalidatePath } from "next/cache";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { type AiMediaType, isAiMediaType } from "@/lib/ai-media";
import { getAiOverrides, setAiOverride } from "@/lib/ai-media-store";
import { StoreUnavailableError } from "@/lib/store";
import { collectMedia } from "./data";

/** Ein Medium als echt / KI-generiert / KI-bearbeitet markieren */
export async function setMediaType(key: string, type: AiMediaType): Promise<{ ok: true } | { error: string }> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu." };
  }
  if (!isAiMediaType(type) || typeof key !== "string") return { error: "Ungültige Auswahl." };
  // Nur Medien, die es im Shop wirklich gibt
  const known = (await collectMedia(await getAiOverrides())).some((m) => m.key === key);
  if (!known) return { error: "Dieses Medium gibt es nicht (mehr). Bitte lade die Seite neu." };
  try {
    await setAiOverride(key, type);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[ki-medien] Speichern fehlgeschlagen", error);
    return { error: "Speichern hat nicht geklappt. Bitte versuche es noch einmal." };
  }
  revalidateShop();
  revalidatePath("/admin", "layout");
  return { ok: true };
}
