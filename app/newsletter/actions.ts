"use server";

import { redirect } from "next/navigation";
import { addToNewsletterList, removeFromNewsletterList } from "@/lib/mail";
import { forwardToWebhook } from "@/lib/newsletter-forward";
import { confirmSubscription, unsubscribeByToken } from "@/lib/newsletter-store";

export async function confirmAction(form: FormData) {
  const token = String(form.get("t") ?? "");
  const res = await confirmSubscription(token).catch(() => null);
  if (!res) redirect("/newsletter/bestaetigen?status=ungueltig");
  if (!res.already) {
    // Erst nach der Bestätigung an Brevo bzw. das Newsletter-Tool weitergeben
    await Promise.all([addToNewsletterList(res.email), forwardToWebhook(res.email, "website")]).catch(() => undefined);
  }
  redirect(`/newsletter/bestaetigen?status=ok&t=${encodeURIComponent(token)}`);
}

export async function unsubscribeAction(form: FormData) {
  const token = String(form.get("t") ?? "");
  const email = await unsubscribeByToken(token).catch(() => null);
  if (email) await removeFromNewsletterList(email).catch(() => undefined);
  redirect(`/newsletter/abmelden?status=${email ? "ok" : "ungueltig"}`);
}
