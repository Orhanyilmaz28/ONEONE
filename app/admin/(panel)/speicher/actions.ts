"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { measureStorage } from "@/lib/storage-usage";
import { KEYS, setJSON } from "@/lib/store";

export type LimitState = { ok?: string; error?: string } | undefined;

/** Speicher neu messen */
export async function measureAction(): Promise<void> {
  await assertAdmin();
  await measureStorage().catch((e) => console.error("[speicher] Messung fehlgeschlagen", e));
  revalidatePath("/admin", "layout");
}

/** Limit des Upstash-Tarifs speichern (MB) */
export async function saveLimitAction(_prev: LimitState, form: FormData): Promise<LimitState> {
  await assertAdmin();
  const preset = String(form.get("preset") ?? "");
  const raw = preset === "eigen" ? String(form.get("custom") ?? "").replace(",", ".") : preset;
  const mb = Math.round(Number(raw));
  if (!Number.isFinite(mb) || mb < 1 || mb > 10_000_000) return { error: "Bitte ein Limit in MB angeben (z. B. 256)." };
  try {
    await setJSON(KEYS.storageLimit, mb);
  } catch {
    return { error: "Speichern nicht möglich – ist ein Datenspeicher verbunden?" };
  }
  revalidatePath("/admin", "layout");
  return { ok: "Limit gespeichert." };
}
