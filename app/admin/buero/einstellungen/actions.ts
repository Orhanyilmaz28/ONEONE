"use server";

import { redirect } from "next/navigation";
import { assertOffice, requestOrigin } from "@/lib/admin-auth";
import { logSecurityEvent } from "@/lib/admin-security/audit";
import { hitLimit } from "@/lib/admin-security/rate-limit";
import { OfficeAccessError, ROLE_LABEL, isStaffRole } from "@/lib/office/roles";
import { OfficeUserError, createUser, deleteUser, getUser, updateUser } from "@/lib/office/users";

/** Büro-Zugänge verwalten – nur Administrator (serverseitig geprüft), begrenzt und protokolliert */
const BASE = "/admin/buero/einstellungen";
const done = (msg: string): never => redirect(`${BASE}?ok=${encodeURIComponent(msg)}#zugaenge`);
const fail = (msg: string): never => redirect(`${BASE}?fehler=${encodeURIComponent(msg)}#zugaenge`);

async function guard() {
  const o = await requestOrigin();
  try {
    await assertOffice("office.users");
  } catch (e) {
    if (e instanceof OfficeAccessError && e.status === 403) await logSecurityEvent("office_denied", { ...o, detail: "Büro-Zugänge verwalten ohne Berechtigung" });
    redirect("/admin/buero?keine-berechtigung=1");
  }
  if (!(await hitLimit("officeUsers", o.ip)).ok) fail("Zu viele Änderungen in kurzer Zeit. Bitte später erneut versuchen.");
  return o;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createUserAction(form: FormData) {
  const o = await guard();
  let msg = "";
  let error = "";
  try {
    const u = await createUser({ username: str(form, "username"), name: str(form, "name"), role: str(form, "role"), password: str(form, "password") });
    await logSecurityEvent("office_user_created", { ...o, detail: `${u.username} · ${ROLE_LABEL[u.role]}` });
    msg = `Zugang „${u.username}“ angelegt. Bei der ersten Anmeldung richtet die Person die Zwei-Faktor-Anmeldung ein.`;
  } catch (e) {
    error = e instanceof OfficeUserError ? e.message : "Speichern fehlgeschlagen. Bitte später erneut versuchen.";
  }
  if (error) fail(error);
  done(msg);
}

export async function changeUserAction(form: FormData) {
  const o = await guard();
  const id = str(form, "id");
  const op = str(form, "op");
  let msg = "";
  let error = "";
  try {
    const user = await getUser(id);
    if (!user) error = "Zugang nicht gefunden.";
    else if (op === "delete") {
      if (form.get("confirm") !== "ja") error = "Bitte das Löschen bestätigen.";
      else {
        await deleteUser(id);
        await logSecurityEvent("office_user_deleted", { ...o, detail: user.username });
        msg = `Zugang „${user.username}“ gelöscht.`;
      }
    } else {
      const role = str(form, "role");
      const change =
        op === "role" && isStaffRole(role)
          ? { role }
          : op === "lock"
            ? { active: false }
            : op === "unlock"
              ? { active: true }
              : op === "password"
                ? { password: str(form, "password") }
                : op === "reset2fa"
                  ? { resetTwoFactor: true }
                  : null;
      if (!change) error = "Unbekannte Aktion.";
      else {
        await updateUser(id, change);
        const what = { role: `Rolle → ${isStaffRole(role) ? ROLE_LABEL[role] : role}`, lock: "gesperrt", unlock: "entsperrt", password: "Passwort neu gesetzt", reset2fa: "2FA zurückgesetzt" }[op] ?? op;
        await logSecurityEvent("office_user_changed", { ...o, detail: `${user.username} · ${what}` });
        msg = `Zugang „${user.username}“: ${what}. Laufende Anmeldungen dieser Person wurden beendet.`;
      }
    }
  } catch (e) {
    error = e instanceof OfficeUserError ? e.message : "Speichern fehlgeschlagen. Bitte später erneut versuchen.";
  }
  if (error) fail(error);
  done(msg);
}
