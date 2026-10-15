"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/customer-rules";
import { endInfluencerSession, getCurrentInfluencer, startInfluencerSession } from "@/lib/influencer-auth";
import { formatIban, validIban } from "@/lib/influencer-rules";
import { checkInfluencerActivation, checkInfluencerLogin, completeInfluencerActivation, setInfluencerMarketing, updateInfluencerProfile } from "@/lib/influencers";
import { StoreUnavailableError } from "@/lib/store";

export type FormState = { error?: string; email?: string; ok?: string; values?: Record<string, string | boolean> } | undefined;

export async function influencerLoginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, PASSWORD_MAX);
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben.", email };
  let result: Awaited<ReturnType<typeof checkInfluencerLogin>>;
  try {
    result = await checkInfluencerLogin(email, password);
  } catch (e) {
    if (!(e instanceof StoreUnavailableError)) console.error("[influencer] Login fehlgeschlagen", e);
    return { error: "Anmeldung gerade nicht möglich. Bitte später erneut versuchen.", email };
  }
  if ("error" in result) {
    return { error: result.error === "locked" ? `Zu viele Versuche. Bitte warte ${result.minutes ?? 15} Minuten.` : "E-Mail oder Passwort stimmt nicht – oder dein Zugang ist noch nicht freigeschaltet.", email };
  }
  await startInfluencerSession(result.influencer);
  redirect("/influencer/portal");
}

export async function influencerActivateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const token = String(form.get("t") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (password.length < PASSWORD_MIN) return { error: `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.` };
  if (password.length > PASSWORD_MAX) return { error: "Das Passwort ist zu lang." };
  if (password !== again) return { error: "Die beiden Passwörter sind nicht gleich." };
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{48}$/.test(token)) return { error: "Dieser Link ist ungültig." };
  let inf: Awaited<ReturnType<typeof completeInfluencerActivation>>;
  try {
    inf = await completeInfluencerActivation(id, token, password);
  } catch {
    return { error: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal." };
  }
  if (!inf) return { error: "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordere bei uns einen neuen an." };
  await startInfluencerSession(inf);
  redirect("/influencer/portal");
}

export async function influencerLogoutAction() {
  await endInfluencerSession();
  redirect("/influencer/login");
}

export async function influencerActivationValid(id: string, token: string) {
  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{48}$/.test(token)) return null;
  const i = await checkInfluencerActivation(id, token).catch(() => null);
  return i ? { name: i.name, alias: i.alias, code: i.code } : null;
}

const text = (form: FormData, k: string, max: number) => String(form.get(k) ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/** Konto: Anschrift, Steuerangaben und Bankverbindung */
export async function influencerProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const inf = await getCurrentInfluencer();
  if (!inf) return { error: "Bitte melde dich erneut an." };
  const patch = {
    name: text(form, "name", 100),
    phone: text(form, "phone", 40),
    street: text(form, "street", 120),
    zip: text(form, "zip", 10),
    city: text(form, "city", 80),
    smallBusiness: form.get("smallBusiness") === "on",
    taxNo: text(form, "taxNo", 30),
    vatId: text(form, "vatId", 30).toUpperCase(),
    iban: text(form, "iban", 42),
    accountHolder: text(form, "accountHolder", 100),
  };
  if (!patch.name || !patch.street || !patch.city) return { values: patch, error: "Name und Anschrift sind Pflicht (für die Gutschrift)." };
  if (!/^\d{4,5}$/.test(patch.zip)) return { values: patch, error: "Bitte gib eine gültige Postleitzahl an." };
  if (patch.iban) {
    if (!validIban(patch.iban)) return { values: patch, error: "Die IBAN stimmt nicht – bitte prüfen." };
    patch.iban = formatIban(patch.iban);
    if (!patch.accountHolder) return { values: patch, error: "Bitte gib den Kontoinhaber an." };
  }
  if (patch.vatId && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(patch.vatId)) return { values: patch, error: "Die USt-IdNr. sieht nicht richtig aus (z. B. DE123456789)." };
  try {
    await updateInfluencerProfile(inf.id, patch);
  } catch {
    return { values: patch, error: "Speichern hat nicht geklappt. Bitte später erneut versuchen." };
  }
  revalidatePath("/influencer/portal", "layout");
  return { ok: "Gespeichert." };
}

export async function influencerMarketingAction(form: FormData): Promise<void> {
  const inf = await getCurrentInfluencer();
  if (!inf) return;
  await setInfluencerMarketing(inf.id, form.get("granted") === "1");
  revalidatePath("/influencer/portal/konto");
}
