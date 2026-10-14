"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { DEALER_ORDER_STATUS, type DealerOrderStatus, setDealerOrderStatus } from "@/lib/dealer-orders";

/** Status einer Händler-Bestellung setzen (Server Actions sind öffentlich erreichbar – deshalb zuerst die Anmeldung prüfen) */
export async function setDealerOrderStatusAction(form: FormData): Promise<void> {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!/^[a-f0-9]{16}$/.test(id) || !(status in DEALER_ORDER_STATUS)) return;
  await setDealerOrderStatus(id, status as DealerOrderStatus);
  revalidatePath("/admin/haendler/bestellungen");
  revalidatePath("/haendler/portal/bestellungen");
}
