import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth-card";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { btn } from "@/components/admin/ui";
import { currentAdminSession } from "@/lib/admin-auth";
import { qrSvg } from "@/lib/admin-security/qr";
import { pendingSetup } from "@/lib/admin-security/two-factor";
import { cancelLogin, confirmForcedSetup, startForcedSetup } from "../../actions";

export const dynamic = "force-dynamic";

/** Erzwungene Einrichtung (ADMIN_REQUIRE_2FA=1, aber noch keine 2FA): erst danach gibt es Zugriff aufs Dashboard */
export default async function ForcedSetupPage({ searchParams }: { searchParams: Promise<{ zuviele?: string }> }) {
  const s = await currentAdminSession();
  // nach erfolgreicher Einrichtung ist die Sitzung „full“ – die Seite bleibt, damit die Codes angezeigt werden können
  if (!s || (s.stage !== "setup" && s.stage !== "full")) redirect("/admin/login");
  const setup = s.stage === "setup" ? await pendingSetup(s.id, "Dashboard").catch(() => null) : null;
  const { zuviele } = await searchParams;
  return (
    <AuthCard back={null} text="Für das Dashboard ist eine Zwei-Faktor-Anmeldung vorgeschrieben. Richte sie jetzt einmalig ein." title="Zwei-Faktor einrichten">
      <div className="mt-6">
        {zuviele ? <p className="mb-4 text-red-700 text-sm">Zu viele Versuche. Bitte später erneut versuchen.</p> : null}
        <TwoFactorSetup action={confirmForcedSetup} doneHref="/admin" setup={setup ? { qr: qrSvg(setup.uri), secret: setup.secret } : null}>
          {s.stage === "full" ? (
            <a className={`${btn} w-full`} href="/admin">
              Zum Dashboard
            </a>
          ) : (
            <form action={startForcedSetup}>
              <button className={`${btn} w-full`} type="submit">
                Einrichtung starten
              </button>
            </form>
          )}
        </TwoFactorSetup>
      </div>
      <form action={cancelLogin} className="mt-6">
        <button className="text-muted text-sm hover:text-ink" type="submit">
          ← Abbrechen
        </button>
      </form>
    </AuthCard>
  );
}
