import { randomBytes } from "node:crypto";
import { logSecurityEvent } from "../admin-security/audit";
import type { DealerOrder } from "../dealer-orders";
import { kv } from "../kv";
import type { OrderMeta } from "../orders";
import { KEYS, WriteConflictError, getJSONStrict, getManyJSONStrict, updateJSON } from "../store";
import type { Product } from "../types";
import type { OfficeOrder } from "./model";
import { type Principal, principalLabel } from "./roles";
import { type ActionInput, type ActionResult, type Actor, CONFLICT_MESSAGE, type WfAction, type WfRecord, applyAction, berlinDay, markSynced } from "./workflow";

/**
 * Speicher des Büro-Arbeitsablaufs: ein eigener Eintrag je Bestellung (`tt:office-wf:<Bestellung>`), atomar geändert.
 * Bestellungen, Zahlungen und Rechnungen bleiben unverändert – einzige Ausnahme ist „Als versendet markieren“: dann
 * werden Status „versendet“, Sendungsnummer und Versanddienst über die bestehenden Funktionen in die Originalbestellung
 * übernommen (Privat: wie im Dashboard „Bestellungen“; Händler: Status wie unter „Händler → Bestellungen“).
 * Dabei wird keine E-Mail verschickt und keine Benachrichtigung ausgelöst. Nur auf dem Server verwenden.
 */
export const wfKey = (orderKey: string) => `tt:office-wf:${orderKey}`;
const BULK_PREFIX = "tt:office-bulk:";
export const MAX_BULK = 50;

/** Bearbeitungsstände dieser Bestellungen (strikt: bei Speicherausfall Fehler statt „neu“) */
export async function readWorkflows(orderKeys: string[]): Promise<Map<string, WfRecord>> {
  const raw = await getManyJSONStrict<WfRecord>(orderKeys.map(wfKey));
  const out = new Map<string, WfRecord>();
  orderKeys.forEach((k, i) => {
    const r = raw[i];
    if (r && r.key === k) out.set(k, r);
  });
  return out;
}

/** Bearbeitungsstand an die Bestellungen hängen (o.office). Liefert false, wenn er nicht gelesen werden konnte. */
export async function attachWorkflows(orders: OfficeOrder[]): Promise<boolean> {
  try {
    const map = await readWorkflows(orders.map((o) => o.key));
    for (const o of orders) o.office = map.get(o.key) ?? null;
    return true;
  } catch {
    return false;
  }
}

export const actorOf = (who: Principal): Actor => ({ role: who.role, label: principalLabel(who), id: who.userId ?? "admin" });

class Rejected extends Error {
  constructor(public result: ActionResult) {
    super("rejected");
  }
}

export type RunOutcome = ActionResult | { ok: false; code: "store"; error: string };

/** Heutiges Datum in Berlin (JJJJ-MM-TT) */
export function berlinToday(now: number) {
  return berlinDay(now);
}

/**
 * Eine Aktion für eine (frisch geladene) Bestellung ausführen – atomar gegen gleichzeitige Änderungen.
 * Bei „versendet“ wird danach die Originalbestellung abgeglichen; schlägt das fehl, bleibt ein Hinweis mit
 * „Erneut übertragen“ stehen (nichts geht verloren, nichts wird doppelt eingetragen).
 */
export async function runWorkflowAction(o: OfficeOrder, input: ActionInput, who: Principal, products: Map<string, Product>, origin: { ip: string; ua: string }, now = Date.now()): Promise<RunOutcome> {
  const actor = actorOf(who);
  const full: ActionInput = { ...input, today: berlinToday(now) };
  let result: ActionResult | null = null;
  try {
    await updateJSON<WfRecord | null>(wfKey(o.key), null, (cur) => {
      const r = applyAction(cur && cur.key === o.key ? cur : null, o, full, actor, now, products);
      if (!r.ok) throw new Rejected(r);
      result = r;
      return r.duplicate ? cur : r.rec;
    });
  } catch (e) {
    if (e instanceof Rejected) return e.result;
    if (e instanceof WriteConflictError) return { ok: false, code: "conflict", error: CONFLICT_MESSAGE };
    console.error("[office] Bürostatus konnte nicht gespeichert werden");
    return { ok: false, code: "store", error: "Der Datenspeicher ist gerade nicht erreichbar. Es wurde nichts geändert." };
  }
  const r = result as unknown as ActionResult & { ok: true };
  if (!r.duplicate && r.event) {
    await logSecurityEvent("office_workflow", { ...origin, detail: `${actor.label} · ${o.number} · ${r.event.action} · ${r.event.from}→${r.event.to}` });
  }
  if (r.shipmentChanged && r.rec.shipment) {
    const synced = await syncShipment(o, r.rec, now);
    return { ...r, rec: synced };
  }
  return r;
}

/**
 * Versand in die Originalbestellung übernehmen (keine E-Mail). Prüfung und Schreiben passieren in EINEM atomaren
 * Schritt (updateJSON): wird die Bestellung zwischendurch storniert, wird der Schritt mit dem frischen Stand
 * wiederholt und bricht dann ab – eine Stornierung wird nie überschrieben.
 */
async function pushShipment(o: OfficeOrder, rec: WfRecord): Promise<string | null> {
  const s = rec.shipment;
  if (!s) return "Keine Versanddaten.";
  const id = o.key.slice(2);
  let problem: string | null = null;
  try {
    if (o.key.startsWith("s:")) {
      await updateJSON<Record<string, OrderMeta>>(KEYS.orders, {}, (all) => {
        problem = null; // bei Wiederholung nach Konflikt neu bestimmen
        const cur = all?.[id];
        if (cur?.status === "storniert") {
          problem = "Die Bestellung wurde inzwischen storniert.";
          return all;
        }
        if (cur?.tracking && s.tracking && cur.tracking.replace(/\s+/g, "").toUpperCase() !== s.tracking) {
          problem = `In der Bestellung steht inzwischen eine andere Sendungsnummer (${cur.tracking}).`;
          return all;
        }
        const updatedAt = new Date().toISOString();
        if (cur?.status === "versendet" || cur?.status === "erledigt") {
          // schon versendet: nur fehlende Angaben ergänzen, Status nicht zurücksetzen
          return !cur.tracking && s.tracking ? { ...all, [id]: { ...cur, tracking: s.tracking, carrier: s.carrier, updatedAt } } : all;
        }
        const patch: Partial<OrderMeta> = { status: "versendet", ...(s.tracking ? { tracking: s.tracking } : {}), carrier: s.carrier, shippedAt: `${s.date}T10:00:00.000Z` };
        return { ...all, [id]: { ...(cur ?? { status: "offen" }), ...patch, updatedAt } as OrderMeta };
      });
      return problem;
    }
    await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (all) => {
      problem = null;
      const list = Array.isArray(all) ? all : [];
      const cur = list.find((x) => x.id === id);
      if (!cur) {
        problem = "Händlerbestellung nicht gefunden.";
        return all;
      }
      if (cur.status === "storniert") {
        problem = "Die Bestellung wurde inzwischen storniert.";
        return all;
      }
      if (cur.status === "versendet") return all;
      return list.map((x) => (x.id === id ? { ...x, status: "versendet" as const, history: [...x.history, { status: "versendet" as const, at: new Date().toISOString() }] } : x));
    });
    return problem;
  } catch {
    return "Die Originalbestellung konnte gerade nicht aktualisiert werden (Datenspeicher nicht erreichbar).";
  }
}

export async function syncShipment(o: OfficeOrder, rec: WfRecord, now = Date.now()): Promise<WfRecord> {
  const op = rec.shipment?.op ?? "";
  const error = await pushShipment(o, rec);
  let out = rec;
  try {
    out = await updateJSON<WfRecord | null>(wfKey(o.key), null, (cur) => (cur ? markSynced(cur, op, error, now) : cur)) ?? rec;
  } catch {
    console.error("[office] Versand-Abgleich konnte nicht vermerkt werden");
  }
  return out;
}

/** „Erneut übertragen“ für eine im Büro erfasste, noch nicht übernommene Sendung */
export async function retrySync(o: OfficeOrder, rec: WfRecord, now = Date.now()) {
  if (!rec.shipment || rec.shipment.synced) return rec;
  return syncShipment(o, rec, now);
}

/* ───────────── Sammelaktionen ───────────── */

export type BulkItem = { key: string; number: string; ok: boolean; message: string; duplicate?: boolean };
export type BulkResult = { id: string; at: string; byId: string; action: WfAction; results: BulkItem[] };

export const newBulkId = () => randomBytes(9).toString("base64url");

export async function saveBulkResult(r: BulkResult) {
  try {
    await kv().set(BULK_PREFIX + r.id, JSON.stringify(r), { ex: 3600 });
  } catch {
    console.error("[office] Ergebnis der Sammelaktion konnte nicht gespeichert werden");
  }
}

export async function readBulkResult(id: string, who: Principal): Promise<BulkResult | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  try {
    const raw = await kv().get(BULK_PREFIX + id);
    if (!raw) return null;
    const r = JSON.parse(raw) as BulkResult;
    return r.byId === (who.userId ?? "admin") ? r : null;
  } catch {
    return null;
  }
}
