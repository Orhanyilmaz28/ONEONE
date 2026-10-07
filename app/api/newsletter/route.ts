import { SITE_URL } from "@/lib/format";
import { mailReady, sendMail } from "@/lib/mail";
import { newsletterConfirmMail } from "@/lib/mail-templates";
import { addSubscriber, normalizeEmail, normalizeSource, requestSubscription, SubscriberLimitError } from "@/lib/newsletter-store";
import { forwardToWebhook } from "@/lib/newsletter-forward";
import { getSettings } from "@/lib/settings";
import { StoreUnavailableError } from "@/lib/store";

/**
 * Newsletter-Anmeldung.
 * - Mit E-Mail-Versand (BREVO_API_KEY/RESEND_API_KEY + MAIL_FROM): Double-Opt-In – erst nach Klick auf den Link in der
 *   Bestätigungs-E-Mail gilt die Adresse als angemeldet (dann auch Weitergabe an Brevo-Liste / NEWSLETTER_WEBHOOK_URL).
 * - Ohne E-Mail-Versand: Adresse wird nur gesammelt (Dashboard → Newsletter, CSV-Export) und ggf. an NEWSLETTER_WEBHOOK_URL weitergeleitet.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > 2000) return Response.json({ error: "Ungültige Anfrage" }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  // Spam-Schutz: verstecktes Feld ausgefüllt → so tun, als hätte es geklappt
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  const source = normalizeSource(body.source);

  // ── Double-Opt-In ──
  if (mailReady()) {
    let res: Awaited<ReturnType<typeof requestSubscription>>;
    try {
      res = await requestSubscription(email, source);
    } catch (e) {
      if (e instanceof SubscriberLimitError) console.error("[newsletter]", e.message);
      else if (!(e instanceof StoreUnavailableError)) console.error("[newsletter] Speichern fehlgeschlagen", e);
      return Response.json({ error: "Anmeldung fehlgeschlagen – bitte später erneut versuchen." }, { status: 503 });
    }
    // Schon bestätigt: gleiche Antwort wie bei Neuanmeldung (verrät nicht, wer angemeldet ist)
    if (res.token) {
      const mail = newsletterConfirmMail(`${SITE_URL}/newsletter/bestaetigen?t=${res.token}`, await getSettings());
      const sent = await sendMail({ to: { email }, ...mail, tag: "newsletter-bestaetigung" });
      if (!sent.ok) {
        console.error("[newsletter] Bestätigungs-E-Mail fehlgeschlagen", sent.error);
        return Response.json({ error: "Die Bestätigungs-E-Mail konnte gerade nicht verschickt werden. Bitte versuche es später noch einmal." }, { status: 503 });
      }
    }
    return Response.json({ ok: true, pending: true });
  }

  // ── Ohne E-Mail-Versand: nur sammeln ──
  let stored = false;
  try {
    await addSubscriber(email, source);
    stored = true;
  } catch (e) {
    if (e instanceof SubscriberLimitError) console.error("[newsletter]", e.message);
    else if (!(e instanceof StoreUnavailableError)) console.error("[newsletter] Speichern fehlgeschlagen", e);
  }
  const forwarded = await forwardToWebhook(email, source);
  if (!stored && !forwarded) return Response.json({ error: "Anmeldung fehlgeschlagen" }, { status: 503 });
  return Response.json({ ok: true });
}
