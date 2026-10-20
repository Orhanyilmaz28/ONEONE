import { randomBytes } from "node:crypto";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { hitLimit } from "../admin-security/rate-limit";
import type { Product } from "../types";
import type { OfficeOrder } from "./model";
import type { Principal } from "./roles";
import { loadOfficeOrder } from "./source";
import { ACTIONS, ACTION_LABEL, type ActionInput, CORRECTION_TARGETS, MAX_REASON, OFFICE_STATUS_LABEL, type OfficeStatus, type WfAction, type WfRecord, isOpId, officeStatus } from "./workflow";
import { type BulkItem, MAX_BULK, type RunOutcome, newBulkId, readWorkflows, retrySync, runWorkflowAction, saveBulkResult } from "./workflow-store";

/**
 * Formulare des Büro-Arbeitsablaufs prüfen und ausführen (nur auf dem Server).
 * Jede Bestellung wird vor der Aktion frisch geladen (Stripe bzw. Datenspeicher), damit Prüfungen auf dem aktuellen Stand beruhen.
 */
export const KEY_RE = /^(s:cs_[A-Za-z0-9_]{6,200}|h:[0-9a-f]{8,64})$/;
/** Aktionen, die als Sammelaktion erlaubt sind */
export const BULK_ACTIONS = ["pruefen", "freigeben", "logistik"] as const satisfies readonly WfAction[];
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const BULK_LABEL: Record<BulkAction, string> = { pruefen: "In Prüfung nehmen", freigeben: "Für Versand freigeben", logistik: "Als an Logistik weitergegeben markieren" };

export const newOpId = () => randomBytes(12).toString("base64url");

type Input = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const text = (v: string | string[] | undefined, max = MAX_REASON) => one(v).slice(0, max);

export type ParsedSingle = { ok: true; key: string; input: ActionInput; retrySync: boolean } | { ok: false; error: string };

export function parseActionForm(p: Input): ParsedSingle {
  const key = one(p.bestellung);
  if (!KEY_RE.test(key)) return { ok: false, error: "Ungültige Bestellung." };
  const op = one(p.vorgang);
  if (!isOpId(op)) return { ok: false, error: "Ungültige Anfrage. Bitte die Seite neu laden." };
  const rev = Number(one(p.stand));
  if (!Number.isInteger(rev) || rev < 0 || rev > 1_000_000) return { ok: false, error: "Ungültige Anfrage. Bitte die Seite neu laden." };
  const raw = one(p.aktion);
  if (raw === "versand_abgleichen") return { ok: true, key, retrySync: true, input: { action: "versendet", rev, op } };
  const action = ACTIONS.find((a) => a === raw);
  if (!action) return { ok: false, error: "Unbekannte Aktion." };
  const target = CORRECTION_TARGETS.find((t) => t === one(p.ziel)) as OfficeStatus | undefined;
  const fp = one(p.fp);
  return {
    ok: true,
    key,
    retrySync: false,
    input: {
      action,
      rev,
      op,
      reason: text(p.grund),
      remark: text(p.bemerkung),
      ack: one(p.hinweise) === "1",
      confirm: one(p.bestaetigt) === "1",
      ...(/^[0-9a-f]{16}$/.test(fp) ? { fp } : {}),
      ...(target ? { target } : {}),
      ...(action === "versendet" ? { shipment: { carrier: text(p.versanddienst, 40), tracking: text(p.sendungsnummer, 60), date: text(p.versanddatum, 10), remark: text(p.versandbemerkung) } } : {}),
    },
  };
}

export async function runSingle(parsed: Extract<ParsedSingle, { ok: true }>, who: Principal, origin: { ip: string; ua: string }, now = Date.now()): Promise<RunOutcome & { order?: OfficeOrder }> {
  const limit = await hitLimit("officeWorkflow", who.userId ?? "admin");
  if (!limit.ok) return { ok: false, code: "invalid", error: "Zu viele Bearbeitungsschritte in kurzer Zeit. Bitte später erneut versuchen." };
  const products = await productLookup();
  const { order, error } = await loadOfficeOrder(parsed.key, products);
  if (error) return { ok: false, code: "store", error };
  if (!order) return { ok: false, code: "invalid", error: "Bestellung nicht gefunden." };
  if (parsed.retrySync) {
    let rec: WfRecord | undefined;
    try {
      rec = (await readWorkflows([order.key])).get(order.key);
    } catch {
      return { ok: false, code: "store", error: "Der Datenspeicher ist gerade nicht erreichbar." };
    }
    if (!rec?.shipment) return { ok: false, code: "invalid", error: "Für diese Bestellung wurde im Büro kein Versand erfasst." };
    if (rec.rev !== parsed.input.rev) return { ok: false, code: "conflict", error: "Diese Bestellung wurde zwischenzeitlich geändert. Bitte aktualisieren." };
    const next = await retrySync(order, rec, now);
    return next.shipment?.synced ? { ok: true, rec: next, duplicate: false, shipmentChanged: true, order } : { ok: false, code: "invalid", error: next.shipment?.syncError ?? "Übertragung fehlgeschlagen." };
  }
  const r = await runWorkflowAction(order, parsed.input, who, products, origin, now);
  return { ...r, order };
}

/* ───────────── Sammelaktionen ───────────── */

export type ParsedBulk = { ok: true; action: BulkAction; op: string; items: { key: string; rev: number; fp?: string }[]; ack: boolean; confirm: boolean; reason: string; remark: string; back: string } | { ok: false; error: string };

export function parseBulkForm(p: Input): ParsedBulk {
  const action = BULK_ACTIONS.find((a) => a === one(p.aktion));
  if (!action) return { ok: false, error: "Diese Aktion gibt es nicht als Sammelaktion." };
  const op = one(p.vorgang);
  if (!isOpId(op)) return { ok: false, error: "Ungültige Anfrage. Bitte die Seite neu laden." };
  const raw = Array.isArray(p.eintrag) ? p.eintrag : p.eintrag ? [p.eintrag] : [];
  if (!raw.length) return { ok: false, error: "Keine Bestellung ausgewählt." };
  if (raw.length > MAX_BULK) return { ok: false, error: `Höchstens ${MAX_BULK} Bestellungen auf einmal.` };
  const items: { key: string; rev: number; fp?: string }[] = [];
  for (const e of raw) {
    const [key, rev, fp] = e.split("|");
    if (!KEY_RE.test(key) || !/^\d{1,7}$/.test(rev ?? "") || (fp && !/^[0-9a-f]{16}$/.test(fp))) return { ok: false, error: "Ungültige Auswahl." };
    if (!items.some((x) => x.key === key)) items.push({ key, rev: Number(rev), ...(fp ? { fp } : {}) });
  }
  const back = one(p.zurueck);
  return { ok: true, action, op, items, ack: one(p.hinweise) === "1", confirm: one(p.bestaetigt) === "1", reason: text(p.grund), remark: text(p.bemerkung), back: /^\/admin\/buero(\/[a-z0-9-]+){0,2}$/.test(back) ? back : "/admin/buero/bestellungen" };
}

/**
 * Sammelaktion: jede Bestellung einzeln geladen, geprüft und atomar geändert. Ein Fehler bei einer Bestellung hält die
 * anderen nicht auf; das Ergebnis nennt für jede Bestellung genau, was passiert ist. Gleiche Vorgangs-ID = nichts doppelt.
 */
export async function runBulk(b: Extract<ParsedBulk, { ok: true }>, who: Principal, origin: { ip: string; ua: string }, now = Date.now()): Promise<{ ok: true; id: string; results: BulkItem[] } | { ok: false; error: string }> {
  const limit = await hitLimit("officeWorkflow", who.userId ?? "admin");
  if (!limit.ok) return { ok: false, error: "Zu viele Bearbeitungsschritte in kurzer Zeit. Bitte später erneut versuchen." };
  if (!b.confirm) return { ok: false, error: "Bitte die Sammelaktion ausdrücklich bestätigen." };
  const products: Map<string, Product> = await productLookup();
  const results: BulkItem[] = [];
  for (const item of b.items) {
    const { order, error } = await loadOfficeOrder(item.key, products);
    if (error || !order) {
      results.push({ key: item.key, number: "", ok: false, message: error ?? "Bestellung nicht gefunden." });
      continue;
    }
    const r = await runWorkflowAction(order, { action: b.action, rev: item.rev, op: b.op, ack: b.ack, confirm: true, fp: item.fp, reason: b.reason, remark: b.remark }, who, products, origin, now);
    if (r.ok) results.push({ key: item.key, number: order.number, ok: true, duplicate: r.duplicate, message: r.duplicate ? "Bereits erledigt (dieser Vorgang wurde schon ausgeführt)." : `${ACTION_LABEL[b.action]} – jetzt „${officeLabel(order, r.rec)}“.` });
    else results.push({ key: item.key, number: order.number, ok: false, message: [r.error, ...("blockers" in r && r.blockers ? r.blockers : [])].join(" ") });
  }
  const id = newBulkId();
  await saveBulkResult({ id, at: new Date(now).toISOString(), byId: who.userId ?? "admin", action: b.action, results });
  return { ok: true, id, results };
}

const officeLabel = (o: OfficeOrder, rec: WfRecord) => OFFICE_STATUS_LABEL[officeStatus(o, rec)];
