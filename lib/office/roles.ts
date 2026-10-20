/**
 * Rollen und Berechtigungen der Büroverwaltung. Geprüft wird immer auf dem Server.
 *
 * - Administrator: alles (bisheriger Dashboard-Zugang mit ADMIN_PASSWORD + 2FA), verwaltet Büro-Zugänge
 * - Büromitarbeiter: Büroverwaltung ansehen, Excel-Exporte und PDF-Dokumente erstellen – sonst keinen Dashboard-Bereich
 * - Büro-Lesezugriff: Büroverwaltung nur ansehen (keine Downloads, keine Lieferscheinnummern, keine Änderungen)
 */
export const OFFICE_ROLES = ["buero", "lesen"] as const;
export type StaffRole = (typeof OFFICE_ROLES)[number];
export type Role = "admin" | StaffRole;

export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", buero: "Büromitarbeiter", lesen: "Büro-Lesezugriff" };
export const ROLE_TEXT: Record<Role, string> = {
  admin: "Voller Zugriff auf das Dashboard, verwaltet die Büro-Zugänge.",
  buero: "Büroverwaltung ansehen, Excel-Exporte, Lieferscheine, Versandlisten, Sammellisten und Tagesberichte (PDF) erstellen. Kein Zugriff auf Produkte, Preise, Einstellungen oder Sicherheit.",
  lesen: "Büroverwaltung und Berichte nur am Bildschirm ansehen. Keine Downloads, keine Lieferscheinnummern, keine Änderungen.",
};

/**
 * office.view: Büroverwaltung ansehen · office.export: Excel-Exporte · office.documents: PDF-Dokumente
 * (Lieferscheine mit Nummernvergabe, Versandliste, Sammelliste, Tagesbericht) · office.users: Büro-Zugänge verwalten
 */
export type Permission = "office.view" | "office.export" | "office.documents" | "office.users";
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["office.view", "office.export", "office.documents", "office.users"],
  buero: ["office.view", "office.export", "office.documents"],
  lesen: ["office.view"],
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
