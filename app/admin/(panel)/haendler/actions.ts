"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { type DealerStatus, deleteDealer, getDealer, renewActivation, setDealerStatus } from "@/lib/dealer-store";
import { SITE_URL } from "@/lib/format";
import { mailReady, sendMail } from "@/lib/mail";
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
  await sendMail({
    to: { email: d.email, name: d.contact },
    subject: "Dein EXSTASE-Händlerzugang ist freigeschaltet",
    html: `<p>Hallo ${d.contact.replace(/[<>&]/g, "")},</p><p>wir haben <b>${d.company.replace(/[<>&]/g, "")}</b> als Händler freigeschaltet. Lege jetzt dein Passwort fest und öffne deinen Händlerbereich mit Preisliste und Artikelpässen:</p><p><a href="${link}">Zugang einrichten</a></p><p>Der Link ist 14 Tage gültig.</p><p>Dein EXSTASE-Team</p>`,
    text: `Hallo ${d.contact},\n\nwir haben ${d.company} als Händler freigeschaltet. Lege jetzt dein Passwort fest und öffne deinen Händlerbereich:\n${link}\n\nDer Link ist 14 Tage gültig.\n\nDein EXSTASE-Team`,
    tag: "haendler-freischaltung",
  }).catch((e) => console.error("[haendler] Freischaltungs-Mail fehlgeschlagen", e));
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
