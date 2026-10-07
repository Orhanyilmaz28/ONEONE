"use server";

import { revalidatePath } from "next/cache";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { type Settings, isReturnCostPayer } from "@/lib/settings-defaults";
import { KEYS, StoreUnavailableError, updateJSON } from "@/lib/store";
import { COMPANY_FIELDS, type CompanyKey, type SettingsInput, checkSettings } from "./validate";

export type SettingsFormState = {
  ok?: boolean;
  /** Erfolgsmeldung */
  message?: string;
  /** Allgemeiner Fehler */
  error?: string;
  /** Fehler an einzelnen Feldern (Feldname → Meldung) */
  fieldErrors?: Record<string, string>;
  /** Zeitpunkt der letzten erfolgreichen Speicherung (damit die Meldung neu erscheint) */
  savedAt?: number;
};

const NOT_LOGGED_IN = "Du bist nicht mehr angemeldet. Bitte lade die Seite neu und melde dich wieder an.";
const INCOMPLETE = "Die Angaben sind unvollständig. Bitte lade die Seite neu und versuche es noch einmal.";
const SAVE_FAILED = "Speichern hat leider nicht geklappt. Bitte versuche es gleich noch einmal.";

/** Textfeld lesen – nur echte, nicht zu lange Texte (sonst `undefined`) */
function text(form: FormData, name: string, max = 500): string | undefined {
  const v = form.get(name);
  return typeof v === "string" && v.length <= max ? v : undefined;
}

/** Checkbox mit verstecktem Rückfallwert („0“) lesen – so erkennen wir „nicht angehakt“ sicher */
function checkbox(form: FormData, name: string): boolean | undefined {
  const values = form.getAll(name);
  if (values.length === 0) return undefined;
  return values.includes("1");
}

/** Firmendaten, Versandkosten, Rücksendekosten und Aktions-Hinweis speichern */
export async function saveSettings(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  // Server Actions sind öffentlich erreichbar – deshalb immer zuerst die Anmeldung prüfen
  try {
    await assertAdmin();
  } catch {
    return { error: NOT_LOGGED_IN };
  }

  // Formular einlesen – fehlt etwas, war die Anfrage nicht vollständig (z. B. alte Seite im Browser)
  const company = {} as Record<CompanyKey, string>;
  for (const field of COMPANY_FIELDS) {
    const v = text(form, `company.${field.key}`);
    if (v === undefined) return { error: INCOMPLETE };
    company[field.key] = v;
  }
  const cost = text(form, "shipping.cost", 40);
  // Betrag nur nötig, wenn der Schalter an ist – sonst darf das Feld fehlen
  const freeFrom = text(form, "shipping.freeFrom", 40) ?? "";
  const express = text(form, "shipping.express", 40) ?? "";
  const freeEnabled = checkbox(form, "shipping.freeEnabled");
  const expressEnabled = checkbox(form, "shipping.expressEnabled");
  const announcement = text(form, "announcement", 1000);
  // Rücksendekosten: Auswahlfeld – fehlt es ganz, war die Seite veraltet; unbekannte Werte meldet checkSettings
  const paidByRaw = text(form, "returns.paidBy", 20);
  if (cost === undefined || freeEnabled === undefined || expressEnabled === undefined || announcement === undefined || paidByRaw === undefined) {
    return { error: INCOMPLETE };
  }
  const paidBy = isReturnCostPayer(paidByRaw) ? paidByRaw : "";

  const input: SettingsInput = { company, shipping: { cost, freeEnabled, freeFrom, expressEnabled, express }, returns: { paidBy }, announcement };
  const { value, errors } = checkSettings(input);
  if (!value) {
    const count = Object.keys(errors).length;
    return {
      error: count === 1 ? "Bitte prüfe das rot markierte Feld." : `Bitte prüfe die ${count} rot markierten Felder.`,
      fieldErrors: errors,
    };
  }

  try {
    // Kompletten Datensatz speichern; unbekannte (künftige) Felder bleiben dabei erhalten
    await updateJSON<Partial<Settings>>(KEYS.settings, {}, (current) => ({ ...current, ...value }));
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    console.error("[einstellungen] Speichern fehlgeschlagen", error);
    return { error: SAVE_FAILED };
  }

  // Impressum, Versandseite, Warenkorb & Co. neu erzeugen – und das Dashboard (Startklar-Check)
  revalidateShop();
  revalidatePath("/admin", "layout");

  return { ok: true, message: "Gespeichert – die Änderungen sind in wenigen Sekunden im Shop zu sehen.", savedAt: Date.now() };
}
