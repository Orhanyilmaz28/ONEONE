import { createHash } from "node:crypto";
import { KEYS, getJSONStrict, updateJSON } from "../store";
import type { OfficeOrder } from "./model";
import { addressLines, shipTo } from "./shipping";
import { berlinParts } from "./time";

/**
 * Lieferscheinnummern und Dokumentationshistorie (Phase 3B).
 *
 * - Eigene Nummernfolge je Jahr: „LS-2026-00001“ – unabhängig von Bestell- und Rechnungsnummern.
 * - Vergabe atomar (updateJSON: Vergleichen-und-Setzen in Redis, mehrere Server gleichzeitig sicher): keine doppelten Nummern.
 * - Je Bestellung genau ein Lieferschein. Erneuter Download derselben Fassung → dieselbe Nummer.
 *   Haben sich Adresse, Positionen, Hinweise oder Bemerkung geändert → gleiche Nummer, neue Version (wird gedruckt).
 * - Eine Vorschau vergibt keine Nummer (liest nur).
 * - Die Bestellung selbst wird nie verändert (kein Versandstatus, keine Rechnung) – gespeichert wird nur dieser eigene Schlüssel.
 * Nur auf dem Server verwenden.
 */
export type NoteAction = "erstellt" | "neue Version" | "heruntergeladen" | "gedruckt";
export type NoteEvent = { at: string; by: string; action: NoteAction; version: number };
export type StoredNote = {
  number: string;
  /** Bestellnummer (zur Kontrolle der Zuordnung) */
  order: string;
  version: number;
  /** Fingerabdruck des gedruckten Inhalts (ohne Kundendaten im Klartext) */
  fp: string;
  remark: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  events: NoteEvent[];
};
export type NoteBook = { seq: Record<string, number>; notes: Record<string, StoredNote> };

const EMPTY: NoteBook = { seq: {}, notes: {} };
/** So viele Einträge der Historie bleiben je Lieferschein erhalten (die ältesten fallen weg, „erstellt“ bleibt immer) */
const MAX_EVENTS = 12;
/** Höchstzahl Lieferscheine in einem Sammel-PDF (Laufzeit- und Speichergrenzen von Vercel) */
export const MAX_NOTES_PER_PDF = 100;
export const MAX_REMARK = 300;

/** Fingerabdruck des Lieferschein-Inhalts: Lieferadresse, Positionen, Kundenhinweis, Bemerkung */
export function noteFingerprint(o: OfficeOrder, remark: string) {
  const content = {
    a: addressLines(shipTo(o), o.customerName),
    c: o.contact,
    l: o.lines.map((l) => [l.sku, l.product, l.sort, l.quantity, l.unit]),
    n: o.customerNote,
    r: remark,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 24);
}

export const formatNoteNumber = (year: number, seq: number) => `LS-${year}-${String(seq).padStart(5, "0")}`;

const cleanRemark = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_REMARK);

/** Vorhandene Lieferscheine lesen (strikt: bei Speicherausfall Fehler statt „keine Lieferscheine“) */
export async function readNotes(): Promise<NoteBook> {
  const book = await getJSONStrict<NoteBook>(KEYS.officeDeliveryNotes, EMPTY);
  return { seq: book?.seq ?? {}, notes: book?.notes ?? {} };
}

/** Rein: nächster Stand des Nummernbuchs (für Tests ohne Speicher nutzbar) */
export function applyIssue(book: NoteBook, orders: OfficeOrder[], by: string, action: "heruntergeladen" | "gedruckt", now: number, remark?: string): NoteBook {
  const next: NoteBook = { seq: { ...book.seq }, notes: { ...book.notes } };
  const at = new Date(now).toISOString();
  const year = berlinParts(now).y;
  for (const o of orders) {
    const prev = next.notes[o.key];
    const r = remark === undefined ? (prev?.remark ?? "") : cleanRemark(remark);
    const fp = noteFingerprint(o, r);
    if (!prev) {
      const seq = (next.seq[String(year)] ?? 0) + 1;
      next.seq[String(year)] = seq;
      next.notes[o.key] = {
        number: formatNoteNumber(year, seq),
        order: o.number,
        version: 1,
        fp,
        remark: r,
        createdAt: at,
        createdBy: by,
        updatedAt: at,
        events: [
          { at, by, action: "erstellt", version: 1 },
          { at, by, action, version: 1 },
        ],
      };
      continue;
    }
    const changed = prev.fp !== fp;
    const version = changed ? prev.version + 1 : prev.version;
    const events = [...prev.events, ...(changed ? [{ at, by, action: "neue Version" as const, version }] : []), { at, by, action, version }];
    const first = events.find((e) => e.action === "erstellt");
    const trimmed = events.length > MAX_EVENTS ? [...(first ? [first] : []), ...events.slice(-(MAX_EVENTS - 1))] : events;
    next.notes[o.key] = { ...prev, version, fp, remark: r, updatedAt: changed ? at : prev.updatedAt, events: trimmed };
  }
  return next;
}

/**
 * Lieferscheine für diese Bestellungen festschreiben: neue Nummer, neue Version oder nur Download vermerken.
 * Atomar – auch bei gleichzeitigen Anfragen keine doppelt vergebene Nummer.
 */
export async function issueNotes(orders: OfficeOrder[], by: string, action: "heruntergeladen" | "gedruckt", now = Date.now(), remark?: string): Promise<Map<string, StoredNote>> {
  let result: NoteBook = EMPTY;
  await updateJSON<NoteBook>(KEYS.officeDeliveryNotes, EMPTY, (current) => {
    result = applyIssue({ seq: current?.seq ?? {}, notes: current?.notes ?? {} }, orders, by, action, now, remark);
    return result;
  });
  return new Map(orders.map((o) => [o.key, result.notes[o.key]]));
}
