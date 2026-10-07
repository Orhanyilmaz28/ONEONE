"use server";

import { revalidatePath } from "next/cache";
import { revalidateShop } from "@/lib/admin";
import { assertAdmin } from "@/lib/admin-auth";
import { type AccountsConfig, deleteCustomer, updateCustomer } from "@/lib/customers";
import { KEYS, setJSON } from "@/lib/store";

function refresh() {
  revalidateShop();
  revalidatePath("/admin/kunden");
}

/** Kundenkonten ein- oder ausschalten */
export async function setAccountsEnabled(form: FormData) {
  await assertAdmin();
  const enabled = form.get("enabled") === "1";
  const config: AccountsConfig = enabled ? { enabled: true, enabledAt: new Date().toISOString() } : { enabled: false };
  await setJSON(KEYS.accounts, config);
  refresh();
}

/** Konto einer Kund:in löschen (z. B. auf Wunsch per E-Mail) */
export async function removeCustomer(form: FormData) {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/.test(id)) await deleteCustomer(id);
  refresh();
}

/** Sperre nach Fehlversuchen aufheben und alle Anmeldungen beenden (z. B. wenn jemand sein Passwort vergessen hat) */
export async function unlockCustomer(form: FormData) {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/.test(id)) await updateCustomer(id, (c) => ({ ...c, failedLogins: 0, lockedUntil: undefined }));
  refresh();
}
