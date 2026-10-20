import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth-card";
import { Notice } from "@/components/admin/ui";
import { adminConfigured, currentAdminSession } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ abgelaufen?: string }> }) {
  const s = await currentAdminSession();
  if (s?.stage === "full") redirect("/admin");
  if (s?.stage === "2fa") redirect("/admin/login/2fa");
  if (s?.stage === "setup") redirect("/admin/login/einrichten");
  const { abgelaufen } = await searchParams;
  return (
    <AuthCard text="Melde dich an, um Bestellungen, Produkte und Einstellungen zu verwalten." title="Dashboard">
      {abgelaufen ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Der Anmeldevorgang ist abgelaufen. Bitte erneut anmelden.</p> : null}
      {adminConfigured() ? (
        <LoginForm />
      ) : (
        <div className="mt-6">
          <Notice title="Noch kein Passwort eingerichtet">
            Lege in Vercel unter <b>Settings → Environment Variables</b> die Variable <code>ADMIN_PASSWORD</code> an (mindestens 8 Zeichen) und stelle die
            Seite neu bereit. Lokal: Datei <code>.env.local</code>.
          </Notice>
        </div>
      )}
    </AuthCard>
  );
}
