import { randomBytes } from "node:crypto";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { SITE_URL } from "../format";
import { kv } from "../kv";
import { sendMail } from "../mail";
import { reportIncident } from "../monitoring/signal";
import { getJSONStrict, updateJSON } from "../store";
import type { Product } from "../types";
import { type Activity, listActivities } from "./activity";
import {
  type AutomationConfig,
  DEFAULT_CONFIG,
  type Notice,
  REPORT_DOC,
  type ReportSchedule,
  type ReportSummary,
  digestText,
  dueSchedules,
  forChannel,
  normalizeConfig,
  notifications,
  reminders,
  reportText,
  summarize,
} from "./automation";
import { collectListPdf, dailyReportPdf, shippingListPdf } from "./documents";
import { companyInfo } from "./documents-service";
import { logoImage } from "./logo";
import { loadOfficeOrders } from "./source";
import { type Range, berlinParts } from "./time";

/**
 * Büroautomatisierung – Speicher und Ausführung (nur auf dem Server).
 *
 * Schlüssel: tt:office-auto:config (Einstellungen) · tt:office-auto:state (letzter Lauf) · tt:office-auto:run:<Termin>
 * (Lauf-Sperre je Termin, 40 Tage) · tt:office-auto:try:<Termin> (Versuche) · tt:office-auto:sent:<ID> (schon gemeldet,
 * 14 Tage) · tt:office-reports:JJJJ-MM (Berichtshistorie, neueste zuerst).
 *
 * Berichte werden nicht als Datei gespeichert (nur Kennzahlen und Zeitraum). „PDF ansehen“ erzeugt das Dokument über den
 * geschützten Dokument-Endpunkt neu – mit Rechteprüfung und Protokoll. Keine Kundendaten in Historie oder E-Mails.
 */
export const CONFIG_KEY = "tt:office-auto:config";
const STATE_KEY = "tt:office-auto:state";
const RUN_PREFIX = "tt:office-auto:run:";
const TRY_PREFIX = "tt:office-auto:try:";
const SENT_PREFIX = "tt:office-auto:sent:";
const REPORT_PREFIX = "tt:office-reports:";
export const MAX_ATTEMPTS = 3;
const MAX_REPORTS_PER_MONTH = 3000;

/** E-Mail-Versand nur mit ausdrücklicher Freigabe (Vercel-Variable OFFICE_REPORT_EMAILS=1) */
export const reportEmailsEnabled = () => process.env.OFFICE_REPORT_EMAILS === "1";

export type ReportEntry = {
  id: string;
  at: string;
  kind: "bericht" | "zusammenfassung";
  scheduleId: string;
  name: string;
  type: ReportSchedule["type"] | "zusammenfassung";
  channel: ReportSchedule["channel"];
  range: Range;
  trigger: "zeitplan" | "manuell";
  status: "ok" | "fehler" | "unvollstaendig";
  error?: string;
  attempt?: number;
  summary?: ReportSummary;
  /** Anzahl Hinweise in der Zusammenfassung */
  items?: number;
  pdfBytes?: number;
  mail: "aus" | "keine_empfaenger" | "versendet" | "fehler";
  mailInfo?: string;
  by: string;
  durationMs: number;
};

export type AutomationState = { lastRunAt: string; trigger: string; ran: number; failed: number; skipped: number; lastError?: string; lastDigestAt?: string };

/* ───────────── Speicher ───────────── */

export async function getConfig(): Promise<AutomationConfig> {
  return normalizeConfig(await getJSONStrict<unknown>(CONFIG_KEY, DEFAULT_CONFIG));
}

export async function saveConfig(change: (cur: AutomationConfig) => AutomationConfig): Promise<AutomationConfig> {
  let out = DEFAULT_CONFIG;
  await updateJSON<unknown>(CONFIG_KEY, DEFAULT_CONFIG, (raw) => {
    out = normalizeConfig(change(normalizeConfig(raw)));
    return out;
  });
  return out;
}

export async function getState(): Promise<AutomationState | null> {
  const raw = await kv().get(STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AutomationState;
  } catch {
    return null;
  }
}

const monthKey = (ms: number) => {
  const p = berlinParts(ms);
  return `${REPORT_PREFIX}${p.y}-${String(p.m).padStart(2, "0")}`;
};

async function saveReport(e: ReportEntry, now: number) {
  try {
    await kv().lpushTrim(monthKey(now), JSON.stringify(e), MAX_REPORTS_PER_MONTH);
  } catch {
    console.error("[office] Berichtshistorie konnte nicht geschrieben werden");
  }
}

/** Berichtshistorie der letzten `months` Monate (neueste zuerst). Wirft bei Speicherausfall. */
export async function listReports(now = Date.now(), months = 12): Promise<ReportEntry[]> {
  const p = berlinParts(now);
  const keys: string[] = [];
  let y = p.y;
  let m = p.m;
  for (let i = 0; i < months; i++) {
    keys.push(`${REPORT_PREFIX}${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  const lists = await Promise.all(keys.map((k) => kv().lrange(k, 0, MAX_REPORTS_PER_MONTH - 1)));
  return lists
    .flat()
    .flatMap((raw) => {
      try {
        const v = JSON.parse(raw) as ReportEntry;
        return v && typeof v.id === "string" ? [v] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function findReport(id: string, now = Date.now()) {
  if (!/^B-[A-Z0-9]{4,20}-[0-9A-F]{8}$/.test(id)) return null;
  return (await listReports(now)).find((r) => r.id === id) ?? null;
}

const newReportId = () => `B-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;

/** Wurde dieser Hinweis schon gemeldet? Markiert ihn zugleich (atomar, 14 Tage) – so wird nichts doppelt gemeldet. */
export async function filterUnsent(items: Notice[]): Promise<Notice[]> {
  const out: Notice[] = [];
  for (const i of items) {
    const fresh = await kv().set(SENT_PREFIX + i.id.slice(0, 160), "1", { ex: 14 * 86_400, nx: true });
    if (fresh) out.push(i);
  }
  return out;
}

/* ───────────── Ausführung ───────────── */

export type RunDeps = {
  now: number;
  products?: Map<string, Product>;
  /** Für Tests: E-Mail-Versand ersetzen */
  send?: typeof sendMail;
  /** Für Tests: Bestellungen laden ersetzen */
  load?: typeof loadOfficeOrders;
};

const officeLink = `${SITE_URL}/admin/buero/berichte`;

/** PDF erzeugen, um zu prüfen, dass der Bericht vollständig entsteht (Größe wird vermerkt, Datei nicht gespeichert) */
async function renderPdf(s: Pick<ReportSchedule, "type" | "name">, orders: Awaited<ReturnType<typeof loadOfficeOrders>>["orders"], range: Range, products: Map<string, Product>, now: number): Promise<number> {
  if (s.type === "kennzahlen") return 0;
  const [company, logo] = await Promise.all([companyInfo(), logoImage()]);
  const ctx = { title: s.name, range, filters: [], createdBy: "Automatischer Bericht", now };
  const doc = REPORT_DOC[s.type];
  const buf = doc === "versandliste" ? shippingListPdf(orders, ctx, company, products, logo) : doc === "sammelliste" ? collectListPdf(orders, ctx, company, products, logo) : dailyReportPdf(orders, ctx, company, products, logo);
  return buf.length;
}

async function mailOut(recipients: string[], subject: string, text: string, send: typeof sendMail): Promise<Pick<ReportEntry, "mail" | "mailInfo">> {
  if (!reportEmailsEnabled()) return { mail: "aus", mailInfo: "E-Mail-Versand nicht freigegeben (OFFICE_REPORT_EMAILS)" };
  if (!recipients.length) return { mail: "keine_empfaenger" };
  let ok = 0;
  const errors: string[] = [];
  for (const email of recipients) {
    const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)}</pre>`;
    const r = await send({ to: { email }, subject, text, html, tag: "buero-bericht" });
    if (r.ok) ok++;
    else errors.push(r.error);
  }
  return ok === recipients.length ? { mail: "versendet", mailInfo: `an ${ok} Empfänger` } : { mail: "fehler", mailInfo: `${ok} von ${recipients.length} versendet · ${errors[0]?.slice(0, 120) ?? ""}` };
}

/** Einen Bericht für einen Zeitraum erstellen (Zeitplan oder manuell). Liefert den Historien-Eintrag. */
export async function produceReport(s: ReportSchedule, range: Range, trigger: ReportEntry["trigger"], by: string, deps: RunDeps, attempt = 1): Promise<ReportEntry> {
  const started = Date.now();
  const products = deps.products ?? (await productLookup());
  const load = deps.load ?? loadOfficeOrders;
  const base = { id: newReportId(), at: new Date(deps.now).toISOString(), kind: "bericht" as const, scheduleId: s.id, name: s.name, type: s.type, channel: s.channel, range, trigger, by, attempt };
  try {
    const loaded = await load(range.from, range.to, products);
    if (!loaded.complete) {
      if (loaded.errors.some((e) => /Stripe/.test(e))) reportIncident("stripe_unreachable", "Bürobericht");
      reportIncident("office_report_failed", `${s.name}: Datenquelle unvollständig`);
      return { ...base, status: "unvollstaendig", error: loaded.errors.join(" ").slice(0, 300), mail: "aus", durationMs: Date.now() - started };
    }
    const orders = forChannel(loaded.orders, s.channel);
    const summary = summarize(orders, range, products, deps.now);
    const pdfBytes = await renderPdf(s, orders, range, products, deps.now);
    const t = reportText(s.name, range, summary, s.channel, officeLink);
    const mail = await mailOut(s.recipients, t.subject, t.text, deps.send ?? sendMail);
    return { ...base, status: "ok", summary: { ...summary, units: summary.units.slice(0, 40) }, pdfBytes, ...mail, durationMs: Date.now() - started };
  } catch (e) {
    reportIncident("office_report_failed", `${s.name}: ${(e as Error).name}`);
    return { ...base, status: "fehler", error: "Bericht konnte nicht erstellt werden (interner Fehler).", mail: "aus", durationMs: Date.now() - started };
  }
}

export type RunResult = { ran: number; failed: number; skipped: number; entries: ReportEntry[]; digest?: ReportEntry };

/**
 * Zeitgesteuerter Lauf (Cron). Je Termin: Sperre setzen (nur ein Lauf, auch bei doppeltem Aufruf), Bericht erstellen,
 * Historie schreiben. Fehlgeschlagen/unvollständig → Sperre lösen, damit der nächste Lauf es erneut versucht (höchstens
 * MAX_ATTEMPTS Versuche je Termin). Bestellungen, Zahlungen und Rechnungen werden nie verändert.
 */
export async function runScheduled(deps: RunDeps): Promise<RunResult> {
  const cfg = await getConfig();
  const result: RunResult = { ran: 0, failed: 0, skipped: 0, entries: [] };
  const due = dueSchedules(cfg.schedules, new Set(), deps.now);
  for (const d of due) {
    const runKeyFull = RUN_PREFIX + d.key;
    const claimed = await kv().set(runKeyFull, JSON.stringify({ at: new Date(deps.now).toISOString() }), { ex: 40 * 86_400, nx: true });
    if (!claimed) {
      result.skipped++;
      continue;
    }
    const tries = await kv().incrWindow(TRY_PREFIX + d.key, 7 * 86_400);
    if (tries.count > MAX_ATTEMPTS) {
      result.skipped++;
      continue; // Sperre bleibt – nach 3 Fehlversuchen nicht endlos wiederholen
    }
    const entry = await produceReport(d.schedule, d.range, "zeitplan", "Zeitplan", deps, tries.count);
    await saveReport(entry, deps.now);
    result.entries.push(entry);
    if (entry.status === "ok") result.ran++;
    else {
      result.failed++;
      if (tries.count < MAX_ATTEMPTS) await kv().del(runKeyFull);
    }
  }
  if (cfg.digest) result.digest = await runDigest(cfg, deps);
  try {
    const prev = await getState();
    const state: AutomationState = {
      lastRunAt: new Date(deps.now).toISOString(),
      trigger: "zeitplan",
      ran: result.ran,
      failed: result.failed,
      skipped: result.skipped,
      ...(result.entries.find((e) => e.status !== "ok")?.error ? { lastError: result.entries.find((e) => e.status !== "ok")?.error } : {}),
      ...(result.digest ? { lastDigestAt: result.digest.at } : prev?.lastDigestAt ? { lastDigestAt: prev.lastDigestAt } : {}),
    };
    await kv().set(STATE_KEY, JSON.stringify(state));
  } catch {
    console.error("[office] Automatisierungsstatus konnte nicht gespeichert werden");
  }
  return result;
}

/** Zusammenfassung der neuen Benachrichtigungen und Erinnerungen (jede nur einmal) */
async function runDigest(cfg: AutomationConfig, deps: RunDeps): Promise<ReportEntry> {
  const started = Date.now();
  const products = deps.products ?? (await productLookup());
  const load = deps.load ?? loadOfficeOrders;
  const from = deps.now - 60 * 86_400_000;
  const range: Range = { from: deps.now - 86_400_000, to: deps.now, label: "letzte 24 Stunden" };
  const base = { id: newReportId(), at: new Date(deps.now).toISOString(), kind: "zusammenfassung" as const, scheduleId: "", name: "Benachrichtigungen & Erinnerungen", type: "zusammenfassung" as const, channel: "alle" as const, range, trigger: "zeitplan" as const, by: "Zeitplan" };
  try {
    const loaded = await load(from, deps.now + 1, products);
    if (!loaded.complete) return { ...base, status: "unvollstaendig", error: loaded.errors.join(" ").slice(0, 300), mail: "aus", durationMs: Date.now() - started };
    let activities: Activity[] = [];
    let reports: ReportEntry[] = [];
    try {
      [activities, reports] = await Promise.all([listActivities(deps.now - 7 * 86_400_000, deps.now + 1), listReports(deps.now, 1)]);
    } catch {
      // Historie ist nur Zusatz – ohne sie bleibt die Zusammenfassung trotzdem gültig
    }
    const all = [...notifications(loaded.orders, cfg, range.from, products, { activities, reports: reports.filter((r) => r.kind === "bericht").map((r) => ({ id: r.id, at: r.at, name: r.name, status: r.status, range: r.range.label })) }), ...reminders(loaded.orders, cfg, deps.now, activities)];
    const fresh = await filterUnsent(all);
    const t = digestText(fresh, `${SITE_URL}/admin/buero`);
    const mail = fresh.length ? await mailOut(cfg.digestRecipients, t.subject, t.text, deps.send ?? sendMail) : { mail: "aus" as const, mailInfo: "nichts Neues" };
    const entry: ReportEntry = { ...base, status: "ok", items: fresh.length, ...mail, durationMs: Date.now() - started };
    await saveReport(entry, deps.now);
    return entry;
  } catch {
    return { ...base, status: "fehler", error: "Zusammenfassung konnte nicht erstellt werden.", mail: "aus", durationMs: Date.now() - started };
  }
}

/** Manuell erstellen („Jetzt erstellen“ / „Erneut erstellen“) – immer ein neuer Historien-Eintrag */
export async function runManual(s: ReportSchedule, range: Range, by: string, deps: RunDeps): Promise<ReportEntry> {
  const entry = await produceReport(s, range, "manuell", by, deps);
  await saveReport(entry, deps.now);
  return entry;
}
