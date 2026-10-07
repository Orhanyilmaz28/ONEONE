/** Optional an ein Newsletter-Tool weiterleiten (NEWSLETTER_WEBHOOK_URL) */
export async function forwardToWebhook(email: string, source: string) {
  const webhook = process.env.NEWSLETTER_WEBHOOK_URL;
  if (!webhook) return false;
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, source, createdAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) console.error("[newsletter] Weiterleitung an NEWSLETTER_WEBHOOK_URL fehlgeschlagen", res?.status);
  return Boolean(res?.ok);
}
