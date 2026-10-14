"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type DealerInvoice, type InvoiceLine, invoiceTotals } from "@/lib/dealer-invoice";
import { notifyDealer } from "@/lib/dealer-messages";
import { getDealerOrder, getInvoiceSettings, saveInvoice } from "@/lib/dealer-orders";
import { mailReady, sendMail } from "@/lib/mail";
import { dealerInvoiceMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";

export type InvoicePayload = Pick<DealerInvoice, "date" | "serviceDate" | "dueDays" | "lines" | "shippingNet" | "shippingText" | "discountNet" | "discountText" | "note" | "billTo">;
export type InvoiceResult = { ok: true; message: string; number: string } | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 100_000_000 ? Math.round(v) : 0);
const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "");
const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

/** Rechnung speichern / freigeben / als bezahlt markieren (Server Actions sind öffentlich: zuerst Anmeldung prüfen, alle Werte prüfen) */
export async function saveInvoiceAction(orderId: string, payload: InvoicePayload, mode: "save" | "release" | "paid" | "unpaid"): Promise<InvoiceResult> {
  await assertAdmin();
  if (typeof orderId !== "string" || !/^[a-f0-9]{16}$/.test(orderId) || !["save", "release", "paid", "unpaid"].includes(mode)) return { ok: false, error: "Ungültige Anfrage." };
  const order = await getDealerOrder(orderId);
  if (!order) return { ok: false, error: "Bestellung nicht gefunden." };

  const date = ymd(payload?.date);
  const serviceDate = ymd(payload?.serviceDate);
  if (!date || !serviceDate) return { ok: false, error: "Bitte Rechnungs- und Leistungsdatum angeben." };
  const lines: InvoiceLine[] = (Array.isArray(payload.lines) ? payload.lines : []).slice(0, 60).flatMap((l) => {
    const text = str(l?.text, 200);
    const qty = typeof l?.qty === "number" && Number.isFinite(l.qty) && l.qty > 0 && l.qty <= 100_000 ? Math.round(l.qty * 100) / 100 : 0;
    if (!text || !qty) return [];
    return [{ text, qty, unit: str(l.unit, 20) || "Stück", price: cents(l.price), deposit: Math.min(1000, Math.max(0, Math.round(Number(l.deposit) || 0))) }];
  });
  if (!lines.length) return { ok: false, error: "Bitte mindestens eine Position mit Bezeichnung und Menge eintragen." };
  const b = payload.billTo ?? ({} as InvoicePayload["billTo"]);
  const billTo = { company: str(b.company, 120), contact: str(b.contact, 120), street: str(b.street, 160), zip: str(b.zip, 10), city: str(b.city, 80), vatId: str(b.vatId, 30).toUpperCase() };
  if (!billTo.company || !billTo.street || !billTo.zip || !billTo.city) return { ok: false, error: "Bitte die Rechnungsadresse vollständig angeben." };

  const [settings, bank] = await Promise.all([getSettings(), getInvoiceSettings()]);
  const c = settings.company;
  const draft = {
    date,
    serviceDate,
    dueDays: Math.min(120, Math.max(0, Math.round(Number(payload.dueDays) || 0))),
    lines,
    shippingNet: cents(payload.shippingNet),
    shippingText: str(payload.shippingText, 80) || "Versand",
    discountNet: cents(payload.discountNet),
    discountText: str(payload.discountText, 80) || "Rabatt",
    note: typeof payload.note === "string" ? payload.note.trim().slice(0, 1500) : "",
    vatRate: 19,
    billTo,
    seller: { name: c.name, owner: c.owner, street: c.street, city: c.city, country: c.country, email: c.email, phone: c.phone, vatId: c.vatId, register: c.register, iban: bank.iban, bic: bank.bic, bank: bank.bank },
  };
  if (invoiceTotals(draft).net < 0) return { ok: false, error: "Der Rabatt ist höher als der Rechnungsbetrag." };

  const wasVisible = Boolean(order.invoice?.released || order.invoice?.paid);
  const res = await saveInvoice(orderId, draft, { release: mode === "release", paid: mode === "paid" ? true : mode === "unpaid" ? false : undefined });
  if (!res) return { ok: false, error: "Speichern fehlgeschlagen." };
  const inv = res.order.invoice as DealerInvoice;
  const nowVisible = inv.released || inv.paid;
  const replyTo = isPlaceholder(c.email) ? undefined : c.email.trim();
  const link = `/haendler/portal/rechnung/${order.id}`;

  // Händler informieren: neu sichtbar oder korrigiert → Nachricht + E-Mail; bezahlt → Nachricht
  if (nowVisible && (!wasVisible || res.change.kind === "korrigiert")) {
    const corrected = res.change.kind === "korrigiert" ? res.change.previous : undefined;
    await notifyDealer({
      to: order.dealerId,
      type: "rechnung",
      title: corrected ? `Rechnung ${corrected} korrigiert – neu: ${inv.number}` : `Rechnung ${inv.number} zu Bestellung ${order.number}`,
      body: `Gesamtbetrag ${(invoiceTotals(inv).gross / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}${inv.paid ? " – bezahlt." : ""}`,
      link,
      linkLabel: "Rechnung ansehen",
    });
    if (mailReady()) {
      await sendMail({ to: { email: order.dealerEmail, name: order.delivery.contact }, ...dealerInvoiceMail(res.order, inv, settings, corrected), replyTo, tag: "haendler-rechnung" }).catch((e) =>
        console.error("[haendler-rechnung] E-Mail fehlgeschlagen", inv.number, e),
      );
    }
  }
  if (mode === "paid" && !order.invoice?.paid) {
    await notifyDealer({ to: order.dealerId, type: "rechnung", title: `Zahlung für ${inv.number} erhalten – danke!`, body: "", link, linkLabel: "Rechnung ansehen" });
  }

  revalidatePath("/admin/haendler/bestellungen", "layout");
  revalidatePath("/haendler/portal", "layout");
  const msg =
    res.change.kind === "korrigiert"
      ? `Korrigiert: neue Rechnungsnummer ${inv.number} (ersetzt ${res.change.previous}).`
      : mode === "release"
        ? `Rechnung ${inv.number} ist für den Händler freigegeben.`
        : mode === "paid"
          ? `Rechnung ${inv.number} als bezahlt markiert.`
          : mode === "unpaid"
            ? `Zahlung bei ${inv.number} zurückgesetzt.`
            : `Rechnung ${inv.number} gespeichert.`;
  return { ok: true, message: msg, number: inv.number };
}
