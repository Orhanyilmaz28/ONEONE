"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { saveInvoiceSettings } from "@/lib/dealer-orders";

export type BankState = { ok?: string; error?: string } | undefined;

/** Bankverbindung, Zahlungsziel und Standard-Hinweis für Händler-Rechnungen speichern */
export async function saveBankAction(_prev: BankState, form: FormData): Promise<BankState> {
  await assertAdmin();
  const iban = String(form.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  const bic = String(form.get("bic") ?? "").replace(/\s+/g, "").toUpperCase();
  const bank = String(form.get("bank") ?? "").trim().slice(0, 80);
  const dueDays = Math.min(120, Math.max(0, Math.round(Number(form.get("dueDays")) || 0)));
  const note = String(form.get("note") ?? "").trim().slice(0, 1500);
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return { error: "Die IBAN sieht nicht richtig aus (z. B. DE89 3704 0044 0532 0130 00)." };
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return { error: "Die BIC sieht nicht richtig aus (8 oder 11 Zeichen)." };
  await saveInvoiceSettings({ iban: iban.replace(/(.{4})/g, "$1 ").trim(), bic, bank, dueDays, note });
  revalidatePath("/admin/haendler", "layout");
  return { ok: "Rechnungsdaten gespeichert – gelten für alle neuen bzw. neu gespeicherten Rechnungen." };
}
