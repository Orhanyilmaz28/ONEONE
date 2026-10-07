"use server";

import { revalidatePath } from "next/cache";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { deleteReview, type ReviewStatus, type StoredReview, setReviewStatus, setReviewVerified } from "@/lib/review-store";
import { StoreUnavailableError } from "@/lib/store";

export type ReviewActionResult = { ok: true; message: string } | { ok: false; error: string };

const NOT_LOGGED_IN: ReviewActionResult = { ok: false, error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu und melde dich wieder an." };
const NOT_FOUND: ReviewActionResult = { ok: false, error: "Diese Bewertung gibt es nicht mehr – vielleicht wurde sie gerade gelöscht. Lade die Seite neu." };

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function isStatus(value: unknown): value is ReviewStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

/** Server Actions sind öffentlich erreichbar – deshalb immer zuerst die Anmeldung prüfen */
async function loggedIn() {
  try {
    await assertAdmin();
    return true;
  } catch {
    return false;
  }
}

function failed(error: unknown, what: string): ReviewActionResult {
  if (error instanceof StoreUnavailableError) return { ok: false, error: error.message };
  console.error(`[bewertungen] ${what} fehlgeschlagen`, error);
  return { ok: false, error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
}

/**
 * Seiten neu laden: den Shop nur, wenn die Bewertung dort sichtbar ist oder war,
 * sonst reicht das Dashboard.
 */
function refresh(touchesShop: boolean) {
  if (touchesShop) revalidateShop();
  revalidatePath("/admin", "layout");
}

const STATUS_MESSAGE: Record<ReviewStatus, string> = {
  approved: "Veröffentlicht – die Bewertung ist jetzt im Shop zu sehen.",
  rejected: "Abgelehnt – die Bewertung wird im Shop nicht angezeigt.",
  pending: "Zurück unter „Neu“ – die Bewertung ist im Shop nicht zu sehen.",
};

/** Veröffentlichen, ablehnen oder zurück auf „Neu“ setzen */
export async function setReviewStatusAction(id: string, status: ReviewStatus): Promise<ReviewActionResult> {
  if (!(await loggedIn())) return NOT_LOGGED_IN;
  if (!validId(id) || !isStatus(status)) return { ok: false, error: "Ungültige Anfrage." };
  let changed: Awaited<ReturnType<typeof setReviewStatus>>;
  try {
    changed = await setReviewStatus(id, status);
  } catch (error) {
    return failed(error, "Status ändern");
  }
  if (!changed) return NOT_FOUND;
  refresh(status === "approved" || changed.before.status === "approved");
  return { ok: true, message: STATUS_MESSAGE[status] };
}

/** „Kauf geprüft“ setzen – im Shop steht dann „Verifizierter Kauf“ */
export async function setReviewVerifiedAction(id: string, verified: boolean): Promise<ReviewActionResult> {
  if (!(await loggedIn())) return NOT_LOGGED_IN;
  if (!validId(id) || typeof verified !== "boolean") return { ok: false, error: "Ungültige Anfrage." };
  let changed: Awaited<ReturnType<typeof setReviewVerified>>;
  try {
    changed = await setReviewVerified(id, verified);
  } catch (error) {
    return failed(error, "Kauf-Prüfung speichern");
  }
  if (!changed) return NOT_FOUND;
  const updated = changed.after;
  refresh(updated.status === "approved");
  return {
    ok: true,
    message: verified
      ? updated.status === "approved"
        ? "Gespeichert – im Shop steht jetzt „Verifizierter Kauf“."
        : "Gespeichert – nach dem Veröffentlichen steht im Shop „Verifizierter Kauf“."
      : "Gespeichert – „Kauf geprüft“ ist entfernt.",
  };
}

/** Bewertung endgültig löschen */
export async function deleteReviewAction(id: string): Promise<ReviewActionResult> {
  if (!(await loggedIn())) return NOT_LOGGED_IN;
  if (!validId(id)) return { ok: false, error: "Ungültige Anfrage." };
  let removed: StoredReview | undefined;
  try {
    removed = await deleteReview(id);
  } catch (error) {
    return failed(error, "Löschen");
  }
  if (!removed) return NOT_FOUND;
  refresh(removed.status === "approved");
  return { ok: true, message: removed.status === "approved" ? "Gelöscht – die Bewertung ist aus dem Shop entfernt." : "Die Bewertung wurde gelöscht." };
}
