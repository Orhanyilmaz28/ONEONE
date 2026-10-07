"use server";

import { redirect } from "next/navigation";
import { checkPassword, endAdminSession, startAdminSession } from "@/lib/admin-auth";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    // kleine Bremse gegen Durchprobieren
    await new Promise((r) => setTimeout(r, 900));
    return { error: "Das Passwort stimmt nicht." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin/login");
}
