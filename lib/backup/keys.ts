import { KEYS } from "../store";

/**
 * Welche Redis-Schlüssel gehören in die Datensicherung?
 *
 * Grundsatz: lieber zu viel sichern als zu wenig. Ausgeschlossen werden nur Schlüssel, die
 * - temporär sind (Sitzungen, Zähler für Rate-Limits, laufende 2FA-Einrichtung) oder
 * - nach einer Wiederherstellung nicht wieder aktiv werden dürfen (Admin-Sitzungen, 2FA-Geheimnis, Wiederherstellungscodes) oder
 * - zur Datensicherung/Überwachung selbst gehören (Sperre, Protokoll, Testmarker).
 * Unbekannte Schlüssel werden vorsorglich mitgesichert.
 */
export type KeyClass = { include: boolean; category: string; reason?: string };

const LABELS: Record<string, string> = {
  [KEYS.products]: "Produkte & Preise",
  [KEYS.custom]: "Produkte & Preise",
  [KEYS.settings]: "Shop-Einstellungen",
  [KEYS.mail]: "Shop-Einstellungen",
  [KEYS.siteLock]: "Shop-Einstellungen",
  [KEYS.accounts]: "Shop-Einstellungen",
  [KEYS.aiMedia]: "Shop-Einstellungen",
  [KEYS.storageLimit]: "Shop-Einstellungen",
  [KEYS.storageUsage]: "Shop-Einstellungen",
  [KEYS.reviews]: "Bewertungen",
  [KEYS.newsletter]: "Newsletter & Einwilligungen",
  [KEYS.orders]: "Bestellungen & Versand",
  [KEYS.customers]: "Kundenkonten",
  [KEYS.dealers]: "Händlerkonten",
  [KEYS.dealerPrices]: "Händlerpreise & Stufen",
  [KEYS.dealerTiers]: "Händlerpreise & Stufen",
  [KEYS.dealerPasses]: "Händlerpreise & Stufen",
  [KEYS.dealerOrders]: "Händlerbestellungen & Rechnungen",
  [KEYS.dealerInvoiceSettings]: "Händlerbestellungen & Rechnungen",
  [KEYS.dealerMessages]: "Nachrichten an Händler",
  [KEYS.influencers]: "Influencer-Konten",
  [KEYS.commissions]: "Provisionen & Gutschriften",
  [KEYS.influencerStatements]: "Provisionen & Gutschriften",
  [KEYS.officeUsers]: "Büroverwaltung",
  [KEYS.officeExported]: "Büroverwaltung",
  [KEYS.officeDeliveryNotes]: "Büroverwaltung",
};

/** Alle festen Geschäftsdaten-Schlüssel (JSON) – werden immer abgefragt, auch wenn SCAN sie nicht liefert */
export const BUSINESS_KEYS: string[] = Object.values(KEYS);

export const VERSION_PREFIX = "tt:ver:";
export const versionKeyOf = (key: string) => `${VERSION_PREFIX}${key}`;

/** Markierung einer isolierten Testdatenbank (wird nie gesichert und nie in die Produktion geschrieben) */
export const RESTORE_TEST_MARKER = "tt:restore-test:marker";

export function classifyKey(key: string): KeyClass {
  // ── ausgeschlossen: temporär oder sicherheitskritisch ──
  if (key.startsWith("tt:adm:s:") || key === "tt:adm:sessions") return { include: false, category: "Admin-Sitzungen", reason: "temporär; darf nach einer Wiederherstellung nicht wieder gültig werden" };
  if (key.startsWith("tt:adm:rl:")) return { include: false, category: "Rate-Limits", reason: "temporäre Zähler (laufen von selbst ab)" };
  if (key.startsWith("tt:adm:2fa:setup:")) return { include: false, category: "2FA-Einrichtung", reason: "temporär (15 Minuten)" };
  if (key === "tt:adm:2fa" || key === "tt:adm:2fa:last" || key === "tt:adm:2fa:recovery")
    return { include: false, category: "2FA-Geheimnis & Wiederherstellungscodes", reason: "darf nicht reaktiviert werden (verbrauchte Codes würden wieder gültig); nach einer Wiederherstellung 2FA neu einrichten" };
  if (key.startsWith("tt:backup:")) return { include: false, category: "Datensicherung (Betrieb)", reason: "Sperre und Protokoll der Sicherung selbst" };
  if (key.startsWith("tt:monitor:")) return { include: false, category: "Überwachung (Betrieb)", reason: "Fehlerzähler und Meldungen" };
  if (key.startsWith("tt:restore-test:")) return { include: false, category: "Testmarker", reason: "nur in Testdatenbanken" };
  if (key.startsWith("tt:test:")) return { include: false, category: "Testdaten", reason: "nur aus automatischen Tests" };

  // ── gesichert ──
  if (key.startsWith(VERSION_PREFIX)) {
    // Versionszähler folgen ihrem Datensatz: ausgeschlossener Datensatz → Zähler ebenfalls ausgeschlossen
    const base = classifyKey(key.slice(VERSION_PREFIX.length));
    return base.include ? { include: true, category: "Versionszähler (Phase 2A)" } : { include: false, category: base.category, reason: base.reason };
  }
  if (key.startsWith("tt:media:proof-")) return { include: true, category: "Gewerbenachweise" };
  if (key.startsWith("tt:media:pass-")) return { include: true, category: "Artikelpässe (Uploads)" };
  if (key.startsWith("tt:media:")) return { include: true, category: "Produktbilder & Medien" };
  if (key.startsWith("tt:once:")) return { include: true, category: "Einmal-Marker (Schutz vor doppelten E-Mails)" };
  if (key === "tt:adm:audit") return { include: true, category: "Sicherheitsprotokoll" };
  if (LABELS[key]) return { include: true, category: LABELS[key] };
  if (key.startsWith("tt:")) return { include: true, category: "Unbekannt (vorsorglich gesichert)" };
  return { include: true, category: "Fremde Schlüssel (vorsorglich gesichert)" };
}

/** JSON-Werte, deren Inhalt bei Prüfung und Wiederherstellung als gültiges JSON erwartet wird */
export function expectsJson(key: string) {
  return BUSINESS_KEYS.includes(key);
}
