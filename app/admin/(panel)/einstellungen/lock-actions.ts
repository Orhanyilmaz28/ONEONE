"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type SiteLock, hashSitePassword } from "@/lib/site-lock";
import { KEYS, StoreUnavailableError, getJSONStrict, updateJSON } from "@/lib/store";

export type LockState = { ok?: boolean; message?: string; error?: string; at?: number };

/** Passwortschutz für den Shop speichern */
export async function saveSiteLock(_prev: LockState, form: FormData): Promise<LockState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu." };
  }
  const enabled = form.get("enabled") === "1";
  const password = String(form.get("password") ?? "").trim();
  const message = String(form.get("message") ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
  if (password && password.length < 6) return { error: "Bitte mindestens 6 Zeichen für das Shop-Passwort." };
  if (password.length > 100) return { error: "Das Passwort ist zu lang." };

  // Streng lesen: bei einem Lesefehler abbrechen, statt das gespeicherte Passwort durch „kein Passwort“ zu ersetzen
  let hadHash = false;
  try {
    const stored = await getJSONStrict<Partial<SiteLock>>(KEYS.siteLock, {});
    hadHash = typeof stored.hash === "string";
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    return { error: "Die gespeicherten Einstellungen konnten gerade nicht gelesen werden. Bitte versuche es gleich noch einmal." };
  }
  if (enabled && !password && !hadHash) return { error: "Bitte lege ein Passwort fest, bevor du den Schutz einschaltest." };

  const newHash = password ? await hashSitePassword(password) : undefined;
  try {
    // Atomar ändern: das vorhandene Passwort bleibt erhalten, wenn kein neues eingegeben wurde
    await updateJSON<Partial<SiteLock>>(KEYS.siteLock, {}, (current): SiteLock => {
      const hash = newHash ?? (typeof current.hash === "string" ? current.hash : undefined);
      return { enabled: enabled && Boolean(hash), hash, message: message || undefined, updatedAt: new Date().toISOString() };
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    return { error: "Speichern hat nicht geklappt. Bitte versuche es noch einmal." };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/zugang");
  return {
    ok: true,
    at: Date.now(),
    message: enabled
      ? password && hadHash
        ? "Gespeichert – neues Passwort gilt in wenigen Sekunden. Wer das alte kannte, muss das neue eingeben."
        : "Gespeichert – der Shop ist in wenigen Sekunden nur noch mit Passwort zu sehen."
      : "Gespeichert – der Shop ist in wenigen Sekunden wieder für alle offen.",
  };
}
