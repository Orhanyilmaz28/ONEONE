import { randomBytes } from "node:crypto";
import { deleteTemp, getJSON, getTemp, setTemp, storeKind, updateJSON } from "./store";

/**
 * Versandprotokoll (Dashboard → E-Mails → Protokoll): welche E-Mail wann an wen ging und ob es geklappt hat.
 * Gespeichert werden nur Betreff, Empfänger und Ergebnis – höchstens 300 Einträge und 30 Tage.
 * Bei Fehlern wird der Inhalt 7 Tage aufgehoben, damit du die Mail per Knopf nochmal schicken kannst.
 * Betriebsdaten: nicht Teil der Datensicherung (lib/backup/keys.ts).
 */

export const MAIL_LOG_KEY = "tt:mail-log";
const RETRY_PREFIX = "tt:mail-log:retry:";
const MAX_ENTRIES = 300;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_TTL_S = 7 * 24 * 60 * 60;

export type MailLogStatus = "ok" | "fehler" | "aus";

export type MailLogEntry = {
  id: string;
  at: string;
  tag: string;
  to: string;
  subject: string;
  status: MailLogStatus;
  provider?: string;
  error?: string;
  /** Inhalt liegt noch bereit → „Nochmal senden“ möglich */
  retry?: boolean;
  /** Später erneut verschickt (Zeitpunkt) */
  resentAt?: string;
};

export type RetryMail = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tag?: string;
  /** Anhänge (z. B. Rechnung) als Base64 – nur bis zu einer Gesamtgröße von 400 KB */
  attachments?: { filename: string; content: string; contentType?: string }[];
};

const MAX_ATTACHMENT_BYTES = 400_000;

/** Anhänge für das Aufheben vorbereiten (zu große werden weggelassen) */
export function retryAttachments(list: { filename: string; content: Buffer; contentType?: string }[] | undefined): RetryMail["attachments"] {
  if (!list?.length) return undefined;
  const total = list.reduce((n, a) => n + a.content.length, 0);
  if (total > MAX_ATTACHMENT_BYTES) return undefined;
  return list.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), ...(a.contentType ? { contentType: a.contentType } : {}) }));
}

const retryKey = (id: string) => `${RETRY_PREFIX}${id}`;

export function pruneLog(list: MailLogEntry[], now = Date.now()) {
  return list.filter((e) => now - Date.parse(e.at) <= MAX_AGE_MS).slice(0, MAX_ENTRIES);
}

/** Eintrag schreiben – ein Fehler hier darf den Versand nie stören */
export async function logMail(entry: Omit<MailLogEntry, "id" | "at" | "retry">, retry?: RetryMail): Promise<void> {
  if (storeKind() === "none") return;
  const id = randomBytes(8).toString("hex");
  try {
    let keep = false;
    if (retry) {
      await setTemp(retryKey(id), retry, RETRY_TTL_S);
      keep = true;
    }
    const at = new Date().toISOString();
    await updateJSON<MailLogEntry[]>(MAIL_LOG_KEY, [], (list) => pruneLog([{ ...entry, id, at, ...(keep ? { retry: true } : {}) }, ...(Array.isArray(list) ? list : [])]));
  } catch (error) {
    console.error(`[mail-log] Protokoll nicht geschrieben: ${(error as Error).name}`);
  }
}

export async function getMailLog(): Promise<MailLogEntry[]> {
  const list = await getJSON<MailLogEntry[]>(MAIL_LOG_KEY, []);
  return Array.isArray(list) ? pruneLog(list) : [];
}

export async function getRetryMail(id: string): Promise<RetryMail | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  return getTemp<RetryMail>(retryKey(id));
}

/** Nach erfolgreichem erneuten Versand: Inhalt löschen und Eintrag markieren */
export async function markResent(id: string): Promise<void> {
  await deleteTemp(retryKey(id));
  await updateJSON<MailLogEntry[]>(MAIL_LOG_KEY, [], (list) =>
    (Array.isArray(list) ? list : []).map((e) => (e.id === id ? { ...e, retry: false, resentAt: new Date().toISOString() } : e)),
  );
}
