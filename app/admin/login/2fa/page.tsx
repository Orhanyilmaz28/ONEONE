import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth-card";
import { currentAdminSession } from "@/lib/admin-auth";
import { cancelLogin } from "../../actions";
import { CodeForm } from "./code-form";

export const dynamic = "force-dynamic";

/** Zweiter Schritt der Anmeldung: Code aus der Authenticator-App */
export default async function SecondFactorPage() {
  const s = await currentAdminSession();
  if (s?.stage === "full") redirect("/admin");
  if (s?.stage !== "2fa") redirect("/admin/login");
  return (
    <AuthCard back={null} text="Gib den 6-stelligen Code aus deiner Authenticator-App ein." title="Bestätigung">
      <CodeForm />
      <form action={cancelLogin} className="mt-6">
        <button className="text-muted text-sm hover:text-ink" type="submit">
          ← Abbrechen
        </button>
      </form>
    </AuthCard>
  );
}
