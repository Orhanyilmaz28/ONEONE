import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { StatementDoc } from "@/components/statement-doc";
import { getStatement } from "@/lib/commissions";
import { requireInfluencer } from "@/lib/influencer-auth";

export const metadata = { title: "Gutschrift" };

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const inf = await requireInfluencer();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const s = await getStatement(id);
  if (!s || s.influencerId !== inf.id) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link className="text-muted text-sm underline hover:text-accent" href="/influencer/portal/gutschriften">
          ← Gutschriften
        </Link>
        <PrintButton className="ml-auto inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black transition hover:bg-accent-dark" />
      </div>
      <div className="overflow-x-auto rounded-2xl">
        <StatementDoc s={s} />
      </div>
    </div>
  );
}
