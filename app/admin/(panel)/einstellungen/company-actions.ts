"use server";

import { revalidatePath } from "next/cache";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { DEFAULT_SETTINGS, type Settings, companyDiff } from "@/lib/settings-defaults";
import { KEYS, StoreUnavailableError, updateJSON } from "@/lib/store";

export type CompanyApplyState = { ok?: boolean; message?: string; error?: string; at?: number };

/**
 * Betreiberangaben (lib/company.ts, Stand 21.10.2026) in die gespeicherten Firmendaten übernehmen.
 * Nur auf ausdrücklichen Klick einer Administratorin/eines Administrators – nie automatisch. Markenname bleibt unverändert.
 * Bereits ausgestellte Rechnungen und Lieferscheine ändern sich dadurch nicht (dort sind die Firmendaten festgeschrieben).
 */
export async function applyOperatorCompany(_prev: CompanyApplyState, form: FormData): Promise<CompanyApplyState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Du bist nicht mehr angemeldet. Bitte lade die Seite neu." };
  }
  if (form.get("bestaetigt") !== "1") return { error: "Bitte bestätige zuerst, dass du die Angaben geprüft hast." };
  let changed: string[] = [];
  try {
    await updateJSON<Partial<Settings>>(KEYS.settings, {}, (current) => {
      const stored = { ...DEFAULT_SETTINGS.company, ...(current.company ?? {}) };
      changed = companyDiff(stored).map((d) => d.key);
      const next = { ...stored };
      for (const k of changed) next[k as keyof Settings["company"]] = DEFAULT_SETTINGS.company[k as keyof Settings["company"]];
      return { ...current, company: next };
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) return { error: error.message };
    return { error: "Speichern hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }
  await logSecurityEvent("company_data_applied", { ...(await requestOrigin()), detail: `Felder: ${changed.join(", ") || "keine"}` });
  revalidateShop();
  revalidatePath("/admin", "layout");
  return { ok: true, at: Date.now(), message: changed.length ? `Übernommen (${changed.length} Angaben). Impressum, Footer und neue Dokumente zeigen jetzt die neuen Firmendaten.` : "Es gab nichts zu übernehmen." };
}
