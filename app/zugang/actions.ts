"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_COOKIE, SITE_COOKIE_DAYS, type SiteLock, checkSitePassword, getSiteLockStrict, safeTarget, siteToken } from "@/lib/site-lock";

export type UnlockState = { error?: string };

export async function unlock(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const password = String(form.get("password") ?? "").slice(0, 200);
  const target = safeTarget(form.get("weiter"));
  let lock: SiteLock;
  try {
    lock = await getSiteLockStrict();
  } catch {
    return { error: "Der Shop ist gerade kurz nicht erreichbar. Bitte versuche es gleich noch einmal." };
  }
  if (!lock.enabled) redirect(target);
  if (!password) return { error: "Bitte gib das Passwort ein." };
  if (!(await checkSitePassword(password, lock.hash))) {
    // kurze Pause erschwert das Durchprobieren
    await new Promise((r) => setTimeout(r, 700));
    return { error: "Das Passwort stimmt leider nicht." };
  }
  (await cookies()).set(SITE_COOKIE, siteToken(lock), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_COOKIE_DAYS * 86_400,
  });
  redirect(target);
}
