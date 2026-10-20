import { createHash } from "node:crypto";
import type { Product } from "../types";
import { KEYS, getJSONStrict, getManyJSONStrict, updateJSON } from "../store";
import type { OfficeAddress, OfficeOrder } from "./model";
import { addressLines, lineContents, shipTo } from "./shipping";
import { berlinParts } from "./time";

/**
 * Lieferscheinnummern, Versionen und Historie (Phase 3B, in Phase 3C skalierbar gemacht).
 *
 * Speicher (Phase 3C):
 * - je Bestellung ein eigener kleiner Schlüssel `tt:office-ls:<Bestellschlüssel>` (Nummer, Versionen mit Datenbasis, Verlauf)
 * - ein kleiner Zähler je Jahr in `tt:office-ls-seq` ({"2026": 17})
 * Damit wächst kein einzelner Schlüssel mit der Zahl der Lieferscheine.
 *
 * Rückwärtskompatibel: Das frühere gemeinsame Nummernbuch `tt:office-delivery-notes` (Phase 3B) wird nur noch gelesen.
 * Eine Bestellung, die dort schon einen Lieferschein hat, behält dessen Nummer; beim nächsten Druck wird der Eintrag
 * in den eigenen Schlüssel übernommen. Der Zähler beginnt nie unter dem alten Stand. Keine Massen-Umstellung.
 *
 * Regeln:
 * - Eigene Nummernfolge je Jahr („LS-2026-00001“), unabhängig von Bestell- und Rechnungsnummern; nie doppelt vergeben.
 * - Erneuter Download derselben Fassung → dieselbe Nummer und Version. Geänderter Inhalt (Adresse, Positionen,
 *   Mixpaket-Inhalt, Versanddatum, Hinweise, Bemerkung) → gleiche Nummer, neue Version.
 * - Jede Version speichert ihre Datenbasis (was gedruckt wurde) → ältere Versionen bleiben reproduzierbar.
 * - Eine Vorschau vergibt keine Nummer. Die Bestellung selbst wird nie verändert.
 * Nur auf dem Server verwenden (die reinen Funktionen sind ohne Speicher testbar).
 */
export type NoteAction = "erstellt" | "neue Version" | "heruntergeladen" | "gedruckt";
export type NoteEvent = { at: string; by: string; action: NoteAction; version: number };

/** Was auf dieser Version gedruckt wurde (Datenbasis) – damit sie später unverändert erneut erzeugt werden kann */
export type NoteBasis = {
  order: string;
  channel: OfficeOrder["channel"];
  createdAt: number;
  customerName: string;
  company: string;
  contact: string;
  address: OfficeAddress | null;
  /** true = keine eigene Lieferadresse, Rechnungsadresse verwendet */
  billingUsed: boolean;
  lines: { sku: string; handle?: string; product: string; sort: string; quantity: number; unit: string; unitsPerPack: number | null; contents: string; mix: boolean }[];
  customerNote: string;
  shippedAt?: number;
  remark: string;
};
export type NoteVersion = { version: number; fp: string; at: string; by: string; basis: NoteBasis };

export type StoredNote = {
  number: string;
  /** Bestellnummer (zur Kontrolle der Zuordnung) */
  order: string;
  version: number;
  /** Fingerabdruck des gedruckten Inhalts */
  fp: string;
  remark: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  events: NoteEvent[];
  /** Alle Versionen mit Datenbasis (fehlt bei Lieferscheinen aus Phase 3B – deren alte Fassungen sind nicht gespeichert) */
  versions?: NoteVersion[];
};
/** Früheres gemeinsames Nummernbuch (Phase 3B) */
export type NoteBook = { seq: Record<string, number>; notes: Record<string, StoredNote> };

export const noteKey = (orderKey: string) => `tt:office-ls:${orderKey}`;

/** So viele Einträge der Historie bleiben je Lieferschein erhalten (die ältesten fallen weg, „erstellt“ bleibt immer) */
const MAX_EVENTS = 12;
/** So viele Versionen mit Datenbasis werden je Lieferschein aufbewahrt (die erste bleibt immer) */
export const MAX_VERSIONS = 30;
/** Höchstzahl Lieferscheine in einem Sammel-PDF (Laufzeit- und Speichergrenzen von Vercel) */
export const MAX_NOTES_PER_PDF = 100;
export const MAX_REMARK = 300;

const cleanRemark = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_REMARK);

/** Datenbasis eines Lieferscheins aus der Bestellung (Mixpaket-Inhalt aus den Produktdaten zum Zeitpunkt des Drucks) */
export function noteBasis(o: OfficeOrder, remark: string, products: Map<string, Product>): NoteBasis {
  return {
    order: o.number,
    channel: o.channel,
    createdAt: o.createdAt,
    customerName: o.customerName,
    company: o.company,
    contact: o.contact,
    address: shipTo(o),
    billingUsed: !o.delivery && Boolean(o.billing),
    lines: o.lines.map((l) => {
      const mix = Boolean(l.mixContents ?? (l.handle && products.get(l.handle)?.contents?.length));
      return { sku: l.sku, handle: l.handle, product: l.product, sort: l.sort, quantity: l.quantity, unit: l.unit, unitsPerPack: l.unitsPerPack, contents: l.mixContents ?? lineContents(l, products), mix };
    }),
    customerNote: o.customerNote,
    ...(o.shippedAt ? { shippedAt: o.shippedAt } : {}),
    remark,
  };
}

/** Fingerabdruck des Lieferschein-Inhalts (was gedruckt wird) */
export function basisFingerprint(b: NoteBasis) {
  const content = {
    a: addressLines(b.address, b.customerName),
    c: b.contact,
    l: b.lines.map((l) => [l.sku, l.product, l.sort, l.quantity, l.unit, l.contents]),
    n: b.customerNote,
    s: b.shippedAt ?? null,
    r: b.remark,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 24);
}

export const noteFingerprint = (o: OfficeOrder, remark: string, products: Map<string, Product>) => basisFingerprint(noteBasis(o, remark, products));

/** Bestellung aus einer gespeicherten Datenbasis (für die Archivkopie einer älteren Version) */
export function orderFromBasis(key: string, b: NoteBasis): OfficeOrder {
  return {
    key,
    channel: b.channel,
    number: b.order,
    createdAt: b.createdAt,
    customerName: b.customerName,
    company: b.company,
    contact: b.contact,
    email: "",
    phone: "",
    vatId: "",
    billing: b.billingUsed ? b.address : null,
    delivery: b.billingUsed ? null : b.address,
    lines: b.lines.map((l) => ({ sku: l.sku, handle: l.handle, product: l.product, sort: l.sort, quantity: l.quantity, unit: l.unit, unitsPerPack: l.unitsPerPack, unitPrice: null, discount: 0, total: 0, ...(l.mix ? { mixContents: l.contents } : {}) })),
    priceBasis: "brutto",
    goods: 0,
    discount: 0,
    deposit: 0,
    depositUnits: null,
    shipping: 0,
    net: 0,
    vat: 0,
    vatSource: "berechnet",
    gross: 0,
    refunded: 0,
    paymentMethod: "",
    paymentStatus: "offen",
    processing: "offen",
    shippingStatus: "nicht_versendet",
    tracking: "",
    carrier: "",
    ...(b.shippedAt ? { shippedAt: b.shippedAt } : {}),
    customerNote: b.customerNote,
    internalNote: "",
    invoiceNumber: "",
    warnings: [],
  };
}

export const formatNoteNumber = (year: number, seq: number) => `LS-${year}-${String(seq).padStart(5, "0")}`;

/**
 * Rein: nächster Stand des Lieferscheins einer Bestellung.
 * `prev` = vorhandener Lieferschein (neu oder aus dem alten Nummernbuch), `number` = frisch vergebene Nummer (nur wenn noch keiner existiert).
 */
export function applyIssueOne(prev: StoredNote | null, o: OfficeOrder, number: string | null, by: string, action: "heruntergeladen" | "gedruckt", now: number, products: Map<string, Product>, remark?: string): StoredNote {
  const at = new Date(now).toISOString();
  const r = remark === undefined ? (prev?.remark ?? "") : cleanRemark(remark);
  const basis = noteBasis(o, r, products);
  const fp = basisFingerprint(basis);
  if (!prev) {
    if (!number) throw new Error("Keine Lieferscheinnummer vergeben");
    return {
      number,
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
      versions: [{ version: 1, fp, at, by, basis }],
    };
  }
  const changed = prev.fp !== fp;
  const version = changed ? prev.version + 1 : prev.version;
  const events = [...prev.events, ...(changed ? [{ at, by, action: "neue Version" as const, version }] : []), { at, by, action, version }];
  const first = events.find((e) => e.action === "erstellt");
  const trimmed = events.length > MAX_EVENTS ? [...(first ? [first] : []), ...events.slice(-(MAX_EVENTS - 1))] : events;
  let versions = prev.versions ?? [];
  // Aktuelle Fassung festhalten: neue Version, oder die laufende Version, falls ihre Datenbasis (Phase 3B) noch fehlt
  if (changed || !versions.some((v) => v.version === version)) versions = [...versions, { version, fp, at, by, basis }];
  if (versions.length > MAX_VERSIONS) versions = [versions[0], ...versions.slice(-(MAX_VERSIONS - 1))];
  return { ...prev, version, fp, remark: r, updatedAt: changed ? at : prev.updatedAt, events: trimmed, versions };
}

/* ───────────── Speicher ───────────── */

/** Früheres Nummernbuch (Phase 3B) – nur lesen */
async function readLegacy(): Promise<NoteBook> {
  const book = await getJSONStrict<NoteBook>(KEYS.officeDeliveryNotes, { seq: {}, notes: {} });
  return { seq: book?.seq ?? {}, notes: book?.notes ?? {} };
}

/** Vorhandene Lieferscheine dieser Bestellungen (strikt: bei Speicherausfall Fehler statt „keine Lieferscheine“) */
export async function readNotesFor(orderKeys: string[]): Promise<Map<string, StoredNote>> {
  const [current, legacy] = await Promise.all([getManyJSONStrict<StoredNote>(orderKeys.map(noteKey)), readLegacy()]);
  const out = new Map<string, StoredNote>();
  orderKeys.forEach((k, i) => {
    const n = current[i] ?? legacy.notes[k];
    if (n) out.set(k, n);
  });
  return out;
}

/** Nummern-Block reservieren (atomar). Beginnt nie unter dem Stand des alten Nummernbuchs. */
async function reserveNumbers(count: number, year: number, legacySeq: number): Promise<number> {
  let start = 0;
  await updateJSON<Record<string, number>>(KEYS.officeNoteSeq, {}, (cur) => {
    const base = Math.max(cur?.[String(year)] ?? 0, legacySeq);
    start = base + 1;
    return { ...(cur ?? {}), [String(year)]: base + count };
  });
  return start;
}

/**
 * Lieferscheine für diese Bestellungen festschreiben: neue Nummer, neue Version oder nur Download vermerken.
 * Atomar je Bestellung; Nummern werden als Block atomar reserviert – auch bei gleichzeitigen Anfragen nie doppelt.
 * (Erstellen zwei Personen im selben Augenblick den ersten Lieferschein derselben Bestellung, bleibt höchstens eine Nummer
 * ungenutzt – vergeben wird sie nie zweimal.)
 */
export async function issueNotes(orders: OfficeOrder[], by: string, action: "heruntergeladen" | "gedruckt", products: Map<string, Product>, now = Date.now(), remark?: string): Promise<Map<string, StoredNote>> {
  const [current, legacy] = await Promise.all([getManyJSONStrict<StoredNote>(orders.map((o) => noteKey(o.key))), readLegacy()]);
  const year = berlinParts(now).y;
  const need = orders.filter((o, i) => !current[i] && !legacy.notes[o.key]);
  const numbers = new Map<string, string>();
  if (need.length) {
    const start = await reserveNumbers(need.length, year, legacy.seq[String(year)] ?? 0);
    need.forEach((o, i) => numbers.set(o.key, formatNoteNumber(year, start + i)));
  }
  const out = new Map<string, StoredNote>();
  // nacheinander in kleinen Gruppen (Upstash-Anfragen begrenzen)
  for (let i = 0; i < orders.length; i += 8) {
    await Promise.all(
      orders.slice(i, i + 8).map(async (o) => {
        let result: StoredNote | null = null;
        await updateJSON<StoredNote | null>(noteKey(o.key), null, (cur) => {
          const prev = cur ?? legacy.notes[o.key] ?? null;
          result = applyIssueOne(prev, o, prev ? null : (numbers.get(o.key) ?? null), by, action, now, products, remark);
          return result;
        });
        if (result) out.set(o.key, result);
      }),
    );
  }
  return out;
}
