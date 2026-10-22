import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { logSecurityEvent } from "../admin-security/audit";
import { hitLimit } from "../admin-security/rate-limit";
import { getSettings } from "../settings";
import type { Product } from "../types";
import { logActivity } from "./activity";
import { MAX_NOTES_PER_PDF, MAX_REMARK, type StoredNote, issueNotes, orderFromBasis, readNotesFor } from "./delivery-notes";
import { type CompanyInfo, collectListPdf, dailyReportPdf, deliveryNotesPdf, invoicePdf, shippingListPdf } from "./documents";
import { invoiceBasis, invoiceBlockers, issueInvoice, readInvoice } from "./invoices";
import { type Filters, applyFilters, describeFilters, filterSummaryForLog, lineFilter, parseFilters } from "./filters";
import { logoImage } from "./logo";
import type { OfficeOrder } from "./model";
import { type Principal, principalLabel } from "./roles";
import { loadOfficeOrder, loadOfficeOrders } from "./source";
import { type Range, berlinParts, resolveRange } from "./time";
import { changedSinceRelease } from "./workflow";

/**
 * Ablauf der PDF-Dokumente der Büroverwaltung (nur auf dem Server):
 * Anfrage prüfen → ALLE passenden Bestellungen über die Phase-3A-Datenquelle laden → bei fehlenden Daten abbrechen
 * (nie ein unvollständiges Dokument) → Lieferscheinnummern festschreiben (nicht bei der Vorschau) → PDF erzeugen → protokollieren.
 * Bestellungen, Zahlungen und Rechnungen werden nie verändert.
 */
export const DOC_TYPES = ["lieferschein", "versandliste", "sammelliste", "tagesbericht", "rechnung"] as const;
export type DocType = (typeof DOC_TYPES)[number];
/** vorschau: ansehen ohne Nummernvergabe · druck: im Browser öffnen (zum Drucken) · download: als Datei speichern ·
 * archiv: unveränderte Kopie einer früheren Lieferschein-Version (keine neue Nummer, keine neue Version) */
export type DocMode = "vorschau" | "druck" | "download" | "archiv";

const TITLES: Record<DocType, string> = { lieferschein: "Lieferschein", versandliste: "Versandliste", sammelliste: "Artikel-Sammelliste", tagesbericht: "Tagesbericht", rechnung: "Rechnung" };

export type DocRequest = {
  type: DocType;
  mode: DocMode;
  range: Range | null;
  preset: string;
  filters: Filters;
  /** Ausgewählte Bestellungen (Schlüssel) – leer und `all` = alle Filterergebnisse */
  keys: string[];
  all: boolean;
  remark?: string;
  /** Nur bei „archiv“: welche Version */
  version?: number;
};

const KEY_RE = /^(s:cs_[A-Za-z0-9_]{6,200}|h:[0-9a-f]{8,64})$/;

type Input = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseDocRequest(p: Input, now: number): { ok: true; req: DocRequest } | { ok: false; error: string } {
  const type = DOC_TYPES.find((t) => t === one(p.art));
  if (!type) return { ok: false, error: "Unbekannte Dokumentart." };
  const modeRaw = one(p.modus);
  const mode: DocMode = modeRaw === "vorschau" || modeRaw === "druck" || modeRaw === "archiv" ? modeRaw : "download";
  if (mode === "vorschau" && type !== "lieferschein" && type !== "rechnung") return { ok: false, error: "Eine Vorschau gibt es nur für Lieferscheine und Rechnungen." };
  const version = Number(one(p.version));
  if (mode === "archiv" && (type !== "lieferschein" || !Number.isInteger(version) || version < 1 || version > 10_000)) return { ok: false, error: "Ungültige Lieferschein-Version." };
  const flat = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, one(v)]));
  const filters = parseFilters(flat);
  const rawKeys = (Array.isArray(p.auswahl) ? p.auswahl : p.auswahl ? [p.auswahl] : []).map((k) => k.trim()).filter(Boolean);
  if (rawKeys.some((k) => !KEY_RE.test(k))) return { ok: false, error: "Ungültige Auswahl." };
  const keys = [...new Set(rawKeys)];
  const all = one(p.alle) === "1";
  const hasRange = Boolean(one(p.zeitraum));
  let range: Range | null = null;
  let preset = "";
  if (type === "rechnung") {
    // Rechnung: immer genau eine Bestellung, ohne Zeitraum
    if (all || keys.length !== 1 || !keys[0].startsWith("s:")) return { ok: false, error: "Eine Rechnung gibt es nur für genau eine Privatbestellung." };
    if (mode === "archiv") return { ok: false, error: "Eine Rechnung wird immer in ihrer gespeicherten Fassung erzeugt." };
    return { ok: true, req: { type, mode, range: null, preset: "", filters: parseFilters({}), keys, all: false } };
  }
  if (hasRange || type !== "lieferschein") {
    const r = resolveRange({ preset: one(p.zeitraum) || "heute", day: one(p.tag), week: one(p.kw), month: one(p.monat), year: one(p.jahr), from: one(p.von), to: one(p.bis) }, now);
    if (!r.ok) return { ok: false, error: r.error };
    range = r.range;
    preset = r.preset;
  }
  if (type === "lieferschein") {
    if (!all && !keys.length) return { ok: false, error: "Bitte mindestens eine Bestellung auswählen." };
    if (all && !range) return { ok: false, error: "Für „alle Filterergebnisse“ fehlt der Zeitraum." };
    if (!all && keys.length > MAX_NOTES_PER_PDF) return { ok: false, error: `Höchstens ${MAX_NOTES_PER_PDF} Lieferscheine auf einmal – bitte die Auswahl verkleinern.` };
    if (!range && keys.length > 5) return { ok: false, error: "Für mehr als 5 Lieferscheine bitte über die Liste mit Zeitraum auswählen." };
    if (mode === "archiv" && (all || keys.length !== 1)) return { ok: false, error: "Eine Archivkopie gibt es nur für einen einzelnen Lieferschein." };
  }
  if (type === "tagesbericht" && range && range.to - range.from > 26 * 3_600_000) return { ok: false, error: "Ein Tagesbericht gilt für genau einen Tag." };
  const remark = typeof p.bemerkung === "string" && p.bemerkung.trim() ? p.bemerkung.trim().slice(0, MAX_REMARK) : undefined;
  return { ok: true, req: { type, mode, range, preset, filters, keys, all, remark, ...(mode === "archiv" ? { version } : {}) } };
}

export type DocResult = { ok: true; file: Buffer; filename: string; inline: boolean; count: number } | { ok: false; status: number; error: string };

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(now: number) {
  const p = berlinParts(now);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}-${pad(p.h)}${pad(p.min)}`;
}
const safeName = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Bestellungen für die Anfrage laden – fail closed: fehlen Daten, gibt es kein Dokument */
async function ordersFor(req: DocRequest, products: Map<string, Product>): Promise<{ ok: true; orders: OfficeOrder[] } | { ok: false; status: number; error: string }> {
  if (req.range) {
    const loaded = await loadOfficeOrders(req.range.from, req.range.to, products);
    if (!loaded.complete) return { ok: false, status: 503, error: `Dokument nicht erstellt, weil Daten fehlen: ${loaded.errors.join(" ")}` };
    const filtered = applyFilters(loaded.orders, req.filters, products);
    if (req.type !== "lieferschein" || req.all) return { ok: true, orders: filtered };
    // Auswahl: nur Bestellungen aus diesem Zeitraum und Filter (keine fremden Schlüssel)
    const byKey = new Map(filtered.map((o) => [o.key, o]));
    const picked = req.keys.map((k) => byKey.get(k));
    if (picked.some((o) => !o)) return { ok: false, status: 409, error: "Mindestens eine ausgewählte Bestellung passt nicht mehr zu Zeitraum und Filter. Bitte die Liste neu laden." };
    return { ok: true, orders: picked as OfficeOrder[] };
  }
  const orders: OfficeOrder[] = [];
  for (const key of req.keys) {
    const r = await loadOfficeOrder(key, products);
    if (r.error) return { ok: false, status: 503, error: r.error };
    if (!r.order) return { ok: false, status: 404, error: "Bestellung nicht gefunden." };
    orders.push(r.order);
  }
  return { ok: true, orders };
}

export async function companyInfo(): Promise<CompanyInfo> {
  return (await getSettings()).company;
}

type Logged = { orders: OfficeOrder[]; notes: string[]; warnings: string[] };

export async function runDocument(req: DocRequest, who: Principal, origin: { ip: string; ua: string }, now = Date.now()): Promise<DocResult> {
  const limit = await hitLimit("officeDocument", who.userId ?? "admin");
  if (!limit.ok) return { ok: false, status: 429, error: "Zu viele Dokumente in kurzer Zeit. Bitte später erneut versuchen." };
  const log: Logged = { orders: [], notes: [], warnings: [] };
  let r: DocResult;
  try {
    r = await buildDocument(req, who, origin, now, log);
  } catch (e) {
    r = { ok: false, status: 500, error: "Das Dokument konnte nicht erstellt werden." };
    await recordActivity(req, who, r, log, now);
    throw e;
  }
  await recordActivity(req, who, r, log, now);
  return r;
}

/** Exporthistorie (Phase 3C): jeder Vorgang, auch fehlgeschlagene – nur Bestell- und Lieferscheinnummern, keine Kundendaten */
async function recordActivity(req: DocRequest, who: Principal, r: DocResult, log: Logged, now: number) {
  const kind = req.type === "lieferschein" ? (log.orders.length > 1 || req.all || (!log.orders.length && req.keys.length > 1) ? "sammeldruck" : "lieferschein") : req.type;
  await logActivity(
    who,
    {
      kind,
      mode: req.mode,
      range: req.range?.label ?? "",
      preset: req.preset,
      filters: req.range ? filterSummaryForLog(req.filters) : "",
      orders: log.orders.length,
      positions: log.orders.reduce((n, o) => n + o.lines.length, 0),
      refs: log.orders.map((o) => o.number),
      ...(log.notes.length ? { notes: log.notes } : {}),
      result: r.ok ? "ok" : "fehler",
      ...(r.ok ? {} : { error: r.error }),
      ...(log.warnings.length ? { warnings: log.warnings } : {}),
    },
    now,
  );
}

async function buildDocument(req: DocRequest, who: Principal, origin: { ip: string; ua: string }, now: number, log: Logged): Promise<DocResult> {
  const products = await productLookup();
  const got = await ordersFor(req, products);
  if (!got.ok) return got;
  let orders = got.orders;
  log.orders = orders;
  const [company, logo] = await Promise.all([companyInfo(), logoImage()]);
  const by = principalLabel(who);
  const inline = req.mode !== "download";
  const filters = describeFilters(req.filters, products);
  // Änderungserkennung: Bestellungen, die nach ihrer Versandfreigabe geändert wurden
  const stale = new Set(orders.filter((o) => changedSinceRelease(o, o.office, products).length).map((o) => o.key));
  if (stale.size) log.warnings.push(`Nach der Versandfreigabe geändert: ${orders.filter((o) => stale.has(o.key)).slice(0, 20).map((o) => o.number).join(", ")}`);
  let file: Buffer;
  let filename: string;
  let detail = "";

  if (req.type === "rechnung") {
    const o = orders[0];
    let stored: Awaited<ReturnType<typeof readInvoice>>;
    try {
      stored = await readInvoice(o.key);
    } catch {
      return { ok: false, status: 503, error: "Der Datenspeicher ist gerade nicht erreichbar. Bitte später erneut versuchen." };
    }
    // Bereits ausgestellt → immer die gespeicherte Fassung; neu → erst prüfen (fail closed)
    if (!stored) {
      const blockers = invoiceBlockers(o, company);
      if (blockers.length) return { ok: false, status: 409, error: `Keine Rechnung erstellt: ${blockers.join(" ")}` };
    }
    if (req.mode === "vorschau") {
      file = invoicePdf(stored ?? { number: null, createdAt: new Date(now).toISOString(), basis: invoiceBasis(o, products, company) }, logo, now);
      detail = stored ? stored.number : "Vorschau";
    } else {
      try {
        stored = await issueInvoice(o, products, company, by, req.mode === "druck" ? "gedruckt" : "heruntergeladen", now);
      } catch {
        console.error("[office] Rechnung konnte nicht gespeichert werden");
        return { ok: false, status: 503, error: "Die Rechnung konnte nicht gespeichert werden (Datenspeicher nicht erreichbar). Es wurde keine Rechnung erstellt." };
      }
      file = invoicePdf(stored, logo, now);
      log.notes = [stored.number];
      detail = stored.number;
    }
    filename = `exstase-rechnung-${safeName(stored?.number ?? `vorschau-${o.number}`)}.pdf`;
  } else if (req.type === "lieferschein" && req.mode === "archiv") {
    // Archivkopie einer früheren Version: unverändert aus der gespeicherten Datenbasis, keine neue Nummer oder Version
    const o = orders[0];
    let note: StoredNote | undefined;
    try {
      note = (await readNotesFor([o.key])).get(o.key);
    } catch {
      return { ok: false, status: 503, error: "Der Datenspeicher ist gerade nicht erreichbar. Bitte später erneut versuchen." };
    }
    const v = note?.versions?.find((x) => x.version === req.version);
    if (!note || !v) return { ok: false, status: 404, error: "Diese Lieferschein-Version ist nicht gespeichert (Lieferscheine aus der Zeit vor Phase 3C haben keine Archivkopie ihrer früheren Fassungen)." };
    const archived = orderFromBasis(o.key, v.basis);
    // Absender wie bei der Ausstellung; ältere Fassungen ohne Momentaufnahme → aktuelle Firmendaten mit Hinweis
    const sellerNote = v.basis.seller ? {} : { issues: ["Archivkopie: Firmenangaben zum Ausstellungszeitpunkt nicht gespeichert – aktuelle Firmendaten gedruckt"] };
    file = deliveryNotesPdf([{ order: archived, note: { number: note.number, version: v.version, createdAt: v.at, remark: v.basis.remark, archive: true, ...(v.basis.seller ? { seller: v.basis.seller } : {}), ...sellerNote } }], company, products, logo, now);
    log.notes = [note.number];
    filename = `exstase-lieferschein-${safeName(note.number)}-v${v.version}-archiv.pdf`;
    detail = `1 Stk · ${note.number} · v${v.version}`;
  } else if (req.type === "lieferschein") {
    // Stornierte Bestellungen bekommen keinen Lieferschein
    orders = orders.filter((o) => o.processing !== "storniert");
    log.orders = orders;
    if (!orders.length) return { ok: false, status: 400, error: "Keine Bestellung für einen Lieferschein (stornierte Bestellungen sind ausgeschlossen)." };
    if (orders.length > MAX_NOTES_PER_PDF) return { ok: false, status: 413, error: `${orders.length} Bestellungen passen – höchstens ${MAX_NOTES_PER_PDF} Lieferscheine auf einmal. Bitte Zeitraum oder Filter eingrenzen.` };
    orders = [...orders].sort((a, b) => a.createdAt - b.createdAt);
    let notes: Map<string, { number: string | null; version: number; createdAt: string; remark: string }>;
    if (req.mode === "vorschau") {
      // Vorschau: nur lesen, keine Nummer vergeben (vorhandene Nummern werden angezeigt)
      let book: Map<string, StoredNote>;
      try {
        book = await readNotesFor(orders.map((o) => o.key));
      } catch {
        return { ok: false, status: 503, error: "Der Datenspeicher ist gerade nicht erreichbar. Bitte später erneut versuchen." };
      }
      const at = new Date(now).toISOString();
      notes = new Map(
        orders.map((o) => {
          const n = book.get(o.key);
          return [o.key, n ? { number: n.number, version: n.version, createdAt: n.createdAt, remark: req.remark ?? n.remark } : { number: null, version: 1, createdAt: at, remark: req.remark ?? "" }];
        }),
      );
    } else {
      try {
        notes = await issueNotes(orders, by, req.mode === "druck" ? "gedruckt" : "heruntergeladen", products, now, req.remark, company);
      } catch {
        console.error("[office] Lieferscheinnummern konnten nicht gespeichert werden");
        return { ok: false, status: 503, error: "Lieferscheinnummern konnten nicht gespeichert werden (Datenspeicher nicht erreichbar). Es wurde kein Lieferschein erstellt." };
      }
    }
    file = deliveryNotesPdf(
      orders.map((o) => {
        const n = notes.get(o.key) ?? { number: null, version: 1, createdAt: new Date(now).toISOString(), remark: "" };
        return { order: o, note: { ...n, ...(stale.has(o.key) ? { issues: ["Bestellung nach der Versandfreigabe geändert – Freigabe prüfen"] } : {}) } };
      }),
      company,
      products,
      logo,
      now,
    );
    const numbers = orders.map((o) => notes.get(o.key)?.number).filter(Boolean) as string[];
    log.notes = numbers;
    filename = orders.length === 1 ? `exstase-lieferschein-${safeName(numbers[0] ?? `vorschau-${orders[0].number}`)}.pdf` : `exstase-lieferscheine-${stamp(now)}${req.mode === "vorschau" ? "-vorschau" : ""}.pdf`;
    detail = `${orders.length} Stk${numbers.length ? ` · ${numbers[0]}${numbers.length > 1 ? ` … ${numbers[numbers.length - 1]}` : ""}` : ""}`;
  } else {
    const range = req.range as Range;
    const ctx = { title: TITLES[req.type], range, filters, createdBy: by, now };
    if (req.type === "versandliste") file = shippingListPdf(orders, ctx, company, products, logo);
    else if (req.type === "sammelliste") file = collectListPdf(orders, ctx, company, products, logo, lineFilter(req.filters, products));
    else file = dailyReportPdf(orders, ctx, company, products, logo);
    filename = `exstase-${req.type}-${stamp(range.from + 12 * 3_600_000).slice(0, 10)}-${stamp(now).slice(11)}.pdf`;
    detail = `${req.preset} · ${orders.length} Best. · ${filterSummaryForLog(req.filters)}`;
  }

  // Protokoll: wer, was, wie viele – keine Kundennamen oder Suchtexte
  await logSecurityEvent("office_document", { ...origin, detail: `${by} · ${req.type} · ${req.mode} · ${detail}` });
  return { ok: true, file, filename, inline, count: orders.length };
}
