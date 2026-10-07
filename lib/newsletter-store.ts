import { randomBytes } from "node:crypto";
import { KEYS, getJSON, updateJSON } from "./store";

/**
 * Newsletter-Anmeldungen (nur auf dem Server verwenden).
 * Mit eingerichtetem E-Mail-Versand gilt Double-Opt-In: neue Adressen sind erst „pending“ und werden
 * durch den Link in der Bestätigungs-E-Mail „confirmed“. Ohne E-Mail-Versand werden Adressen nur gesammelt
 * (Status leer = „ohne Bestätigung“) – Bestätigung und Versand übernimmt dann ein Newsletter-Tool.
 */

export type Subscriber = {
  /** immer klein geschrieben und ohne Leerzeichen */
  email: string;
  createdAt: string;
  /** Woher die Anmeldung kommt, z. B. "website" */
  source: string;
  /** pending = Bestätigungs-E-Mail verschickt · confirmed = bestätigt · leer = ohne Bestätigung (ältere Anmeldungen) */
  status?: "pending" | "confirmed";
  /** Geheimer Schlüssel für Bestätigungs- und Abmelde-Link */
  token?: string;
  confirmedAt?: string;
  confirmSentAt?: string;
};

/** Bestätigungs-Links sind 7 Tage gültig; danach werden unbestätigte Anmeldungen entfernt */
const PENDING_DAYS = 7;
/** Bestätigungs-E-Mail höchstens alle 10 Minuten erneut schicken */
const RESEND_MS = 10 * 60_000;

/** Obergrenze, damit der Speicher nicht vollläuft (reicht für einen kleinen Shop locker) */
export const MAX_SUBSCRIBERS = 20_000;

/**
 * Bewusst strenge Prüfung: Die Adresse muss mit einem Buchstaben oder einer Ziffer beginnen.
 * So kann im CSV-Export nie eine „Excel-Formel“ (=, +, -, @ am Anfang) landen.
 */
const EMAIL = /^[a-z0-9][a-z0-9._%+'-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/;

/** E-Mail-Adresse vereinheitlichen und prüfen; liefert null, wenn sie ungültig ist */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.split("@")[0].length > 64) return null;
  return EMAIL.test(email) ? email : null;
}

/** Erlaubte Quellen-Kennungen (kurz, nur Kleinbuchstaben/Ziffern/Bindestrich) */
export function normalizeSource(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9-]{1,30}$/.test(value) ? value : "website";
}

export class SubscriberLimitError extends Error {
  constructor() {
    super("Die Newsletter-Liste ist voll. Bitte exportiere die Adressen und lösche ältere Einträge im Dashboard.");
  }
}

function isSubscriber(value: unknown): value is Subscriber {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.email === "string" && typeof s.createdAt === "string";
}

function clean(raw: unknown): Subscriber[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = Date.now() - PENDING_DAYS * 86_400_000;
  return raw
    .filter(isSubscriber)
    .map((s) => ({
      email: s.email,
      createdAt: s.createdAt,
      source: typeof s.source === "string" ? s.source : "website",
      ...(s.status === "pending" || s.status === "confirmed" ? { status: s.status } : {}),
      ...(typeof s.token === "string" ? { token: s.token } : {}),
      ...(typeof s.confirmedAt === "string" ? { confirmedAt: s.confirmedAt } : {}),
      ...(typeof s.confirmSentAt === "string" ? { confirmSentAt: s.confirmSentAt } : {}),
    }))
    // abgelaufene, nie bestätigte Anmeldungen verwerfen
    .filter((s) => s.status !== "pending" || Date.parse(s.createdAt) > cutoff);
}

const newToken = () => randomBytes(24).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Double-Opt-In: Anmeldung vormerken. Liefert den Token, wenn eine Bestätigungs-E-Mail geschickt werden soll.
 * already = schon angemeldet (nichts zu tun), pending ohne Token = Bestätigung wurde gerade erst geschickt.
 */
export async function requestSubscription(email: string, source = "website"): Promise<{ state: "already" | "pending"; token?: string }> {
  let result: { state: "already" | "pending"; token?: string } = { state: "pending" };
  await updateJSON<unknown>(KEYS.newsletter, [], (raw) => {
    const list = clean(raw);
    const now = new Date().toISOString();
    const existing = list.find((s) => s.email === email);
    if (existing && existing.status !== "pending") {
      result = { state: "already" };
      return list;
    }
    if (existing) {
      if (existing.confirmSentAt && Date.now() - Date.parse(existing.confirmSentAt) < RESEND_MS) {
        result = { state: "pending" };
        return list;
      }
      const token = existing.token ?? newToken();
      result = { state: "pending", token };
      return list.map((s) => (s.email === email ? { ...s, token, confirmSentAt: now } : s));
    }
    if (list.length >= MAX_SUBSCRIBERS) throw new SubscriberLimitError();
    const token = newToken();
    result = { state: "pending", token };
    return [...list, { email, createdAt: now, source, status: "pending" as const, token, confirmSentAt: now }];
  });
  return result;
}

/** Bestätigungs-Link geklickt → Adresse ist bestätigt. Liefert die Adresse (oder null bei ungültigem/abgelaufenem Link). */
export async function confirmSubscription(token: string): Promise<{ email: string; already: boolean } | null> {
  if (!TOKEN.test(token)) return null;
  let found: { email: string; already: boolean } | null = null;
  await updateJSON<unknown>(KEYS.newsletter, [], (raw) => {
    const list = clean(raw);
    const s = list.find((x) => x.token === token);
    if (!s) return list;
    found = { email: s.email, already: s.status === "confirmed" };
    if (s.status === "confirmed") return list;
    return list.map((x) => (x.token === token ? { ...x, status: "confirmed" as const, confirmedAt: new Date().toISOString() } : x));
  });
  return found;
}

/** Abmelde-Link → Adresse entfernen. Liefert die Adresse oder null. */
export async function unsubscribeByToken(token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  let email: string | null = null;
  await updateJSON<unknown>(KEYS.newsletter, [], (raw) => {
    const list = clean(raw);
    const s = list.find((x) => x.token === token);
    if (!s) return list;
    email = s.email;
    return list.filter((x) => x.token !== token);
  });
  return email;
}

export const STATUS_LABEL = { confirmed: "Bestätigt", pending: "Wartet auf Bestätigung", legacy: "Ohne Bestätigung (alt)" } as const;
export const statusKey = (s: Pick<Subscriber, "status">): "confirmed" | "pending" | "legacy" => s.status ?? "legacy";

/** Alle Anmeldungen, neueste zuerst */
export async function getSubscribers(): Promise<Subscriber[]> {
  return clean(await getJSON<unknown>(KEYS.newsletter, [])).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

/**
 * Neue Anmeldung speichern. Ist die Adresse schon eingetragen, bleibt alles wie es ist (added = false).
 * Wirft StoreUnavailableError (kein Speicher) oder SubscriberLimitError.
 */
export async function addSubscriber(email: string, source = "website"): Promise<{ added: boolean }> {
  let added = false;
  await updateJSON<unknown>(KEYS.newsletter, [], (raw) => {
    const list = clean(raw);
    if (list.some((s) => s.email === email)) return list;
    if (list.length >= MAX_SUBSCRIBERS) throw new SubscriberLimitError();
    added = true;
    return [...list, { email, createdAt: new Date().toISOString(), source }];
  });
  return { added };
}

/** Eine Adresse entfernen; liefert true, wenn sie eingetragen war */
export async function removeSubscriber(email: string): Promise<boolean> {
  let removed = false;
  await updateJSON<unknown>(KEYS.newsletter, [], (raw) => {
    const list = clean(raw);
    const next = list.filter((s) => s.email !== email);
    removed = next.length !== list.length;
    return removed ? next : list;
  });
  return removed;
}

export const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
};

const csvDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Ein Feld für CSV (Semikolon-getrennt) sicher machen */
function csvField(value: string) {
  // Formel-Schutz für Excel: Werte, die mit =, +, -, @ beginnen, als Text kennzeichnen
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV für Excel (deutsch) und Newsletter-Tools:
 * UTF-8 mit BOM (damit Umlaute in Excel stimmen), Semikolon als Trenner, Zeilenende CRLF.
 * Die Spalte „EMAIL“ erkennt Brevo beim Import automatisch.
 */
export function subscribersToCsv(list: Subscriber[]): string {
  const rows = [
    ["EMAIL", "Angemeldet am", "Quelle", "Status", "Bestätigt am"],
    ...list.map((s) => [
      s.email,
      csvDate.format(new Date(s.createdAt)).replace(",", ""),
      SOURCE_LABEL[s.source] ?? s.source,
      STATUS_LABEL[statusKey(s)],
      s.confirmedAt ? csvDate.format(new Date(s.confirmedAt)).replace(",", "") : "",
    ]),
  ];
  return `﻿${rows.map((r) => r.map(csvField).join(";")).join("\r\n")}\r\n`;
}
