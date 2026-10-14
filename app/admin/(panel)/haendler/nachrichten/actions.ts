"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { MESSAGE_TYPES, type MessageType, addMessage, deleteMessage } from "@/lib/dealer-messages";
import { getDealers } from "@/lib/dealer-store";
import { mailReady, sendMail } from "@/lib/mail";
import { dealerMessageMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";

export type SendState = { ok?: string; error?: string } | undefined;

/** Ziele im Händlerbereich, auf die eine Nachricht verlinken kann */
const LINKS: Record<string, { href: string; label: string }> = {
  preise: { href: "/haendler/portal/preise", label: "Zur Preisliste" },
  bestellungen: { href: "/haendler/portal/bestellungen", label: "Meine Bestellungen" },
  paesse: { href: "/haendler/portal/artikelpaesse", label: "Zu den Artikelpässen" },
};

const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

/** Nachricht oder Angebot an einen Händler bzw. alle senden – Angebote per E-Mail nur an Händler mit Werbe-Einwilligung */
export async function sendMessageAction(_prev: SendState, form: FormData): Promise<SendState> {
  await assertAdmin();
  const to = String(form.get("to") ?? "");
  const type = String(form.get("type") ?? "") as MessageType;
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const body = String(form.get("body") ?? "").trim().slice(0, 4000);
  const link = LINKS[String(form.get("link") ?? "")];
  const email = form.get("email") === "on";
  if (!["nachricht", "angebot"].includes(type) || !MESSAGE_TYPES.includes(type)) return { error: "Bitte die Art wählen." };
  if (!title) return { error: "Bitte einen Betreff eingeben." };
  const dealers = (await getDealers()).filter((d) => d.status === "freigegeben");
  const recipients = to === "alle" ? dealers : dealers.filter((d) => d.id === to);
  if (!recipients.length) return { error: "Bitte einen freigegebenen Händler wählen." };
  const msg = await addMessage({ to: to === "alle" ? "alle" : recipients[0].id, type, title, body, link: link?.href, linkLabel: link?.label });

  let mailed = 0;
  let skipped = 0;
  if (email && mailReady()) {
    const settings = await getSettings();
    const replyTo = isPlaceholder(settings.company.email) ? undefined : settings.company.email.trim();
    for (const d of recipients) {
      // Werbung (Angebote) nur mit Einwilligung per E-Mail – im Händlerbereich sehen sie alle
      if (type === "angebot" && !d.marketing?.granted) {
        skipped++;
        continue;
      }
      const res = await sendMail({ to: { email: d.email, name: d.contact }, ...dealerMessageMail(msg, d.contact, settings), replyTo, tag: `haendler-${type}` }).catch(() => ({ ok: false as const }));
      if (res.ok) mailed++;
    }
  }
  revalidatePath("/admin/haendler/nachrichten");
  revalidatePath("/haendler/portal", "layout");
  const who = to === "alle" ? `${recipients.length} Händler` : recipients[0].company;
  return {
    ok: `Gesendet an ${who}.${email ? (mailReady() ? ` E-Mail an ${mailed}${skipped ? `, ${skipped} ohne Werbe-Einwilligung nur im Händlerbereich` : ""}.` : " E-Mail-Versand ist nicht eingerichtet – nur im Händlerbereich.") : ""}`,
  };
}

export async function deleteMessageAction(form: FormData): Promise<void> {
  await assertAdmin();
  const id = String(form.get("id") ?? "");
  if (!/^[a-f0-9]{16}$/.test(id)) return;
  await deleteMessage(id);
  revalidatePath("/admin/haendler/nachrichten");
  revalidatePath("/haendler/portal", "layout");
}
