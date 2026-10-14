"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, endAdminSession, startAdminSession } from "@/lib/admin-auth";
import { LIMITS, TOO_MANY, clientIp, countAttempt, isLimited, resetAttempts } from "@/lib/rate-limit";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const password = String(form.get("password") ?? "");
  const ip = clientIp(await headers());
  // Nach 5 Fehlversuchen von derselben IP: 15 Minuten Pause (auch ein richtiges Passwort wird dann nicht geprüft)
  if (await isLimited("admin-login", ip, LIMITS.adminLogin)) {
    console.warn("[admin] Login gesperrt (zu viele Fehlversuche)");
    return { error: TOO_MANY };
  }
  if (!checkPassword(password)) {
    await countAttempt("admin-login", ip, LIMITS.adminLogin);
    console.warn("[admin] Fehlgeschlagener Login");
    // kleine Bremse gegen Durchprobieren
    await new Promise((r) => setTimeout(r, 900));
    return { error: "Das Passwort stimmt nicht." };
  }
  await resetAttempts("admin-login", ip);
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin/login");
}
