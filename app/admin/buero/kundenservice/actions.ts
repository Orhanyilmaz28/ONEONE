"use server";

import { redirect } from "next/navigation";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { slugToKey } from "@/lib/office/model";
import { OfficeAccessError, can } from "@/lib/office/roles";
import { loadOfficeOrder } from "@/lib/office/source";
import { type TicketAction, isTicketNumber, validateCreate } from "@/lib/office/tickets";
import { createTicket, customerLink, updateTicket } from "@/lib/office/tickets-service";
import { listUsers } from "@/lib/office/users";
import { actorOf } from "@/lib/office/workflow-store";

/**
 * Kundenservice – Server-Aktionen. Recht office.service (Administrator, Büro), begrenzt und protokolliert
 * (Protokoll ohne Kundendaten: nur Fallnummer und Vorgang). Keine E-Mails, keine Stripe-Erstattung, keine Lagerbuchung.
 */
const BASE = "/admin/buero/kundenservice";
const str = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").slice(0, max);

async function guard() {
  const o = await requestOrigin();
  let who: Awaited<ReturnType<typeof assertOffice>> | null = null;
  try {
    who = await assertOffice("office.service");
  } catch (e) {
    if (e instanceof OfficeAccessError && e.status === 403) await logSecurityEvent("office_denied", { ...o, detail: "Kundenservice bearbeiten ohne Berechtigung" });
    redirect("/admin/buero?keine-berechtigung=1");
  }
  return { o, who: who as NonNullable<typeof who> };
}

export async function createTicketAction(form: FormData) {
  const { o, who } = await guard();
  const slug = str(form, "bestellung", 200);
  const back = (msg: string): never => redirect(`${BASE}/neu?${new URLSearchParams({ ...(slug ? { bestellung: slug } : {}), fehler: msg.slice(0, 300) }).toString()}`);
  if (!(await hitLimit("officeService", o.ip)).ok) back("Zu viele Vorgänge in kurzer Zeit. Bitte später erneut versuchen.");
  let order = null;
  if (slug) {
    const key = slugToKey(slug);
    if (!key) back("Unbekannte Bestellung.");
    const r = await loadOfficeOrder(key as string, await productLookup());
    if (!r.order) back(r.error ?? "Die Bestellung wurde nicht gefunden.");
    order = r.order;
  }
  const returnQty: Record<number, number> = {};
  for (const [k, v] of form.entries()) {
    const m = /^rq_(\d{1,3})$/.exec(k);
    if (m && String(v).trim()) returnQty[Number(m[1])] = Number(v);
  }
  const freeTitle = str(form, "rfTitle", 120);
  const v = validateCreate(
    {
      kind: str(form, "kind", 20),
      priority: str(form, "priority", 20),
      subject: str(form, "subject", 300),
      description: str(form, "description"),
      customerName: str(form, "customerName", 200),
      customerEmail: str(form, "customerEmail", 200),
      orderText: str(form, "orderText", 60),
      complaintType: str(form, "complaintType", 30),
      returnReason: str(form, "returnReason", 600),
      returnInfo: str(form, "returnInfo", 1200),
      returnQty,
      returnFree: freeTitle ? { title: freeTitle, quantity: Number(str(form, "rfQty", 6)) } : undefined,
      refundReason: str(form, "refundReason", 600),
      refundAmount: str(form, "refundAmount", 20),
    },
    { order, link: await customerLink(order) },
  );
  if (!v.ok) back(v.errors.join(" "));
  let number = "";
  try {
    number = (await createTicket((v as Extract<typeof v, { ok: true }>).draft, actorOf(who))).number;
  } catch {
    back("Der Fall konnte nicht gespeichert werden (Datenspeicher nicht erreichbar). Es wurde nichts angelegt.");
  }
  await logSecurityEvent("office_ticket", { ...o, detail: `${number} angelegt` });
  redirect(`${BASE}/${number}?ok=${encodeURIComponent("Fall angelegt.")}`);
}

export async function ticketAction(form: FormData) {
  const { o, who } = await guard();
  const number = str(form, "nummer", 30);
  if (!isTicketNumber(number)) redirect(BASE);
  const back = (key: "ok" | "fehler", msg: string): never => redirect(`${BASE}/${number}?${key}=${encodeURIComponent(msg.slice(0, 300))}`);
  if (!(await hitLimit("officeService", o.ip)).ok) back("fehler", "Zu viele Vorgänge in kurzer Zeit. Bitte später erneut versuchen.");
  const rev = Number(str(form, "rev", 10));
  const kind = str(form, "aktion", 30);
  let action: TicketAction | null = null;
  switch (kind) {
    case "zuweisen": {
      const id = str(form, "assignee", 60);
      if (!id) action = { action: "zuweisen", assignee: null };
      else if (id === "admin") action = { action: "zuweisen", assignee: { id: "admin", label: "Administrator" } };
      else {
        let users: Awaited<ReturnType<typeof listUsers>> = [];
        try {
          users = await listUsers();
        } catch {
          back("fehler", "Die Büro-Zugänge konnten nicht geladen werden.");
        }
        const u = users.find((x) => x.id === id && x.active && can(x.role, "office.service"));
        if (!u) back("fehler", "Diese Person kann keine Kundenfälle bearbeiten.");
        action = { action: "zuweisen", assignee: { id: u!.id, label: u!.name } };
      }
      break;
    }
    case "prioritaet":
      action = { action: "prioritaet", priority: str(form, "priority", 20) };
      break;
    case "status":
      action = { action: "status", status: str(form, "status", 30) };
      break;
    case "notiz":
      action = { action: "notiz", text: str(form, "text", 2200) };
      break;
    case "schliessen":
      action = { action: "schliessen", resolution: str(form, "resolution", 400) };
      break;
    case "wiedereroeffnen":
      action = { action: "wiedereroeffnen", reason: str(form, "reason", 400) };
      break;
    case "retoure":
      action = { action: "retoure", status: str(form, "returnStatus", 30), decision: str(form, "decision", 30), info: str(form, "returnInfo", 1200) };
      break;
    case "erstattung":
      action = { action: "erstattung", status: str(form, "refundStatus", 30) };
      break;
    case "reklamation":
      action = { action: "reklamation", type: str(form, "complaintType", 30) };
      break;
  }
  if (!action) back("fehler", "Unbekannte Aktion.");
  const r = await updateTicket(number, action as TicketAction, rev, actorOf(who));
  if (!r.ok) back("fehler", r.error);
  if ((r as Extract<typeof r, { ok: true }>).changed) await logSecurityEvent("office_ticket", { ...o, detail: `${number}: ${kind}` });
  back("ok", (r as Extract<typeof r, { ok: true }>).changed ? "Gespeichert." : "Keine Änderung.");
}
