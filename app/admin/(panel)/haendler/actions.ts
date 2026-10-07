"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type DealerStatus, deleteDealer, setDealerStatus } from "@/lib/dealer-store";

const STATUS: DealerStatus[] = ["neu", "freigegeben", "abgelehnt"];

/** Status einer Händler-Anfrage ändern (Server Actions sind öffentlich erreichbar – deshalb zuerst die Anmeldung prüfen) */
export async function setDealerStatusAction(id: string, status: string): Promise<void> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id) || !STATUS.includes(status as DealerStatus)) return;
  await setDealerStatus(id, status as DealerStatus);
  revalidatePath("/admin/haendler");
}

export async function deleteDealerAction(id: string): Promise<void> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) return;
  await deleteDealer(id);
  revalidatePath("/admin/haendler");
}
