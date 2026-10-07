"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { ORDER_STATUS_LABEL, type OrderMeta, type OrderStatus, getOrder, setOrderMeta } from "@/lib/orders";
import { sendMail } from "@/lib/mail";
import { shippingNoticeMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";
import { DEFAULT_CARRIER, isCarrier, isStatus, isValidTracking, normalizeTracking } from "./shipping";

export type SaveOrderState = {
  ok?: boolean;
  /** Erfolgsmeldung */
  message?: string;
  /** Allgemeiner Fehler */
  error?: string;
  /** Fehler an einzelnen Feldern */
  fieldErrors?: { tracking?: string; note?: string };
  /** Zeitpunkt der letzten erfolgreichen Speicherung (damit die Meldung neu erscheint) */
  savedAt?: number;
  /** Gespeicherte Werte, damit die Meldung passende Tipps geben kann */
  saved?: { status: OrderStatus; tracking?: string; carrier?: string };
  /** Versand-E-Mail: verschickt (true) oder Fehler beim Versenden (Text) */
  mailed?: true | string;
};

const NOTE_MAX = 2000;

/** Versandstatus, Sendungsnummer und interne Notiz einer Bestellung speichern */
export async function saveOrder(_prev: SaveOrderState, form: FormData): Promise<SaveOrderState> {
  // Server Actions sind öffentlich erreichbar – deshalb immer zuerst die Anmeldung prüfen
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu und melde dich wieder an." };
  }

  const id = String(form.get("id") ?? "");
  const status = form.get("status");
  const carrierRaw = String(form.get("carrier") ?? DEFAULT_CARRIER);
  const tracking = normalizeTracking(String(form.get("tracking") ?? ""));
  const note = String(form.get("note") ?? "").trim();

  if (!/^cs_[A-Za-z0-9_]{4,200}$/.test(id)) return { error: "Ungültige Bestellung." };
  if (!isStatus(status)) return { error: "Bitte wähle einen Status aus." };
  const carrier = isCarrier(carrierRaw) ? carrierRaw : DEFAULT_CARRIER;

  const fieldErrors: SaveOrderState["fieldErrors"] = {};
  if (tracking && !isValidTracking(tracking)) {
    fieldErrors.tracking = "Die Sendungsnummer sieht nicht richtig aus – bitte nur Buchstaben und Ziffern (6 bis 40 Zeichen).";
  }
  if (note.length > NOTE_MAX) fieldErrors.note = `Die Notiz ist zu lang (höchstens ${NOTE_MAX} Zeichen).`;
  if (fieldErrors.tracking || fieldErrors.note) return { error: "Bitte prüfe die markierten Felder.", fieldErrors };

  // Nur echte Bestellungen speichern (verhindert Müll im Datenspeicher)
  const order = await getOrder(id);
  if (!order) return { error: "Diese Bestellung wurde nicht gefunden." };

  // Versanddatum: beim ersten „Versendet“ merken, bei „Offen“ wieder entfernen
  let shippedAt = order.meta.shippedAt;
  if (status === "versendet" && !shippedAt) shippedAt = new Date().toISOString();
  if (status === "offen") shippedAt = undefined;

  const patch: Partial<OrderMeta> = {
    status,
    tracking: tracking || undefined,
    carrier: tracking ? carrier : undefined,
    note: note || undefined,
    shippedAt,
  };

  try {
    await setOrderMeta(id, patch);
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[bestellungen] Speichern fehlgeschlagen", id, error);
    return { error: "Speichern hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }

  // Versand-E-Mail direkt aus dem Shop (nur wenn angehakt)
  let mailed: SaveOrderState["mailed"];
  if (status === "versendet" && form.get("notify") === "1" && order.customer.email) {
    const m = shippingNoticeMail(order, await getSettings(), tracking || undefined, tracking ? carrier : undefined);
    const res = await sendMail({ to: { email: order.customer.email, name: order.customer.name }, ...m, tag: "versand" });
    if (res.ok) {
      mailed = true;
      await setOrderMeta(id, { shippingMailSentAt: new Date().toISOString() }).catch(() => undefined);
    } else mailed = res.error;
  }

  // Liste, Detailseite, Lieferschein und Übersicht neu laden
  revalidatePath("/admin", "layout");

  const message =
    status === "versendet"
      ? mailed === true
        ? `Gespeichert – als „Versendet“ markiert und die Versand-E-Mail ist an ${order.customer.email} raus.`
        : "Gespeichert – die Bestellung ist jetzt als „Versendet“ markiert."
      : `Gespeichert – Status ist jetzt „${ORDER_STATUS_LABEL[status]}“.`;
  return { ok: true, message, mailed, savedAt: Date.now(), saved: { status, tracking: tracking || undefined, carrier: tracking ? carrier : undefined } };
}
