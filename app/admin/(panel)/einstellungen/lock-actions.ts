"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type SiteLock, getSiteLock, hashSitePassword } from "@/lib/site-lock";
import { KEYS, StoreUnavailableError, setJSON } from "@/lib/store";

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
  const current = await getSiteLock();

  if (password && password.length < 6) return { error: "Bitte mindestens 6 Zeichen für das Shop-Passwort." };
  if (password.length > 100) return { error: "Das Passwort ist zu lang." };
  if (enabled && !password && !current.hash) return { error: "Bitte lege ein Passwort fest, bevor du den Schutz einschaltest." };

  const next: SiteLock = {
    enabled,
    hash: password ? await hashSitePassword(password) : current.hash,
    message: message || undefined,
    updatedAt: new Date().toISOString(),
  };
  try {
    await setJSON(KEYS.siteLock, next);
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
      ? password && current.hash
        ? "Gespeichert – neues Passwort gilt in wenigen Sekunden. Wer das alte kannte, muss das neue eingeben."
        : "Gespeichert – der Shop ist in wenigen Sekunden nur noch mit Passwort zu sehen."
      : "Gespeichert – der Shop ist in wenigen Sekunden wieder für alle offen.",
  };
}
