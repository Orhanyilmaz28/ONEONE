import { type ReturnCostPayer, type Settings, isReturnCostPayer } from "@/lib/settings-defaults";

/**
 * Gemeinsame Hilfen für „Einstellungen“ im Dashboard.
 * Wird im Browser (sofortige Rückmeldung beim Tippen) UND auf dem Server (endgültige Prüfung) genutzt –
 * deshalb hier nichts importieren, was nur auf dem Server läuft.
 */

export type CompanyKey = keyof Settings["company"];

/** Was im Formular steht (alles als Text, so wie getippt) */
export type SettingsInput = {
  company: Record<CompanyKey, string>;
  shipping: {
    cost: string;
    /** Kostenloser Versand ab einem Bestellwert? */
    freeEnabled: boolean;
    freeFrom: string;
    /** Express-Versand anbieten? */
    expressEnabled: boolean;
    express: string;
  };
  returns: {
    /** Wer zahlt die Rücksendung? („“ = noch nichts gewählt) */
    paidBy: ReturnCostPayer | "";
  };
  announcement: string;
};

/** Name der Formularfelder (auch Schlüssel für Fehlermeldungen) */
export const fieldName = {
  company: (key: CompanyKey) => `company.${key}`,
  cost: "shipping.cost",
  freeEnabled: "shipping.freeEnabled",
  freeFrom: "shipping.freeFrom",
  expressEnabled: "shipping.expressEnabled",
  express: "shipping.express",
  returnsPaidBy: "returns.paidBy",
  announcement: "announcement",
} as const;

export const ANNOUNCEMENT_MAX = 120;
const COMPANY_MAX = 150;

/* ───────────────────────── Firmendaten ───────────────────────── */

type CompanyField = {
  key: CompanyKey;
  label: string;
  help: string;
  placeholder: string;
  /** Muss ausgefüllt sein (sonst kann nicht gespeichert werden) */
  required?: boolean;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  /** Im Raster über beide Spalten */
  wide?: boolean;
};

/** Reihenfolge, Beschriftung und Erklärung aller Firmenfelder */
export const COMPANY_FIELDS: CompanyField[] = [
  {
    key: "name",
    label: "Firmenname",
    help: "Mit Rechtsform – genau so, wie er im Handelsregister steht.",
    placeholder: "z. B. Muster Handels GmbH",
    required: true,
    autoComplete: "organization",
    wide: true,
  },
  {
    key: "brand",
    label: "Markenname",
    help: "So heißt dein Shop für Kund:innen. Steht z. B. unten im Footer.",
    placeholder: "z. B. EXSTASE Energy",
    required: true,
  },
  {
    key: "owner",
    label: "Vertreten durch",
    help: "Wer die Firma vertritt – mit Funktion davor.",
    placeholder: "z. B. Geschäftsführer: Max Mustermann",
  },
  {
    key: "street",
    label: "Straße und Hausnummer",
    help: "Eine Anschrift, unter der man dich per Post erreicht – kein Postfach.",
    placeholder: "z. B. Musterstraße 1",
    required: true,
    autoComplete: "street-address",
  },
  {
    key: "city",
    label: "PLZ und Ort",
    help: "Postleitzahl zuerst, dann der Ort.",
    placeholder: "z. B. 47638 Straelen",
    required: true,
    autoComplete: "address-level2",
  },
  {
    key: "country",
    label: "Land",
    help: "Steht im Impressum unter der Anschrift.",
    placeholder: "z. B. Deutschland",
    required: true,
    autoComplete: "country-name",
  },
  {
    key: "email",
    label: "E-Mail-Adresse",
    help: "Für Fragen von Kund:innen. Pflicht im Impressum – steht auch auf der Kontaktseite.",
    placeholder: "z. B. hallo@exstase-energy.de",
    type: "email",
    autoComplete: "email",
  },
  {
    key: "phone",
    label: "Telefonnummer",
    help: "Pflicht im Impressum. Am besten mit Vorwahl, z. B. +49 2834 123456.",
    placeholder: "z. B. +49 2834 123456",
    type: "tel",
    autoComplete: "tel",
  },
  {
    key: "vatId",
    label: "USt-IdNr.",
    help: "Format: DE123456789 (DE und 9 Ziffern). Steht im Schreiben vom Bundeszentralamt für Steuern.",
    placeholder: "z. B. DE123456789",
  },
  {
    key: "register",
    label: "Handelsregister",
    help: "Registergericht und Nummer – steht auf deinem Handelsregisterauszug.",
    placeholder: "z. B. Amtsgericht Kleve, HRB 19550",
  },
];

/** Leer oder noch ein Platzhalter wie „[Telefonnummer]“? (gleiche Regel wie missingCompanyFields) */
export function isMissingValue(value: string | undefined | null) {
  return !value || /^\[.*\]$/.test(value.trim());
}

/** Gespeicherter Wert → Eingabefeld (Platzhalter wie „[Telefonnummer]“ werden zu einem leeren Feld) */
export function companyToInput(value: string) {
  return isMissingValue(value) ? "" : value;
}

/** Leerzeichen am Rand weg, mehrere Leerzeichen zu einem, keine Steuerzeichen/Zeilenumbrüche */
export function cleanText(raw: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen gezielt entfernen
  return raw.replace(/[\u0000-\u001f\u007f​-‍﻿]/g, " ").replace(/\s+/g, " ").trim();
}

/** USt-IdNr. vereinheitlichen: „de 123 456 789“ → „DE123456789“ */
export function normalizeVatId(raw: string) {
  return cleanText(raw).toUpperCase().replace(/[\s.\-/]/g, "");
}

const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s()/.-]+$/;
const GERMANY = /^(deutschland|germany|de)$/i;

/** Ein Firmenfeld prüfen; liefert den bereinigten Wert oder eine Fehlermeldung */
function checkCompany(field: CompanyField, raw: string, country: string): { value: string; error?: string } {
  const value = field.key === "vatId" ? normalizeVatId(raw) : cleanText(raw);
  if (!value) return field.required ? { value, error: "Bitte ausfüllen – das gehört ins Impressum." } : { value };
  if (value.length > COMPANY_MAX) return { value, error: `Bitte höchstens ${COMPANY_MAX} Zeichen.` };
  if (/^\[.*\]$/.test(value)) return { value, error: "Bitte die eckigen Klammern entfernen und den echten Wert eintragen." };

  switch (field.key) {
    case "email":
      if (!EMAIL.test(value)) return { value, error: "Das sieht nicht wie eine E-Mail-Adresse aus – Beispiel: hallo@exstase-energy.de." };
      break;
    case "phone": {
      const digits = value.replace(/\D/g, "").length;
      if (!PHONE.test(value) || digits < 6 || digits > 15)
        return { value, error: "Bitte nur Ziffern, Leerzeichen und ein + am Anfang – Beispiel: +49 2834 123456." };
      break;
    }
    case "vatId":
      if (value.startsWith("DE") ? !/^DE\d{9}$/.test(value) : !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(value))
        return { value, error: "Bitte im Format DE123456789 eingeben – also DE und 9 Ziffern." };
      break;
    case "city":
      if (GERMANY.test(cleanText(country)) && !/^\d{5}\s+\S/.test(value)) return { value, error: "Bitte mit Postleitzahl davor, z. B. 47638 Straelen." };
      break;
  }
  return { value };
}

/* ───────────────────────── Beträge ───────────────────────── */

const plainEuro = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/** 495 → „4,95“ (für Eingabefelder, ohne €-Zeichen) */
export function centsToInput(cents: number) {
  return plainEuro.format(cents / 100);
}

type Parsed = { cents: number | null; error?: string };
const fail = (error: string): Parsed => ({ cents: null, error });

/**
 * Betrag lesen – so, wie man ihn in Deutschland schreibt.
 * „4,95“ · „4,9“ · „4“ · „4.95“ · „1.234,50“ · „4,95 €“ → Cent. Leere Eingabe → `cents: null`.
 */
export function parseEuro(raw: string): Parsed {
  const s = raw
    .trim()
    .replace(/€|eur(o)?/gi, "")
    .replace(/[\s  ]/g, "");
  if (!s) return { cents: null };
  if (s.startsWith("-")) return fail("Der Betrag darf nicht negativ sein.");
  if (!/^[\d.,]+$/.test(s)) return fail("Bitte nur Ziffern und ein Komma eingeben, z. B. 4,95.");

  let whole = s;
  let fraction = "";
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length > 2) return fail("Bitte nur ein Komma verwenden, z. B. 4,95.");
    [whole, fraction] = parts;
    // Punkte vor dem Komma sind Tausenderpunkte (1.234,50)
    if (whole.includes(".")) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(whole)) return fail("Das sieht nicht wie ein Betrag aus – Beispiel: 4,95.");
      whole = whole.replace(/\./g, "");
    }
  } else if (s.includes(".")) {
    const parts = s.split(".");
    // „4.95“ = Dezimalpunkt, „1.234“ = Tausenderpunkt
    if (parts.length === 2 && parts[1].length <= 2) [whole, fraction] = parts;
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) whole = s.replace(/\./g, "");
    else return fail("Das sieht nicht wie ein Betrag aus – Beispiel: 4,95.");
  }
  if (fraction.length > 2) return fail("Bitte höchstens 2 Stellen nach dem Komma.");
  if (!whole) whole = "0";
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) return fail("Bitte nur Ziffern und ein Komma eingeben, z. B. 4,95.");
  if (whole.length > 7) return fail("Dieser Betrag ist zu groß.");
  return { cents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")) };
}

const euroFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euro = (cents: number) => euroFmt.format(cents / 100);

/** Betrag prüfen: Pflichtfeld + erlaubter Bereich */
function checkAmount(raw: string, { min, max, emptyError }: { min: number; max: number; emptyError: string }): { cents?: number; error?: string } {
  const parsed = parseEuro(raw);
  if (parsed.error) return { error: parsed.error };
  if (parsed.cents === null) return { error: emptyError };
  if (parsed.cents < min) return { error: `Bitte mindestens ${euro(min)} eingeben.` };
  if (parsed.cents > max) return { error: `Bitte höchstens ${euro(max)} eingeben.` };
  return { cents: parsed.cents };
}

/* ───────────────────────── Aktions-Hinweis ───────────────────────── */

/** Hinweis bereinigen (eine Zeile) */
export function cleanAnnouncement(raw: string) {
  return cleanText(raw);
}

/* ───────────────────────── Alles prüfen ───────────────────────── */

export type CheckResult = { value?: Settings; errors: Record<string, string> };

/** Alle Eingaben prüfen. Ohne Fehler gibt es den fertigen Settings-Datensatz (Beträge in Cent). */
export function checkSettings(input: SettingsInput): CheckResult {
  const errors: Record<string, string> = {};

  const company = {} as Settings["company"];
  for (const field of COMPANY_FIELDS) {
    const { value, error } = checkCompany(field, input.company[field.key] ?? "", input.company.country ?? "");
    company[field.key] = value;
    if (error) errors[fieldName.company(field.key)] = error;
  }

  const cost = checkAmount(input.shipping.cost, { min: 0, max: 9_999, emptyError: "Bitte einen Betrag eingeben – 0 heißt: Versand immer kostenlos." });
  if (cost.error) errors[fieldName.cost] = cost.error;

  let freeFrom = 0;
  if (input.shipping.freeEnabled) {
    const r = checkAmount(input.shipping.freeFrom, { min: 100, max: 999_900, emptyError: "Bitte den Bestellwert eingeben, ab dem der Versand kostenlos ist." });
    if (r.error) errors[fieldName.freeFrom] = r.error;
    else freeFrom = r.cents ?? 0;
  }

  let express = 0;
  if (input.shipping.expressEnabled) {
    const r = checkAmount(input.shipping.express, { min: 50, max: 19_900, emptyError: "Bitte den Preis für Express-Versand eingeben." });
    if (r.error) errors[fieldName.express] = r.error;
    else express = r.cents ?? 0;
  }

  const paidBy = input.returns.paidBy;
  if (!isReturnCostPayer(paidBy)) errors[fieldName.returnsPaidBy] = "Bitte wähle aus, wer die Rücksendung bezahlt.";

  const announcement = cleanAnnouncement(input.announcement);
  if (announcement.length > ANNOUNCEMENT_MAX)
    errors[fieldName.announcement] = `Bitte höchstens ${ANNOUNCEMENT_MAX} Zeichen – gerade sind es ${announcement.length}.`;

  if (Object.keys(errors).length || !isReturnCostPayer(paidBy)) return { errors };
  return {
    errors,
    value: {
      company,
      shipping: { cost: cost.cents ?? 0, freeFrom, express },
      returns: { paidBy },
      announcement,
    },
  };
}

/** Gespeicherte Einstellungen → Formularwerte */
export function toInput(settings: Settings): SettingsInput {
  const company = {} as Record<CompanyKey, string>;
  for (const field of COMPANY_FIELDS) company[field.key] = companyToInput(settings.company[field.key] ?? "");
  return {
    company,
    shipping: {
      cost: centsToInput(settings.shipping.cost),
      freeEnabled: settings.shipping.freeFrom > 0,
      freeFrom: settings.shipping.freeFrom > 0 ? centsToInput(settings.shipping.freeFrom) : "",
      expressEnabled: settings.shipping.express > 0,
      express: settings.shipping.express > 0 ? centsToInput(settings.shipping.express) : "",
    },
    returns: { paidBy: settings.returns.paidBy },
    announcement: settings.announcement,
  };
}
