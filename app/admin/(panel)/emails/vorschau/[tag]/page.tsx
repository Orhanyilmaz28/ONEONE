import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { mailReady } from "@/lib/mail";
import { renderPreview } from "@/lib/mail-previews";
import { MAIL_GROUPS, MAIL_TYPES, mailTypeOf } from "@/lib/mail-types";
import { getSettings } from "@/lib/settings";
import { Preview } from "./preview";

export const metadata: Metadata = { title: "E-Mail-Vorschau" };

export default async function MailPreviewPage({ params }: { params: Promise<{ tag: string }> }) {
  await requireAdmin();
  const { tag } = await params;
  const type = mailTypeOf(tag);
  const settings = await getSettings();
  const mail = type ? renderPreview(type.tag, settings) : null;
  if (!type || !mail) notFound();

  return (
    <>
      <PageHeader
        actions={
          <Link className="font-medium text-[14px] underline underline-offset-4" href="/admin/emails">
            ← Zurück zu E-Mails
          </Link>
        }
        description={`${type.when} Die Vorschau zeigt ausgedachte Beispieldaten.`}
        title={type.label}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
        <Card>
          <p className="mb-1 text-[12px] text-muted">Betreff</p>
          <p className="mb-5 font-medium text-[16px]">{mail.subject}</p>
          <Preview canSend={mailReady()} html={mail.html} tag={type.tag} text={mail.text} />
        </Card>
        <nav aria-label="Andere E-Mails" className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {MAIL_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 px-3 text-[11.5px] text-muted uppercase tracking-[0.1em]">{g.label}</p>
              <ul className="space-y-0.5">
                {MAIL_TYPES.filter((t) => t.group === g.key).map((t) => (
                  <li key={t.tag}>
                    <Link
                      aria-current={t.tag === type.tag ? "page" : undefined}
                      className={`block rounded-xl px-3 py-1.5 text-[14px] ${t.tag === type.tag ? "bg-ink text-white" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
                      href={`/admin/emails/vorschau/${t.tag}`}
                    >
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}
