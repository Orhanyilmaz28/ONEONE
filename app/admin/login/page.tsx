import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/admin/ui";
import { Logo } from "@/components/logo";
import { adminConfigured, isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-[2rem] border border-line bg-card p-8 shadow-[0_30px_80px_-40px_rgba(20,20,20,0.35)]">
        <Logo className="h-16 w-auto" />
        <h1 className="mt-8 font-medium text-[22px] tracking-[-0.02em]">Dashboard</h1>
        <p className="mt-1 text-[15px] text-muted">Melde dich an, um Bestellungen, Produkte und Einstellungen zu verwalten.</p>
        {adminConfigured() ? (
          <LoginForm />
        ) : (
          <div className="mt-6">
            <Notice title="Noch kein Passwort eingerichtet">
              Lege in Vercel unter <b>Settings → Environment Variables</b> die Variable <code>ADMIN_PASSWORD</code> an (mindestens 8 Zeichen) und
              stelle die Seite neu bereit. Lokal: Datei <code>.env.local</code>.
            </Notice>
          </div>
        )}
        <Link className="mt-8 inline-block text-muted text-sm hover:text-ink" href="/">
          ← Zurück zum Shop
        </Link>
      </div>
    </div>
  );
}
