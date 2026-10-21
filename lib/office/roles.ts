/**
 * Rollen und Berechtigungen der Büroverwaltung. Geprüft wird immer auf dem Server.
 *
 * - Administrator: alles (bisheriger Dashboard-Zugang mit ADMIN_PASSWORD + 2FA), verwaltet Büro-Zugänge
 * - Büromitarbeiter: Büroverwaltung ansehen und bearbeiten (prüfen, freigeben, Logistik, Versand), Excel-Exporte und PDF-Dokumente
 *   erstellen, Exporthistorie ansehen – sonst keinen Dashboard-Bereich, keine Korrekturen
 * - Büro-Lesezugriff: Büroverwaltung nur ansehen (keine Downloads, keine Lieferscheinnummern, keine Änderungen)
 */
export const OFFICE_ROLES = ["buero", "lesen"] as const;
export type StaffRole = (typeof OFFICE_ROLES)[number];
export type Role = "admin" | StaffRole;

export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", buero: "Büromitarbeiter", lesen: "Büro-Lesezugriff" };
export const ROLE_TEXT: Record<Role, string> = {
  admin: "Voller Zugriff auf das Dashboard, verwaltet die Büro-Zugänge und die automatischen Berichte.",
  buero: "Büroverwaltung ansehen, Bestellungen prüfen, freigeben, zurückstellen, Logistik-Weitergabe und Versand dokumentieren, Exporthistorie und Berichte ansehen, Berichte manuell erstellen, Kundenfälle bearbeiten, Excel-Exporte und PDF-Dokumente erstellen. Kein Zugriff auf Produkte, Preise, Einstellungen oder Sicherheit, keine Status-Korrekturen.",
  lesen: "Büroverwaltung, Bearbeitungsverlauf, Berichte und Kundenfälle nur am Bildschirm ansehen. Keine Downloads, keine Lieferscheinnummern, keine Änderungen.",
};

/**
 * office.view: Büroverwaltung ansehen · office.export: Excel-Exporte · office.documents: PDF-Dokumente
 * (Lieferscheine mit Nummernvergabe, Versandliste, Sammelliste, Tagesbericht) · office.users: Büro-Zugänge verwalten
 * office.workflow: Bürostatus bearbeiten (prüfen, freigeben, zurückstellen, Logistik, Versand) · office.correct: Status-Korrektur
 * (auch „Abgeschlossen“ wieder öffnen) · office.history: Exporthistorie ansehen
 * office.automation: automatische Berichte, Benachrichtigungen und Erinnerungen einstellen (Phase 3D, nur Administrator)
 * office.reports: Berichte manuell erstellen / erneut erstellen (Phase 3D)
 * office.service: Kundenfälle bearbeiten (Phase 3E) · office.service.view: Kundenfälle ansehen
 * office.analytics: Verkaufsanalysen ansehen (Phase 3F) · office.analytics.export: Analysen exportieren
 */
export type Permission =
  | "office.view"
  | "office.export"
  | "office.documents"
  | "office.users"
  | "office.workflow"
  | "office.correct"
  | "office.history"
  | "office.automation"
  | "office.reports"
  | "office.service"
  | "office.service.view"
  | "office.analytics"
  | "office.analytics.export";
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["office.view", "office.export", "office.documents", "office.users", "office.workflow", "office.correct", "office.history", "office.automation", "office.reports", "office.service", "office.service.view", "office.analytics", "office.analytics.export"],
  buero: ["office.view", "office.export", "office.documents", "office.workflow", "office.history", "office.reports", "office.service", "office.service.view", "office.analytics", "office.analytics.export"],
  lesen: ["office.view", "office.service.view", "office.analytics"],
};

export const can = (role: Role | undefined | null, p: Permission) => Boolean(role && PERMISSIONS[role]?.includes(p));
export const isStaffRole = (v: unknown): v is StaffRole => OFFICE_ROLES.includes(v as StaffRole);

/** Angemeldete Person */
export type Principal = { role: Role; name: string; userId?: string; username?: string };

/** Kurzbezeichnung fürs Protokoll (ohne personenbezogene Kundendaten) */
export const principalLabel = (p: Principal) => (p.role === "admin" ? "Administrator" : `${ROLE_LABEL[p.role]} ${p.username}`);

export class OfficeAccessError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Nicht angemeldet" : "Keine Berechtigung");
  }
}
