"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { MAX_SCHEDULES, NOTIFY_KINDS, REMINDER_KINDS, cleanRecipients, validateSchedule } from "@/lib/office/automation";
import { saveConfig } from "@/lib/office/automation-service";
import { OfficeAccessError, principalLabel } from "@/lib/office/roles";

/** Automatische Berichte einstellen – nur Administrator (serverseitig), begrenzt und protokolliert */
const BASE = "/admin/buero/einstellungen/berichte";
const done = (msg: string): never => redirect(`${BASE}?ok=${encodeURIComponent(msg)}`);
const fail = (msg: string): never => redirect(`${BASE}?fehler=${encodeURIComponent(msg.slice(0, 300))}`);

async function guard() {
  const o = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>> | null = null;
  try {
    who = await assertOffice("office.automation");
  } catch (e) {
    if (e instanceof OfficeAccessError && e.status === 403) await logSecurityEvent("office_denied", { ...o, detail: "Automatische Berichte ohne Berechtigung" });
    redirect("/admin/buero?keine-berechtigung=1");
  }
  if (!(await hitLimit("officeAutomation", o.ip)).ok) fail("Zu viele Änderungen in kurzer Zeit. Bitte später erneut versuchen.");
  return { o, who: who as NonNullable<typeof who> };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").slice(0, 600);

export async function saveScheduleAction(form: FormData) {
  const { o, who } = await guard();
  const id = str(form, "id");
  const v = validateSchedule({
    name: str(form, "name"),
    active: form.get("active") === "1",
    frequency: str(form, "frequency"),
    time: str(form, "time"),
    weekday: Number(str(form, "weekday") || 1),
    monthDay: Number(str(form, "monthDay") || 1),
    type: str(form, "type"),
    scope: str(form, "scope"),
    channel: str(form, "channel"),
    recipients: str(form, "recipients"),
  });
  if (!v.ok) fail(v.errors.join(" "));
  const s = (v as Extract<typeof v, { ok: true }>).schedule;
  let error = "";
  try {
    await saveConfig((cur) => {
      const at = new Date().toISOString();
      const by = principalLabel(who);
      if (id) {
        if (!cur.schedules.some((x) => x.id === id)) {
          error = "Bericht nicht gefunden.";
          return cur;
        }
        return { ...cur, schedules: cur.schedules.map((x) => (x.id === id ? { ...s, id, updatedAt: at, updatedBy: by } : x)) };
      }
      if (cur.schedules.length >= MAX_SCHEDULES) {
        error = `Höchstens ${MAX_SCHEDULES} automatische Berichte.`;
        return cur;
      }
      return { ...cur, schedules: [...cur.schedules, { ...s, id: randomBytes(9).toString("base64url"), updatedAt: at, updatedBy: by }] };
    });
  } catch {
    fail("Speichern fehlgeschlagen (Datenspeicher nicht erreichbar). Es wurde nichts geändert.");
  }
  if (error) fail(error);
  await logSecurityEvent("office_reports", { ...o, detail: `${principalLabel(who)} · Bericht ${id ? "geändert" : "angelegt"} · ${s.name} · ${s.active ? "aktiv" : "inaktiv"}` });
  done(id ? "Bericht gespeichert." : "Bericht angelegt.");
}

export async function deleteScheduleAction(form: FormData) {
  const { o, who } = await guard();
  const id = str(form, "id");
  if (form.get("confirm") !== "ja") fail("Bitte das Löschen bestätigen.");
  try {
    await saveConfig((cur) => ({ ...cur, schedules: cur.schedules.filter((x) => x.id !== id) }));
  } catch {
    fail("Löschen fehlgeschlagen (Datenspeicher nicht erreichbar).");
  }
  await logSecurityEvent("office_reports", { ...o, detail: `${principalLabel(who)} · Bericht gelöscht` });
  done("Bericht gelöscht. Die bisherige Berichtshistorie bleibt erhalten.");
}

export async function saveNotifyAction(form: FormData) {
  const { o, who } = await guard();
  const rec = cleanRecipients(str(form, "digestRecipients"));
  if (rec.invalid.length) fail(`Ungültige Empfänger: ${rec.invalid.join(", ")}`);
  const reminders: Record<string, { enabled: boolean; hours: number }> = {};
  for (const k of REMINDER_KINDS) {
    const h = Number(str(form, `h_${k}`) || 0);
    if (!Number.isFinite(h) || h < 0 || h > 1440) fail("Stunden bitte zwischen 0 und 1440 angeben.");
    reminders[k] = { enabled: form.get(`r_${k}`) === "1", hours: Math.round(h) };
  }
  try {
    await saveConfig((cur) => ({
      ...cur,
      notify: Object.fromEntries(NOTIFY_KINDS.map((k) => [k, form.get(`n_${k}`) === "1"])) as typeof cur.notify,
      reminders: reminders as typeof cur.reminders,
      digest: form.get("digest") === "1",
      digestRecipients: rec.list,
      updatedAt: new Date().toISOString(),
      updatedBy: principalLabel(who),
    }));
  } catch {
    fail("Speichern fehlgeschlagen (Datenspeicher nicht erreichbar). Es wurde nichts geändert.");
  }
  await logSecurityEvent("office_reports", { ...o, detail: `${principalLabel(who)} · Benachrichtigungen/Erinnerungen gespeichert` });
  done("Benachrichtigungen und Erinnerungen gespeichert.");
}
