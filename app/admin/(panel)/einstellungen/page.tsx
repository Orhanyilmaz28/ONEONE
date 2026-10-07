import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { mailProvider, mailReady, parseFrom } from "@/lib/mail";
import { getMailSettings } from "@/lib/mail-settings";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { storeKind } from "@/lib/store";
import { getSiteLock } from "@/lib/site-lock";
import { LockCard } from "./lock-card";
import { MailCard } from "./mail-card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, mail, lock] = await Promise.all([getSettings(), getMailSettings(), getSiteLock()]);
  const from = parseFrom();
  const companyEmail = /^\[.*\]$/.test(settings.company.email.trim()) ? "" : settings.company.email.trim();
  return (
    <>
      <PageHeader
        description="Firmendaten fürs Impressum, Versandkosten, Rücksendekosten, ein optionaler Aktions-Hinweis und die E-Mails des Shops. Was du hier speicherst, ist nach wenigen Sekunden im ganzen Shop zu sehen."
        title="Einstellungen"
      />
      <LockCard enabled={lock.enabled} hasPassword={Boolean(lock.hash)} message={lock.message ?? ""} siteUrl="" />
      <SettingsForm canSave={storeKind() !== "none"} defaults={DEFAULT_SETTINGS.shipping} settings={settings} />
      <MailCard
        fallbackEmail={companyEmail}
        settings={mail}
        status={{
          provider: mailProvider(),
          ready: mailReady(),
          from: from ? `${from.name} <${from.email}>` : null,
          webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
          listId: Boolean(process.env.BREVO_LIST_ID),
        }}
      />
    </>
  );
}
