import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDoc } from "@/components/invoice-doc";
import { PrintButton } from "@/components/print-button";
import { btn } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getDealerOrder } from "@/lib/dealer-orders";

export const metadata: Metadata = { title: "Rechnung ansehen" };

export default async function InvoiceViewAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const order = await getDealerOrder(id);
  if (!order?.invoice) notFound();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-[14px]">
        <Link className="underline" href={`/admin/haendler/bestellungen/${order.id}/rechnung`}>
          ← Rechnung bearbeiten
        </Link>
        <PrintButton className={btn} />
      </div>
      <InvoiceDoc customerNo={order.dealerId.slice(0, 8).toUpperCase()} inv={order.invoice} orderNumber={order.number} reference={order.reference} />
    </>
  );
}
