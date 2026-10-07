import { DEFAULT_SETTINGS, type Settings, isReturnCostPayer } from "./settings-defaults";
import { KEYS, getJSON } from "./store";

export * from "./settings-defaults";

/** Einstellungen aus dem Speicher, mit Standardwerten aufgefüllt */
export async function getSettings(): Promise<Settings> {
  const stored = await getJSON<Partial<Settings>>(KEYS.settings, {});
  const paidBy = stored.returns?.paidBy;
  return {
    company: { ...DEFAULT_SETTINGS.company, ...stored.company },
    shipping: { ...DEFAULT_SETTINGS.shipping, ...stored.shipping },
    // Nur bekannte Werte übernehmen – ein kaputter Eintrag darf die Widerrufsbelehrung nie leer lassen
    returns: { paidBy: isReturnCostPayer(paidBy) ? paidBy : DEFAULT_SETTINGS.returns.paidBy },
    announcement: stored.announcement ?? DEFAULT_SETTINGS.announcement,
  };
}

