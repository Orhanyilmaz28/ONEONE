import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "../auth-form";
import { AuthShell } from "../auth-shell";
import { getCurrentDealer } from "@/lib/dealer-auth";

export const metadata: Metadata = { title: "Händler-Login", robots: { index: false, follow: false } };

export default async function DealerLoginPage() {
  if (await getCurrentDealer()) redirect("/haendler/portal");
  return (
    <AuthShell eyebrow="Händlerbereich" title="Willkommen zurück.">
      <LoginForm />
      <p className="mt-6 text-center text-muted text-sm">
        Noch kein Händler?{" "}
        <Link className="text-accent underline" href="/haendler">
          Jetzt registrieren
        </Link>
      </p>
    </AuthShell>
  );
}
