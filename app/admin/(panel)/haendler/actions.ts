"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type DealerStatus, deleteDealer, getDealer, renewActivation, setDealerStatus } from "@/lib/dealer-store";
import { SITE_URL } from "@/lib/format";
import { mailReady, sendMail } from "@/lib/mail";
import { dealerApprovedMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";
import { deleteBinary } from "@/lib/store";

const STATUS: DealerStatus[] = ["neu", "freigegeben", "abgelehnt"];

/** Status einer Händler-Anfrage ändern (Server Actions sind öffentlich erreichbar – deshalb zuerst die Anmeldung prüfen) */
export async function setDealerStatusAction(id: string, status: string): Promise<void> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id) || !STATUS.includes(status as DealerStatus)) return;
  await setDealerStatus(id, status as DealerStatus);
  if (status === "freigegeben") await mailActivation(id);
  revalidatePath("/admin/haendler");
}

/** Aktivierungs-Link per E-Mail schicken (nur wenn der E-Mail-Versand eingerichtet ist – sonst kopierst du ihn im Dashboard) */
async function mailActivation(id: string) {
  if (!mailReady()) return;
  const d = await getDealer(id);
  if (!d?.activationToken) return;
  const link = `${SITE_URL}/haendler/aktivieren?id=${d.id}&t=${d.activationToken}`;
  const settings = await getSettings();
  const replyTo = /^\[.*\]$/.test(settings.company.email.trim()) ? undefined : settings.company.email.trim() || undefined;
  await sendMail({ to: { email: d.email, name: d.contact }, ...dealerApprovedMail(d, link, settings), replyTo, tag: "haendler-freischaltung" }).catch((e) => console.error("[haendler] Freischaltungs-Mail fehlgeschlagen", e));
}

/** Neuen Zugangs-Link erzeugen (alter abgelaufen oder Passwort vergessen) */
export async function renewActivationAction(id: string): Promise<void> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) return;
  if (await renewActivation(id)) await mailActivation(id);
  revalidatePath("/admin/haendler");
}

export async function deleteDealerAction(id: string): Promise<void> {
  await assertAdmin();
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) return;
  const d = await getDealer(id);
  await deleteDealer(id);
  if (d?.proof) await deleteBinary([d.proof.id]).catch(() => undefined);
  revalidatePath("/admin/haendler");
}
