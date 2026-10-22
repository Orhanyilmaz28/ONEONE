"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { StatementError, createStatement, setStatementPaid } from "@/lib/commissions";
import { SITE_URL } from "@/lib/format";
import { MAX_PCT } from "@/lib/influencer-rules";
import { CodeTakenError, type InfluencerStatus, deleteInfluencer, getInfluencer, renewInfluencerActivation, setInfluencerStatus, setInfluencerTerms } from "@/lib/influencers";
import { mailReady, sendMail } from "@/lib/mail";
import { influencerApprovedMail, influencerStatementMail } from "@/lib/mail-templates";
import { getSettings } from "@/lib/settings";

const ID = /^[a-f0-9]{16}$/;
const STATUS: InfluencerStatus[] = ["neu", "freigegeben", "abgelehnt"];
export type TermsState = { error?: string; ok?: string; values?: { code: string; discountPct: string; commissionPct: string } } | undefined;

const replyToOf = (settings: Awaited<ReturnType<typeof getSettings>>) => {
  const e = settings.company.email.trim();
  return e && !/^\[.*\]$/.test(e) ? e : undefined;
};

/** Freischalt-Mail mit Aktivierungs-Link (ohne E-Mail-Versand kopierst du den Link im Dashboard) */
async function mailActivation(id: string) {
  if (!mailReady()) return;
  const i = await getInfluencer(id);
  if (!i?.activationToken) return;
  const link = `${SITE_URL}/influencer/aktivieren?id=${i.id}&t=${i.activationToken}`;
  const settings = await getSettings();
  await sendMail({ to: { email: i.email, name: i.name }, ...influencerApprovedMail(i, link, settings), replyTo: replyToOf(settings), tag: "influencer-freischaltung" }).catch((e) => console.error("[influencer] Freischalt-Mail fehlgeschlagen", e));
}

function pct(v: FormDataEntryValue | null) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= MAX_PCT ? Math.round(n * 10) / 10 : null;
}

/** Code, Rabatt und Provision speichern – mit „approve“ zugleich freischalten */
export async function saveTermsAction(_prev: TermsState, form: FormData): Promise<TermsState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Bitte melde dich erneut an." };
  }
  const id = String(form.get("id") ?? "");
  if (!ID.test(id)) return { error: "Ungültiger Eintrag." };
  const values = { code: String(form.get("code") ?? "").slice(0, 30), discountPct: String(form.get("discountPct") ?? ""), commissionPct: String(form.get("commissionPct") ?? "") };
  const discountPct = pct(form.get("discountPct"));
  const commissionPct = pct(form.get("commissionPct"));
  if (discountPct === null || commissionPct === null) return { values, error: `Rabatt und Provision: 0 bis ${MAX_PCT} %.` };
  const approve = form.get("approve") === "1";
  try {
    await setInfluencerTerms(id, { code: String(form.get("code") ?? ""), discountPct, commissionPct, active: form.get("active") === "on" || approve });
    if (approve) {
      await setInfluencerStatus(id, "freigegeben");
      await mailActivation(id);
    }
  } catch (e) {
    if (e instanceof CodeTakenError) return { values, error: e.message };
    console.error("[influencer] Speichern fehlgeschlagen", e);
    return { error: "Speichern hat nicht geklappt." };
  }
  revalidatePath("/admin/influencer", "layout");
  return { ok: approve ? "Freigeschaltet – der Zugangs-Link ist unterwegs." : "Gespeichert." };
}

export async function setInfluencerStatusAction(id: string, status: string): Promise<void> {
  await assertAdmin();
  if (!ID.test(id) || !STATUS.includes(status as InfluencerStatus)) return;
  const i = await getInfluencer(id);
  if (status === "freigegeben" && !i?.code) return; // Freischalten nur mit Code (Formular oben)
  await setInfluencerStatus(id, status as InfluencerStatus);
  if (status === "freigegeben") await mailActivation(id);
  revalidatePath("/admin/influencer", "layout");
}

export async function renewInfluencerActivationAction(id: string): Promise<void> {
  await assertAdmin();
  if (!ID.test(id)) return;
  if (await renewInfluencerActivation(id)) await mailActivation(id);
  revalidatePath("/admin/influencer", "layout");
}

export async function deleteInfluencerAction(id: string): Promise<void> {
  await assertAdmin();
  if (!ID.test(id)) return;
  await deleteInfluencer(id);
  revalidatePath("/admin/influencer", "layout");
}

export type StatementState = { error?: string; ok?: string } | undefined;

/** Monatsgutschrift erstellen (und auf Wunsch dem Influencer per E-Mail Bescheid geben) */
export async function createStatementAction(_prev: StatementState, form: FormData): Promise<StatementState> {
  try {
    await assertAdmin();
  } catch {
    return { error: "Bitte melde dich erneut an." };
  }
  const id = String(form.get("id") ?? "");
  const month = String(form.get("month") ?? "");
  if (!ID.test(id)) return { error: "Ungültiger Eintrag." };
  try {
    const s = await createStatement(id, month);
    const i = await getInfluencer(id);
    if (i && mailReady()) {
      const link = `${SITE_URL}/influencer/portal/gutschriften/${s.id}`;
      const settings = await getSettings();
      await sendMail({ to: { email: i.email, name: i.name }, ...influencerStatementMail(i, s, link, settings), replyTo: replyToOf(settings), tag: "influencer-gutschrift" }).catch((e) => console.error("[influencer] Gutschrift-Mail fehlgeschlagen", e));
    }
    revalidatePath("/admin/influencer", "layout");
    return { ok: `Gutschrift ${s.number} erstellt.` };
  } catch (e) {
    if (e instanceof StatementError) return { error: e.message };
    console.error("[influencer] Gutschrift fehlgeschlagen", e);
    return { error: "Gutschrift konnte nicht erstellt werden." };
  }
}

export async function setStatementPaidAction(id: string, influencerId: string, paid: boolean): Promise<void> {
  await assertAdmin();
  if (!ID.test(id)) return;
  await setStatementPaid(id, paid);
  revalidatePath(`/admin/influencer/${influencerId}`);
  revalidatePath("/admin/influencer");
}
