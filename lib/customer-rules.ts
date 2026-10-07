// Regeln für Kundenkonten – ohne Server-Abhängigkeiten, damit sie auch im Browser genutzt werden können
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
