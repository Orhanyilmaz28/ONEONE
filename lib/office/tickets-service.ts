import { getCustomers, normalizeEmail } from "../customers";
import type { DealerOrder } from "../dealer-orders";
import { KEYS, WriteConflictError, getJSONStrict, getManyJSONStrict, updateJSON } from "../store";
import type { OfficeOrder } from "./model";
import { berlinParts } from "./time";
import { type ActionOutcome, CONFLICT, type CreateContext, type Ticket, type TicketAction, applyTicketAction, formatTicketNumber, isTicketNumber, newTicket, type validateCreate } from "./tickets";
import type { Actor } from "./workflow";

/**
 * Speicher des Kundenservice (nur Server). Je Fall ein eigener Eintrag `tt:office-ticket:<Nummer>` (atomar geändert),
 * dazu `tt:office-tickets` = { seq: {Jahr: letzte Nummer}, list: [Nummern] } – Nummer und Verzeichnis werden in EINEM
 * atomaren Schritt vergeben, dadurch nie doppelt (auch bei gleichzeitigem Anlegen).
 * Bestellungen, Zahlungen, Kundenkonten und Händler werden nur gelesen, nie verändert.
 */
export const ticketKey = (number: string) => `tt:office-ticket:${number}`;
type Index = { seq: Record<string, number>; list: string[] };
export const MAX_TICKETS = 50_000;

class Rejected extends Error {
  constructor(public outcome: ActionOutcome) {
    super("rejected");
  }
}
export class TicketStoreError extends Error {}

async function readIndex(): Promise<Index> {
  const raw = await getJSONStrict<Index>(KEYS.officeTickets, { seq: {}, list: [] });
  return { seq: raw?.seq ?? {}, list: Array.isArray(raw?.list) ? raw.list : [] };
}

/** Nächste Nummer reservieren und ins Verzeichnis eintragen (atomar) */
async function reserveNumber(now: number): Promise<string> {
  const year = berlinParts(now).y;
  let number = "";
  await updateJSON<Index>(KEYS.officeTickets, { seq: {}, list: [] }, (cur) => {
    const seq = { ...(cur?.seq ?? {}) };
    const list = Array.isArray(cur?.list) ? cur.list : [];
    if (list.length >= MAX_TICKETS) throw new TicketStoreError(`Höchstens ${MAX_TICKETS} Fälle`);
    const n = (seq[String(year)] ?? 0) + 1;
    seq[String(year)] = n;
    number = formatTicketNumber(year, n);
    return { seq, list: [...list, number] };
  });
  return number;
}

/**
 * Reservierung zurücknehmen, wenn der Fall nicht gespeichert werden konnte: Eintrag aus dem Verzeichnis entfernen und –
 * falls seitdem keine weitere Nummer vergeben wurde – den Zähler zurücksetzen (sonst bleibt nur eine Lücke, nie eine Dublette).
 */
async function releaseNumber(number: string): Promise<void> {
  const m = /^KS-(\d{4})-(\d{5,})$/.exec(number);
  if (!m) return;
  await updateJSON<Index>(KEYS.officeTickets, { seq: {}, list: [] }, (cur) => {
    const seq = { ...(cur?.seq ?? {}) };
    const list = (Array.isArray(cur?.list) ? cur.list : []).filter((n) => n !== number);
    if (seq[m[1]] === Number(m[2])) seq[m[1]] = Number(m[2]) - 1;
    return { seq, list };
  });
}

/** Neuen Fall anlegen. Liefert den gespeicherten Fall. */
export async function createTicket(draft: Extract<ReturnType<typeof validateCreate>, { ok: true }>["draft"], actor: Actor, now = Date.now()): Promise<Ticket> {
  const number = await reserveNumber(now);
  const t = newTicket(number, draft, actor, now);
  try {
    await updateJSON<Ticket | null>(ticketKey(number), null, (cur) => {
      if (cur) throw new TicketStoreError("Fallnummer bereits belegt");
      return t;
    });
  } catch (e) {
    await releaseNumber(number).catch(() => undefined);
    throw e;
  }
  return t;
}

export async function getTicket(number: string): Promise<Ticket | null> {
  if (!isTicketNumber(number)) return null;
  const t = await getJSONStrict<Ticket | null>(ticketKey(number), null);
  return t && t.number === number ? t : null;
}

/** Alle Fälle (strikt: bei Speicherausfall Fehler statt leerer Liste). Verzeichniseinträge ohne Fall werden übersprungen. */
export async function listTickets(): Promise<Ticket[]> {
  const idx = await readIndex();
  const raw = await getManyJSONStrict<Ticket>(idx.list.map(ticketKey));
  return raw.filter((t, i): t is Ticket => Boolean(t && t.number === idx.list[i]));
}

/** Änderung atomar anwenden (Stand `rev` muss passen) */
export async function updateTicket(number: string, action: TicketAction, rev: number, actor: Actor, now = Date.now()): Promise<ActionOutcome | { ok: false; code: "store" | "missing"; error: string }> {
  if (!isTicketNumber(number)) return { ok: false, code: "missing", error: "Fall nicht gefunden." };
  let out: ActionOutcome | null = null;
  try {
    await updateJSON<Ticket | null>(ticketKey(number), null, (cur) => {
      if (!cur) throw new Rejected({ ok: false, code: "invalid", error: "Fall nicht gefunden." });
      const r = applyTicketAction(cur, action, rev, actor, now);
      if (!r.ok) throw new Rejected(r);
      out = r;
      return r.ticket;
    });
  } catch (e) {
    if (e instanceof Rejected) return e.outcome;
    if (e instanceof WriteConflictError) return { ok: false, code: "conflict", error: CONFLICT };
    return { ok: false, code: "store", error: "Der Datenspeicher ist gerade nicht erreichbar. Es wurde nichts geändert." };
  }
  return out ?? { ok: false, code: "store", error: "Unbekannter Fehler." };
}

/** Vorhandenes Kundenkonto bzw. Händler zur Bestellung finden (nur lesen – legt nie ein Konto an) */
export async function customerLink(o: OfficeOrder | null): Promise<CreateContext["link"]> {
  if (!o) return null;
  try {
    if (o.channel === "haendler") {
      const list = await getJSONStrict<DealerOrder[]>(KEYS.dealerOrders, []);
      const d = (Array.isArray(list) ? list : []).find((x) => `h:${x.id}` === o.key);
      return d?.dealerId ? { kind: "haendler", id: d.dealerId } : null;
    }
    if (!o.email) return null;
    const email = normalizeEmail(o.email);
    const c = Object.values(await getCustomers()).find((x) => normalizeEmail(x.email) === email);
    return c ? { kind: "konto", id: c.id } : null;
  } catch {
    return null;
  }
}
