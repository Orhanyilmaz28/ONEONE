import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { mailProvider, mailReady, parseFrom } from "@/lib/mail";
import { getMailLog } from "@/lib/mail-log";
import { getMailSettings, mailEnabledIn } from "@/lib/mail-settings";
import { MAIL_TYPES } from "@/lib/mail-types";
import { getSettings } from "@/lib/settings";
import { strictReads } from "@/lib/store";
import { LogTable } from "./log-table";
import { MailCard } from "./mail-card";

export const metadata: Metadata = { title: "E-Mails" };

export default async function MailsPage() {
  await requireAdmin();
  const [settings, mail] = await strictReads(() => Promise.all([getSettings(), getMailSettings()]));
  const log = await getMailLog();
  const from = parseFrom();
  const companyEmail = /^\[.*\]$/.test(settings.company.email.trim()) ? "" : settings.company.email.trim();
  // Versand-Mail: Schalter = Häkchen vorausgewählt
  const enabled = Object.fromEntries(MAIL_TYPES.map((t) => [t.tag, t.tag === "versand" ? mail.shippingNotice : mailEnabledIn(mail, t.tag)]));
  const failed = log.filter((e) => e.status === "fehler" && !e.resentAt).length;

  return (
    <>
      <PageHeader
        description="Alle E-Mails, die dein Shop verschickt: einschalten oder ausschalten, mit Beispieldaten ansehen und nachlesen, was wann an wen ging."
        title="E-Mails"
      />
      <MailCard
        adminEmail={mail.adminEmail}
        enabled={enabled}
        fallbackEmail={companyEmail}
        status={{ provider: mailProvider(), ready: mailReady(), from: from ? `${from.name} <${from.email}>` : null, webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET) }}
      />
      <div className="mt-6">
        <Card
          actions={
            <Link className="font-medium text-[14px] underline underline-offset-4" href="/admin/emails/protokoll">
              Ganzes Protokoll
            </Link>
          }
          title="Zuletzt verschickt"
        >
          {failed ? (
            <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-900">
              {failed === 1 ? "1 E-Mail ist" : `${failed} E-Mails sind`} in den letzten 30 Tagen nicht angekommen. Im Protokoll kannst du sie nochmal senden.
            </p>
          ) : null}
          {log.length ? <LogTable entries={log.slice(0, 8)} /> : <p className="text-[14px] text-muted">Noch keine E-Mails verschickt.</p>}
        </Card>
      </div>
    </>
  );
}
