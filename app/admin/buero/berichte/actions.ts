"use server";

import { redirect } from "next/navigation";
import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { latestOccurrence, reportRange } from "@/lib/office/automation";
import { findReport, getConfig, runManual } from "@/lib/office/automation-service";
import { OfficeAccessError, principalLabel } from "@/lib/office/roles";

/** Berichte manuell erstellen („Jetzt erstellen“, „Erneut erstellen“) – Recht office.reports, begrenzt, protokolliert */
const BASE = "/admin/buero/berichte";
const back = (k: "ok" | "fehler", msg: string): never => redirect(`${BASE}?${k}=${encodeURIComponent(msg.slice(0, 300))}`);

export async function runReportAction(form: FormData) {
  const o = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>> | null = null;
  try {
    who = await assertOffice("office.reports");
  } catch (e) {
    if (e instanceof OfficeAccessError && e.status === 403) await logSecurityEvent("office_denied", { ...o, detail: "Bericht erstellen ohne Berechtigung" });
    redirect("/admin/buero?keine-berechtigung=1");
  }
  const me = who as NonNullable<typeof who>;
  if (!(await hitLimit("officeReports", me.userId ?? "admin")).ok) back("fehler", "Zu viele Berichte in kurzer Zeit. Bitte später erneut versuchen.");
  const now = Date.now();
  const scheduleId = String(form.get("bericht") ?? "");
  const entryId = String(form.get("eintrag") ?? "");
  let message = "";
  try {
    const cfg = await getConfig();
    if (entryId) {
      const e = await findReport(entryId, now);
      if (!e || e.kind !== "bericht") back("fehler", "Eintrag nicht gefunden.");
      const entry = e as NonNullable<typeof e>;
      const s = cfg.schedules.find((x) => x.id === entry.scheduleId) ?? { id: entry.scheduleId || "geloescht", name: entry.name, active: false, frequency: "taeglich" as const, time: "05:00", weekday: 1, monthDay: 1, type: entry.type === "zusammenfassung" ? ("kennzahlen" as const) : entry.type, scope: "abgeschlossen" as const, channel: entry.channel, recipients: [], updatedAt: "", updatedBy: "" };
      // Erneut erstellen: gleicher Zeitraum, aktueller Datenstand, ohne E-Mail an Empfänger
      const r = await runManual({ ...s, recipients: [] }, entry.range, principalLabel(me), { now });
      message = r.status === "ok" ? `Bericht „${s.name}“ (${entry.range.label}) neu erstellt.` : `Bericht konnte nicht erstellt werden: ${r.error ?? r.status}`;
    } else {
      const s = cfg.schedules.find((x) => x.id === scheduleId);
      if (!s) back("fehler", "Bericht nicht gefunden.");
      const sched = s as NonNullable<typeof s>;
      const occ = latestOccurrence(sched, now);
      const range = reportRange(sched, occ.day, occ.at);
      const r = await runManual({ ...sched, recipients: [] }, range, principalLabel(me), { now });
      message = r.status === "ok" ? `Bericht „${sched.name}“ (${range.label}) erstellt.` : `Bericht konnte nicht erstellt werden: ${r.error ?? r.status}`;
    }
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    back("fehler", "Der Datenspeicher ist gerade nicht erreichbar. Es wurde nichts erstellt.");
  }
  await logSecurityEvent("office_reports", { ...o, detail: `${principalLabel(me)} · Bericht manuell erstellt` });
  back(message.startsWith("Bericht konnte") ? "fehler" : "ok", message);
}
