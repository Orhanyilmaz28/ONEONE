import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentInfluencer } from "@/lib/influencer-auth";
import { AuthShell } from "../../haendler/auth-shell";
import { LoginForm } from "../auth-form";

export const metadata: Metadata = { title: "Influencer-Login", robots: { index: false, follow: false } };

export default async function InfluencerLoginPage() {
  if (await getCurrentInfluencer()) redirect("/influencer/portal");
  return (
    <AuthShell eyebrow="Influencer-Bereich" title="Willkommen zurück.">
      <LoginForm />
      <p className="mt-6 text-center text-muted text-sm">
        Noch kein Partner?{" "}
        <Link className="text-accent underline" href="/influencer">
          Jetzt bewerben
        </Link>
      </p>
    </AuthShell>
  );
}
