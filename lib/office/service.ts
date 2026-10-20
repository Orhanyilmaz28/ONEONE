import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { logSecurityEvent } from "../admin-security/audit";
import { hitLimit } from "../admin-security/rate-limit";
import { SITE_URL } from "../format";
import { KEYS, updateJSON } from "../store";
import type { Product } from "../types";
import { type ExportType, EXPORT_TYPES, buildSheets, exportFilename, exportLabel, isExportType } from "./export";
import { type Filters, applyFilters, describeFilters, filterSummaryForLog, parseFilters } from "./filters";
import type { OfficeOrder } from "./model";
import { type Principal, principalLabel } from "./roles";
import { loadOfficeOrders } from "./source";
import { type Range, resolveRange } from "./time";
import { buildXlsx } from "./xlsx";

/**
 * Ablauf eines Excel-Exports (nur auf dem Server): Zeitraum + Filter auflösen, ALLE passenden Bestellungen laden,
 * Vorschau oder Datei erzeugen, exportierte Bestellungen vermerken und die Aktion protokollieren.
 * Fehlen Daten (Stripe oder Redis nicht erreichbar), wird kein Export erzeugt – lieber keiner als ein unvollständiger.
 */
export type ExportRequest = { type: ExportType; range: Range; filters: Filters; preset: string };
export type ParsedRequest = { ok: true; req: ExportRequest } | { ok: false; error: string };

export function parseExportRequest(p: Record<string, string | undefined>, now: number): ParsedRequest {
  const type = isExportType(p.art) ? p.art : "voll";
  const r = resolveRange({ preset: p.zeitraum, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  if (!r.ok) return { ok: false, error: r.error };
  const filters = parseFilters(p);
  // Händler-/Privatexport: Kundenart ist durch die Exportart festgelegt
  if (type === "haendler") filters.channel = "haendler";
  if (type === "privat") filters.channel = "privat";
  return { ok: true, req: { type, range: r.range, filters, preset: r.preset } };
}

export type Prepared = { orders: OfficeOrder[]; products: Map<string, Product>; complete: boolean; errors: string[]; source: string };

export async function prepare(req: ExportRequest): Promise<Prepared> {
  const products = await productLookup();
  const loaded = await loadOfficeOrders(req.range.from, req.range.to, products);
  return { orders: applyFilters(loaded.orders, req.filters, products), products, complete: loaded.complete, errors: loaded.errors, source: loaded.source };
}

export type Preview = { range: string; filters: string[]; orders: number; lines: number; format: string; sheets: string[]; complete: boolean; errors: string[]; typeLabel: string };

export async function preview(req: ExportRequest): Promise<Preview> {
  const p = await prepare(req);
  return {
    range: req.range.label,
    filters: describeFilters(req.filters, p.products),
    orders: p.orders.length,
    lines: p.orders.reduce((n, o) => n + o.lines.length, 0),
    format: "Excel-Datei (.xlsx)",
    sheets: [...(EXPORT_TYPES.find((t) => t.key === req.type)?.sheets ?? [])],
    complete: p.complete,
    errors: p.errors,
    typeLabel: exportLabel(req.type),
  };
}

type Marks = Record<string, { first: string; last: string; count: number }>;
/** Obergrenze der Export-Vermerke (älteste fallen zuerst weg) */
const MAX_MARKS = 50_000;

/** Vermerkt, dass diese Bestellungen exportiert wurden (eigener Schlüssel – die Bestellungen selbst bleiben unverändert) */
export async function markExported(keys: string[], at: string) {
  if (!keys.length) return;
  await updateJSON<Marks>(KEYS.officeExported, {}, (all) => {
    const next: Marks = { ...(all ?? {}) };
    for (const k of keys) {
      const m = next[k];
      next[k] = m ? { ...m, last: at, count: m.count + 1 } : { first: at, last: at, count: 1 };
    }
    const entries = Object.entries(next);
    if (entries.length <= MAX_MARKS) return next;
    return Object.fromEntries(entries.sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, MAX_MARKS));
  });
}

export type ExportResult = { ok: true; file: Buffer; filename: string; orders: number } | { ok: false; status: number; error: string };

export async function runExport(req: ExportRequest, who: Principal, origin: { ip: string; ua: string }, now = Date.now()): Promise<ExportResult> {
  const limit = await hitLimit("officeExport", who.userId ?? "admin");
  if (!limit.ok) return { ok: false, status: 429, error: "Zu viele Exporte in kurzer Zeit. Bitte später erneut versuchen." };
  const p = await prepare(req);
  if (!p.complete) return { ok: false, status: 503, error: `Export abgebrochen, weil Daten fehlen: ${p.errors.join(" ")}` };
  const sheets = buildSheets(req.type, p.orders, { range: req.range, filters: describeFilters(req.filters, p.products), createdBy: principalLabel(who), now, siteUrl: SITE_URL, products: p.products });
  const file = buildXlsx(sheets, { title: `${exportLabel(req.type)} – ${req.range.label}`, created: new Date(now) });
  const at = new Date(now).toISOString();
  try {
    await markExported(
      p.orders.map((o) => o.key),
      at,
    );
  } catch {
    // Vermerk ist nur eine Hilfe – der Export selbst ist trotzdem gültig
    console.error("[office] Export-Vermerk konnte nicht gespeichert werden");
  }
  // Protokoll: wer, was, Zeitraum, Anzahl – keine Kundennamen oder Suchtexte
  await logSecurityEvent("office_export", { ...origin, detail: `${principalLabel(who)} · ${req.type} · ${req.preset} · ${p.orders.length} Best. · ${filterSummaryForLog(req.filters)}` });
  return { ok: true, file, filename: exportFilename(req.type, now), orders: p.orders.length };
}
