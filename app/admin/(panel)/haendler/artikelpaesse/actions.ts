"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { removePass } from "@/lib/dealer-data";

export async function removePassAction(key: string): Promise<void> {
  await assertAdmin();
  if (typeof key !== "string" || !/^[a-z0-9-]{1,80}$/.test(key)) return;
  await removePass(key);
  revalidatePath("/admin/haendler/artikelpaesse");
  revalidatePath("/haendler/portal", "layout");
}
