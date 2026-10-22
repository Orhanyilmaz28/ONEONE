import { randomBytes } from "node:crypto";
import { listSecurityEvents } from "../admin-security/audit";
import { kv } from "../kv";
import type { Principal } from "./roles";
import { principalLabel } from "./roles";
import { berlinParts } from "./time";

/**
 * Exporthistorie der Büroverwaltung (Phase 3C): jeder Excel-Export und jedes PDF-Dokument – auch fehlgeschlagene.
 * Datensparsam: Bestellnummern ja, aber keine Namen, Adressen, E-Mails, Suchtexte, IP-Adressen oder Geheimnisse.
 * Ablage je Monat als Liste (`tt:office-log:JJJJ-MM`, neueste zuerst, höchstens MAX_PER_MONTH Einträge).
 * Ältere Vorgänge (vor Phase 3C) stehen nur im Sicherheitsprotokoll und werden als „eingeschränkte historische
 * Informationen“ angezeigt. Nur auf dem Server verwenden.
 */
export const ACTIVITY_KINDS = ["excel", "versandliste", "sammelliste", "tagesbericht", "lieferschein", "sammeldruck", "analyse", "rechnung"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  excel: "Excel-Export",
  versandliste: "Versandlisten-PDF",
  sammelliste: "Artikel-Sammelliste",
  tagesbericht: "Tagesbericht",
  lieferschein: "Lieferschein",
  sammeldruck: "Sammeldruck (Lieferscheine)",
  analyse: "Verkaufsanalyse (Excel/PDF)",
  rechnung: "Rechnung",
};

export type Activity = {
  id: string;
  at: string;
  by: string;
  byId: string;
  role: Principal["role"];
  kind: ActivityKind;
  /** Excel: Exportart (z. B. „voll“) · PDF: vorschau/druck/download */
  mode: string;
  /** Lesbarer Zeitraum (z. B. „Oktober 2026“) oder leer bei Einzelauswahl */
  range: string;
  preset: string;
  /** Aktive Filter ohne Kundennamen oder Suchtexte */
  filters: string;
  orders: number;
  positions: number;
  /** Bestellnummern (höchstens MAX_REFS) */
  refs: string[];
  refsTruncated: boolean;
  /** Lieferscheinnummern (nur bei Lieferscheinen) */
  notes?: string[];
  result: "ok" | "fehler";
  error?: string;
  /** Hinweise beim Erstellen (z. B. Bestellungen nach der Freigabe geändert) */
  warnings?: string[];
  /** true = Eintrag aus dem Sicherheitsprotokoll vor Phase 3C (nur Grundangaben) */
  legacy?: boolean;
};

const PREFIX = "tt:office-log:";
export const MAX_PER_MONTH = 20_000;
export const MAX_REFS = 300;

const monthKey = (ms: number) => {
  const p = berlinParts(ms);
  return `${PREFIX}${p.y}-${String(p.m).padStart(2, "0")}`;
};
export const newActivityId = () => `V-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
const clip = (v: string, max: number) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, max);

export type ActivityInput = Omit<Activity, "id" | "at" | "by" | "byId" | "role" | "refs" | "refsTruncated" | "legacy"> & { refs: string[]; id?: string };

/** Vorgang festhalten. Ein Fehler beim Protokollieren bricht den Vorgang nicht ab (wird aber in den Server-Logs vermerkt). */
export async function logActivity(who: Principal, a: ActivityInput, now = Date.now()): Promise<Activity> {
  const refs = [...new Set(a.refs)];
  const entry: Activity = {
    ...a,
    id: a.id ?? newActivityId(),
    at: new Date(now).toISOString(),
    by: principalLabel(who),
    byId: who.userId ?? "admin",
    role: who.role,
    range: clip(a.range, 80),
    preset: clip(a.preset, 30),
    filters: clip(a.filters, 200),
    refs: refs.slice(0, MAX_REFS),
    refsTruncated: refs.length > MAX_REFS,
    ...(a.notes ? { notes: a.notes.slice(0, MAX_REFS) } : {}),
    ...(a.error ? { error: clip(a.error, 300) } : {}),
    ...(a.warnings?.length ? { warnings: a.warnings.slice(0, 20).map((w) => clip(w, 200)) } : {}),
  };
  try {
    await kv().lpushTrim(monthKey(now), JSON.stringify(entry), MAX_PER_MONTH);
    await markHistoryStart(now);
  } catch {
    console.error("[office] Exporthistorie konnte nicht geschrieben werden", a.kind);
  }
  return entry;
}

/** Monate (Schlüssel) zwischen from und to (einschließlich) – höchstens die letzten 24 bis `to` */
function monthsBetween(from: number, to: number): string[] {
  const a = berlinParts(from);
  const b = berlinParts(Math.max(from, to - 1));
  const out: string[] = [];
  let y = b.y;
  let m = b.m;
  while ((y > a.y || (y === a.y && m >= a.m)) && out.length < 24) {
    out.push(`${PREFIX}${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return out;
}

const parse = (raw: string): Activity[] => {
  try {
    const v = JSON.parse(raw) as Activity;
    return v && typeof v.id === "string" && typeof v.at === "string" ? [v] : [];
  } catch {
    return [];
  }
};

/** Alte Einträge (Sicherheitsprotokoll, Phase 3A/3B) in die Form der Historie bringen – nur was dort steht */
export function legacyFromAudit(e: { at: string; type: string; detail?: string }): Activity | null {
  if (e.type !== "office_export" && e.type !== "office_document") return null;
  const parts = (e.detail ?? "").split(" · ");
  const by = parts[0] ?? "";
  const count = (s: string | undefined) => {
    const m = /^(\d+) (Best\.|Stk)/.exec(s ?? "");
    return m ? Number(m[1]) : 0;
  };
  const base = { id: `alt-${Date.parse(e.at).toString(36)}`, at: e.at, by, byId: "", role: (by.startsWith("Administrator") ? "admin" : by.includes("Lesezugriff") ? "lesen" : "buero") as Principal["role"], positions: 0, refs: [], refsTruncated: false, result: "ok" as const, legacy: true };
  if (e.type === "office_export") return { ...base, kind: "excel", mode: parts[1] ?? "", range: "", preset: parts[2] ?? "", filters: parts.slice(4).join(" · "), orders: count(parts[3]) };
  const t = parts[1] ?? "";
  const kind: ActivityKind = t === "lieferschein" ? (count(parts[3]) > 1 ? "sammeldruck" : "lieferschein") : (ACTIVITY_KINDS as readonly string[]).includes(t) ? (t as ActivityKind) : "versandliste";
  if (t === "lieferschein") {
    const nums = (parts[4] ?? "").split(" … ").filter((x) => /^LS-\d{4}-\d+$/.test(x));
    return { ...base, kind, mode: parts[2] ?? "", range: "", preset: "", filters: "", orders: count(parts[3]), notes: nums };
  }
  return { ...base, kind, mode: parts[2] ?? "", range: "", preset: parts[3] ?? "", filters: parts.slice(5).join(" · "), orders: count(parts[4]) };
}

/**
 * Historie in [from, to) lesen (neueste zuerst). Wirft bei Speicherausfall (die Seite zeigt dann einen Hinweis statt
 * einer leeren Liste). Alte Einträge aus dem Sicherheitsprotokoll werden nur ergänzt, wenn sie älter sind als der
 * älteste neue Eintrag (so erscheint nichts doppelt).
 */
export async function listActivities(from: number, to: number): Promise<Activity[]> {
  const months = monthsBetween(from, to);
  const lists = await Promise.all(months.map((k) => kv().lrange(k, 0, MAX_PER_MONTH - 1)));
  const current = lists.flat().flatMap(parse);
  const oldestNew = await oldestActivity();
  const legacy = (await listSecurityEvents(500))
    .map(legacyFromAudit)
    .filter((x): x is Activity => Boolean(x))
    .filter((x) => oldestNew === null || Date.parse(x.at) < oldestNew);
  return [...current, ...legacy].filter((a) => Date.parse(a.at) >= from && Date.parse(a.at) < to).sort((a, b) => b.at.localeCompare(a.at));
}

/** Zeitpunkt des ältesten neuen Eintrags (Beginn der vollständigen Historie) – gespeichert beim ersten Eintrag */
const START_KEY = "tt:office-log-start";
async function oldestActivity(): Promise<number | null> {
  const v = await kv().get(START_KEY);
  return v ? Number(v) : null;
}
/** Beginn der vollständigen Historie einmalig festhalten (nx: wird nie überschrieben) */
export async function markHistoryStart(now = Date.now()) {
  try {
    await kv().set(START_KEY, String(now), { nx: true });
  } catch {
    // nur eine Hilfe für die Anzeige alter Einträge
  }
}

/** Einen Eintrag über seine ID finden (sucht in den letzten 24 Monaten) */
export async function findActivity(id: string, now = Date.now()): Promise<Activity | null> {
  if (!/^(V-[A-Z0-9]{4,20}-[0-9A-F]{8}|alt-[a-z0-9]{4,20})$/.test(id)) return null;
  const list = await listActivities(now - 730 * 86_400_000, now + 86_400_000);
  return list.find((a) => a.id === id) ?? null;
}

export type HistoryFilter = { user: string; kind: ActivityKind | ""; result: "" | "ok" | "fehler"; order: string };

export function filterActivities(list: Activity[], f: HistoryFilter): Activity[] {
  const order = f.order.replace(/\s+/g, "").toUpperCase();
  return list.filter(
    (a) =>
      (!f.user || a.by === f.user) &&
      (!f.kind || a.kind === f.kind || (f.kind === "lieferschein" && a.kind === "sammeldruck")) &&
      (!f.result || a.result === f.result) &&
      (!order || a.refs.some((r) => r.toUpperCase().includes(order)) || (a.notes ?? []).some((n) => n.toUpperCase().includes(order))),
  );
}
