import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { StatementDoc } from "@/components/statement-doc";
import { btn, btnSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getStatement } from "@/lib/commissions";

export const metadata: Metadata = { title: "Gutschrift" };

export default async function AdminStatementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const s = await getStatement(id);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link className={btnSecondary} href={`/admin/influencer/${s.influencerId}`}>
          ← Zurück
        </Link>
        <PrintButton className={`${btn} ml-auto`} />
      </div>
      <div className="overflow-x-auto rounded-2xl">
        <StatementDoc s={s} />
      </div>
    </div>
  );
}
