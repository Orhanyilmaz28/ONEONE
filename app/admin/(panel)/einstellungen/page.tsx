import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import Link from "next/link";
import { mailReady } from "@/lib/mail";
import { DEFAULT_SETTINGS, companyDiff, getSettings } from "@/lib/settings";
import { CompanySyncCard } from "./company-sync-card";
import { storeKind, strictReads } from "@/lib/store";
import { getSiteLock } from "@/lib/site-lock";
import { LockCard } from "./lock-card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, lock] = await strictReads(() => Promise.all([getSettings(), getSiteLock()]));
  return (
    <>
      <PageHeader
        description="Firmendaten fürs Impressum, Versandkosten, Rücksendekosten und ein optionaler Aktions-Hinweis. Was du hier speicherst, ist nach wenigen Sekunden im ganzen Shop zu sehen."
        title="Einstellungen"
      />
      <CompanySyncCard canSave={storeKind() !== "none"} diff={companyDiff(settings.company)} />
      <LockCard enabled={lock.enabled} hasPassword={Boolean(lock.hash)} message={lock.message ?? ""} siteUrl="" />
      <SettingsForm canSave={storeKind() !== "none"} defaults={DEFAULT_SETTINGS.shipping} settings={settings} />
      <div className="mt-8" id="emails">
        <Card title="E-Mails">
          <p className="text-[14px] text-muted leading-relaxed">
            {mailReady() ? "Der E-Mail-Versand ist eingerichtet." : "Der E-Mail-Versand ist noch nicht eingerichtet."} Schalter, Vorschau aller E-Mails und das Versandprotokoll findest du jetzt
            unter{" "}
            <Link className="font-medium text-ink underline underline-offset-4" href="/admin/emails">
              E-Mails
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}
