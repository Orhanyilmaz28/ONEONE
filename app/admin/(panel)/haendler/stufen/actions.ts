"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-auth";
import { saveTiers } from "@/lib/dealer-data";
import type { Tier } from "@/lib/dealer-pricing";

export type TierState = { ok?: string; error?: string } | undefined;

/** Stufen speichern: bestehende (tier_<id>_name/_pct) plus eine neue (new_name/new_pct); leerer Name = Stufe entfällt */
export async function saveTiersAction(_prev: TierState, form: FormData): Promise<TierState> {
  await assertAdmin();
  const ids = String(form.get("ids") ?? "").split(",").filter((i) => /^[a-z0-9-]{1,40}$/.test(i));
  const out: Tier[] = [];
  const entries: [string, string, string][] = ids.map((id) => [id, String(form.get(`name_${id}`) ?? ""), String(form.get(`pct_${id}`) ?? "")]);
  const fresh = String(form.get("new_name") ?? "").trim();
  if (fresh) entries.push([`s${Date.now().toString(36)}`, fresh, String(form.get("new_pct") ?? "0")]);
  for (const [id, nameRaw, pctRaw] of entries) {
    const name = nameRaw.trim().slice(0, 40);
    if (!name) continue;
    const pct = Number(pctRaw.replace(",", ".").trim() || "0");
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) return { error: `Bitte bei „${name}“ einen Prozentwert zwischen 0 und 90 eintragen.` };
    out.push({ id, name, percent: Math.round(pct * 10) / 10 });
  }
  if (!out.length) return { error: "Mindestens eine Stufe muss bleiben." };
  if (new Set(out.map((t) => t.name.toLowerCase())).size !== out.length) return { error: "Zwei Stufen haben denselben Namen." };
  await saveTiers(out);
  revalidatePath("/haendler/portal", "layout");
  revalidatePath("/admin/haendler", "layout");
  return { ok: "Stufen gespeichert." };
}
