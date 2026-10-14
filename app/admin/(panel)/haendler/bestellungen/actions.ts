"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { DEALER_ORDER_STATUS, type DealerOrderStatus, setDealerOrderStatus } from "@/lib/dealer-orders";
import { mailReady, sendMail } from "@/lib/mail";
import { dealerOrderStatusMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";

const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

/** Status einer Händler-Bestellung ändern – auf Wunsch mit E-Mail an den Händler (Server Actions sind öffentlich: zuerst Anmeldung prüfen) */
export async function setDealerOrderStatusAction(form: FormData): Promise<void> {
  await assertAdmin();
  const id = form.get("id");
  const status = form.get("status");
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id) || typeof status !== "string" || !DEALER_ORDER_STATUS.includes(status as DealerOrderStatus)) return;
  const order = await setDealerOrderStatus(id, status as DealerOrderStatus);
  if (order && form.get("notify") === "on" && mailReady()) {
    const settings = await getSettings();
    const replyTo = isPlaceholder(settings.company.email) ? undefined : settings.company.email.trim();
    await sendMail({ to: { email: order.dealerEmail, name: order.delivery.contact }, ...dealerOrderStatusMail(order, settings), replyTo, tag: "haendler-bestellstatus" }).catch((e) =>
      console.error("[haendler-bestellung] Status-Mail fehlgeschlagen", order.number, e),
    );
  }
  revalidatePath("/admin/haendler/bestellungen");
  revalidatePath("/haendler/portal/bestellungen");
}
