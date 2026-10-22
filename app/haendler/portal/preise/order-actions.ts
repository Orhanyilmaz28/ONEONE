"use server";

import { revalidatePath } from "next/cache";
import { getProducts } from "@/lib/catalog";
import { toOrderRow } from "@/lib/dealer-catalog";
import { getCurrentDealer } from "@/lib/dealer-auth";
import { PALLET_MIN_TRAYS, calcDealerOrder, cleanQty } from "@/lib/dealer-order-calc";
import { notifyDealer } from "@/lib/dealer-messages";
import { DealerOrderLimitError, createDealerOrder } from "@/lib/dealer-orders";
import { dealerRows } from "@/lib/dealer-rows";
import { mailReady, sendMail } from "@/lib/mail";
import { getMailSettings } from "@/lib/mail-settings";
import { adminNewDealerOrderMail, dealerOrderConfirmationMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

export type PlaceOrderInput = {
  qty: Record<string, number>;
  delivery: { company: string; contact: string; street: string; zip: string; city: string };
  wishDate?: string;
  reference?: string;
  note?: string;
  /** Betrag, den der Händler gesehen hat – weicht der neu berechnete ab, wird nicht bestellt */
  expectedGross: number;
};
export type PlaceOrderResult = { ok: true; number: string } | { ok: false; error: string; fields?: Record<string, string> };

const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Händler-Bestellung auf Rechnung (Server Actions sind öffentlich erreichbar – Anmeldung und alle Werte werden hier geprüft) */
export async function placeDealerOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const dealer = await getCurrentDealer();
  if (!dealer) return { ok: false, error: "Bitte melde dich erneut im Händlerbereich an." };
  if (!input || typeof input !== "object" || !input.qty || typeof input.qty !== "object") return { ok: false, error: "Ungültige Bestellung." };

  // Lieferdaten prüfen
  const d = input.delivery ?? ({} as PlaceOrderInput["delivery"]);
  const delivery = { company: text(d.company, 120), contact: text(d.contact, 120), street: text(d.street, 160), zip: text(d.zip, 10), city: text(d.city, 80) };
  const fields: Record<string, string> = {};
  if (!delivery.company) fields.company = "Bitte Firma angeben.";
  if (!delivery.contact) fields.contact = "Bitte Ansprechpartner:in angeben.";
  if (!delivery.street) fields.street = "Bitte Straße und Hausnummer angeben.";
  if (!/^[0-9A-Za-z -]{4,10}$/.test(delivery.zip)) fields.zip = "Bitte eine gültige PLZ angeben.";
  if (!delivery.city) fields.city = "Bitte Ort angeben.";
  let wishDate: string | undefined;
  if (input.wishDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wishDate) || Number.isNaN(Date.parse(input.wishDate)) || input.wishDate <= today) fields.wishDate = "Bitte ein Datum ab morgen wählen.";
    else wishDate = input.wishDate;
  }
  if (Object.keys(fields).length) return { ok: false, error: "Bitte prüfe die markierten Felder.", fields };

  // Preise immer frisch auf dem Server berechnen
  const [products, settings] = await Promise.all([getProducts(), getSettings()]);
  const { rows, tierName } = await dealerRows(dealer, products);
  const orderRows = rows.map(toOrderRow);
  const qty = Object.fromEntries(Object.entries(input.qty).filter(([k]) => /^[a-z0-9-]{1,80}$/.test(k)).map(([k, v]) => [k, cleanQty(v)]));
  const wanted = Object.entries(qty).filter(([, v]) => v > 0).map(([k]) => k);
  const notOrderable = wanted.filter((h) => !orderRows.find((r) => r.handle === h)?.orderable);
  if (notOrderable.length) {
    const names = notOrderable.map((h) => rows.find((r) => r.handle === h)?.title ?? h).join(", ");
    return { ok: false, error: `Diese Artikel sind gerade nicht bestellbar: ${names}. Bitte entferne sie aus der Bestellung.` };
  }
  const calc = calcDealerOrder(orderRows, qty, settings.shipping);
  if (calc.blocked.length) return { ok: false, error: `${calc.blocked.join(", ")} gibt es nur ab Palette (${PALLET_MIN_TRAYS} Trays gesamt, auch gemischt).` };
  if (!calc.lines.length) return { ok: false, error: "Bitte wähle mindestens 1 Tray aus." };
  if (calc.gross !== input.expectedGross) return { ok: false, error: "Die Preise haben sich gerade geändert. Bitte lade die Seite neu und prüfe die Bestellung." };

  let order: Awaited<ReturnType<typeof createDealerOrder>>;
  try {
    order = await createDealerOrder({
      dealerId: dealer.id,
      dealerEmail: dealer.email,
      tierName,
      calc,
      delivery,
      wishDate,
      reference: text(input.reference, 60) || undefined,
      note: typeof input.note === "string" ? input.note.trim().slice(0, 1000) || undefined : undefined,
    });
  } catch (e) {
    if (e instanceof DealerOrderLimitError) return { ok: false, error: e.message };
    if (e instanceof StoreUnavailableError) return { ok: false, error: "Bestellungen können gerade nicht gespeichert werden. Bitte schreib uns kurz per E-Mail." };
    console.error("[haendler-bestellung]", e);
    return { ok: false, error: "Die Bestellung konnte nicht gespeichert werden. Bitte versuche es noch einmal." };
  }

  await notifyDealer({
    to: dealer.id,
    type: "bestellung",
    title: `Bestellung ${order.number} ist eingegangen`,
    body: `${calc.trays} Trays · ${(calc.gross / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} (voraussichtlich, inkl. MwSt.). Wir prüfen sie und melden uns mit der Bestätigung.`,
    link: "/haendler/portal/bestellungen",
    linkLabel: "Meine Bestellungen",
  });

  // E-Mails: Bestätigung an den Händler, Info an den Shop (Fehler beim Versand verhindern die Bestellung nicht)
  if (mailReady()) {
    const mail = await getMailSettings();
    const replyTo = isPlaceholder(settings.company.email) ? undefined : settings.company.email.trim();
    await sendMail({ to: { email: dealer.email, name: dealer.contact }, ...dealerOrderConfirmationMail(order, settings), replyTo, tag: "haendler-bestellung" }).catch((e) =>
      console.error("[haendler-bestellung] Bestätigung fehlgeschlagen", order.number, e),
    );
    const adminTo = mail.adminEmail.trim() || (replyTo ?? "");
    // Eigener Schalter „Neue Händler-Bestellung“ – sendMail() prüft ihn
    if (adminTo) {
      await sendMail({ to: { email: adminTo }, ...adminNewDealerOrderMail(order, settings), replyTo: dealer.email, tag: "neue-haendler-bestellung" }).catch((e) =>
        console.error("[haendler-bestellung] Shop-Info fehlgeschlagen", order.number, e),
      );
    }
  }

  revalidatePath("/haendler/portal/bestellungen");
  revalidatePath("/admin/haendler/bestellungen");
  return { ok: true, number: order.number };
}
