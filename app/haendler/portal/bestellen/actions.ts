"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProducts } from "@/lib/catalog";
import { getCurrentDealer } from "@/lib/dealer-auth";
import { type DealerOrder, type DealerOrderLine, DealerOrderError, MAX_TRAYS, addDealerOrder, priceLines } from "@/lib/dealer-orders";
import { dealerRows } from "@/lib/dealer-rows";
import { mailReady, sendMail } from "@/lib/mail";
import { getMailSettings } from "@/lib/mail-settings";
import { dealerOrderConfirmMail, dealerOrderShopMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

export type OrderFormState = { error?: string };

const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

/** Bestellung aus dem Händlerbereich. Preise kommen ausschließlich aus der Preisliste des angemeldeten Händlers. */
export async function placeDealerOrder(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const dealer = await getCurrentDealer();
  if (!dealer) redirect("/haendler/login");
  if (form.get("confirm") !== "1") return { error: "Bitte bestätige, dass du verbindlich bestellen möchtest." };

  const { rows } = await dealerRows(dealer, await getProducts());
  const lines: DealerOrderLine[] = [];
  for (const row of rows) {
    const raw = String(form.get(`qty:${row.handle}`) ?? "").trim();
    if (!raw || raw === "0") continue;
    const trays = Number(raw);
    if (!Number.isInteger(trays) || trays < 0 || trays > MAX_TRAYS) return { error: `Bitte gib bei „${row.title}“ eine ganze Zahl zwischen 0 und ${MAX_TRAYS} ein.` };
    if (row.available === false) return { error: `„${row.title}“ ist gerade nicht lieferbar.` };
    const priced = priceLines(row, trays);
    if (!priced.length) return { error: `Für „${row.title}“ ist noch kein Preis hinterlegt – bitte frag uns direkt an.` };
    lines.push(...priced);
  }
  const note = String(form.get("note") ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, 1000);

  let order: DealerOrder;
  try {
    order = await addDealerOrder(dealer, lines, note);
  } catch (error) {
    if (error instanceof DealerOrderError) return { error: error.message };
    if (error instanceof StoreUnavailableError) return { error: "Bestellen ist gerade nicht möglich (kein Datenspeicher verbunden). Bitte melde dich direkt bei uns." };
    console.error("[haendler] Bestellung speichern fehlgeschlagen", error);
    return { error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }

  // E-Mails: an den Shop und als Eingangsbestätigung an den Händler (Fehler blockieren die Bestellung nicht – sie ist gespeichert)
  if (mailReady()) {
    const [settings, mail] = await Promise.all([getSettings(), getMailSettings()]);
    const shopTo = mail.adminEmail.trim() || (isPlaceholder(settings.company.email) ? "" : settings.company.email.trim());
    const replyTo = isPlaceholder(settings.company.email) ? undefined : settings.company.email.trim();
    const results = await Promise.all([
      shopTo ? sendMail({ to: { email: shopTo }, ...dealerOrderShopMail(order, settings), replyTo: order.dealer.email, tag: "haendler-bestellung" }) : null,
      sendMail({ to: { email: order.dealer.email, name: order.dealer.contact }, ...dealerOrderConfirmMail(order, settings), replyTo, tag: "haendler-bestellung-bestaetigung" }),
    ]);
    for (const r of results) if (r && !r.ok) console.error("[haendler] Bestell-E-Mail fehlgeschlagen", order.number, r.error);
  }

  revalidatePath("/haendler/portal/bestellungen");
  revalidatePath("/admin/haendler/bestellungen");
  redirect(`/haendler/portal/bestellungen?neu=${encodeURIComponent(order.number)}`);
}
