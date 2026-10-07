"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { removeSubscriber } from "@/lib/newsletter-store";
import { StoreUnavailableError } from "@/lib/store";

export type NewsletterActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Eine Adresse aus der Newsletter-Liste löschen (z. B. wenn jemand um Löschung bittet) */
export async function deleteSubscriberAction(email: string): Promise<NewsletterActionResult> {
  // Server Actions sind öffentlich erreichbar – deshalb immer zuerst die Anmeldung prüfen
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu und melde dich wieder an." };
  }
  // Gespeicherte Adressen sind immer klein geschrieben; hier nur grob prüfen, damit auch alte Einträge löschbar bleiben
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (address.length < 3 || address.length > 254 || !address.includes("@")) return { ok: false, error: "Ungültige E-Mail-Adresse." };

  let removed = false;
  try {
    removed = await removeSubscriber(address);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { ok: false, error: error.message };
    console.error("[newsletter] Löschen fehlgeschlagen", error);
    return { ok: false, error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }
  // Übersicht (Zähler) und Liste neu laden – der Shop selbst ist nicht betroffen
  revalidatePath("/admin", "layout");
  if (!removed) return { ok: false, error: "Diese Adresse ist nicht (mehr) eingetragen. Lade die Seite neu." };
  return { ok: true, message: `${address} wurde aus der Liste gelöscht.` };
}
