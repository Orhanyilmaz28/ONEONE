import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { type MailLogStatus, getMailLog } from "@/lib/mail-log";
import { LogTable } from "../log-table";

export const metadata: Metadata = { title: "E-Mail-Protokoll" };

const FILTERS: { key: MailLogStatus | "alle"; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "fehler", label: "Fehler" },
  { key: "ok", label: "Verschickt" },
  { key: "aus", label: "Ausgeschaltet" },
];

export default async function MailLogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.some((f) => f.key === status) ? (status as MailLogStatus | "alle") : "alle";
  const log = await getMailLog();
  const list = filter === "alle" ? log : log.filter((e) => e.status === filter);

  return (
    <>
      <PageHeader
        actions={
          <Link className="font-medium text-[14px] underline underline-offset-4" href="/admin/emails">
            ← Zurück zu E-Mails
          </Link>
        }
        description="Welche E-Mail wann an wen ging – die letzten 30 Tage, höchstens 300 Einträge. Ist eine nicht angekommen, kannst du sie 7 Tage lang nochmal senden."
        title="E-Mail-Protokoll"
      />
      <Card>
        <nav aria-label="Filter" className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              aria-current={f.key === filter ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] ring-1 ${f.key === filter ? "bg-ink text-white ring-ink" : "text-ink/75 ring-line hover:ring-ink/30"}`}
              href={f.key === "alle" ? "/admin/emails/protokoll" : `/admin/emails/protokoll?status=${f.key}`}
              key={f.key}
            >
              {f.label} ({f.key === "alle" ? log.length : log.filter((e) => e.status === f.key).length})
            </Link>
          ))}
        </nav>
        {list.length ? <LogTable entries={list} /> : <p className="text-[14px] text-muted">Keine Einträge.</p>}
      </Card>
    </>
  );
}
