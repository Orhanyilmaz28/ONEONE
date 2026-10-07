import { getBaseProduct } from "@/lib/catalog";
import { addReview, type NewReview, ReviewLimitError, type StoredReview } from "@/lib/review-store";
import { REVIEW_LIMITS } from "@/lib/reviews";
import { StoreUnavailableError } from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Größere Anfragen sind sicher kein normales Formular */
const MAX_BODY = 16_000;
/** Schneller als das füllt kein Mensch das Formular aus (Millisekunden) */
const MIN_FILL_MS = 2500;

/** Steuerzeichen und unsichtbare Richtungs-/Breitenzeichen entfernen */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

function line(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim() : "";
}

function paragraph(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Neue Bewertung entgegennehmen. Bewertungen werden NICHT automatisch veröffentlicht:
 * Sie landen im Dashboard unter „Bewertungen“ (Status „Neu“) und erscheinen erst nach der Freigabe im Shop.
 * Optional zusätzlich an REVIEW_WEBHOOK_URL (z. B. E-Mail-Benachrichtigung via Zapier/Make, Slack).
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY) return error("Die Bewertung ist zu lang.", 413);
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    return error("Ungültige Anfrage.");
  }

  // Spam-Schutz: verstecktes Feld ausgefüllt oder unmenschlich schnell → so tun, als hätte es geklappt
  const elapsed = typeof body.elapsed === "number" ? body.elapsed : Number.NaN;
  if (line(body.website) || (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS)) {
    return Response.json({ ok: true });
  }

  const product = typeof body.product === "string" ? body.product : "";
  const rating = Number(body.rating);
  const name = line(body.name);
  const email = line(body.email);
  const text = paragraph(body.text);

  if (!(await getBaseProduct(product))) return error("Unbekanntes Produkt.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error("Bitte 1–5 Sterne wählen.");
  if (text.length < REVIEW_LIMITS.textMin) return error(`Bitte schreib mindestens ${REVIEW_LIMITS.textMin} Zeichen.`);
  if (text.length > REVIEW_LIMITS.text) return error(`Bitte schreib höchstens ${REVIEW_LIMITS.text.toLocaleString("de-DE")} Zeichen.`);
  if (!name) return error("Bitte gib deinen Vornamen an.");
  if (name.length > REVIEW_LIMITS.name) return error(`Der Name darf höchstens ${REVIEW_LIMITS.name} Zeichen lang sein.`);
  if (email.length > REVIEW_LIMITS.email || !EMAIL.test(email)) return error("Bitte gib eine gültige E-Mail-Adresse an.");

  const input: NewReview = {
    product,
    rating,
    name,
    email,
    title: line(body.title).slice(0, REVIEW_LIMITS.title),
    text,
    order: line(body.order).slice(0, REVIEW_LIMITS.order),
  };

  // 1. Im Datenspeicher ablegen (erscheint im Dashboard)
  let stored: StoredReview | null = null;
  try {
    const result = await addReview(input);
    if (result.duplicate) return Response.json({ ok: true });
    stored = result.review;
  } catch (e) {
    if (e instanceof ReviewLimitError) return error(e.message, 503);
    if (!(e instanceof StoreUnavailableError)) console.error("[review] Speichern fehlgeschlagen", e);
  }

  // 2. Optional weiterleiten (z. B. als E-Mail-Benachrichtigung)
  const webhook = process.env.REVIEW_WEBHOOK_URL;
  let forwarded = false;
  if (webhook) {
    const payload = stored ?? { ...input, createdAt: new Date().toISOString(), status: "pending" };
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    forwarded = Boolean(res?.ok);
    if (!forwarded) console.error("[review] Weiterleitung an REVIEW_WEBHOOK_URL fehlgeschlagen", res?.status);
  }

  if (!stored && !forwarded) {
    console.error("[review] Bewertung konnte weder gespeichert noch weitergeleitet werden:", product);
    return error("Deine Bewertung konnte gerade nicht gespeichert werden. Bitte versuche es später noch einmal.", 503);
  }
  return Response.json({ ok: true });
}
