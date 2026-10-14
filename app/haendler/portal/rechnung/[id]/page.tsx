import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDoc } from "@/components/invoice-doc";
import { PrintButton } from "@/components/print-button";
import { requireDealer } from "@/lib/dealer-auth";
import { invoiceVisible } from "@/lib/dealer-invoice";
import { getDealerOrder } from "@/lib/dealer-orders";

export const metadata = { title: "Rechnung" };

/** Rechnung für den Händler – nur eigene und nur, wenn freigegeben bzw. bezahlt */
export default async function DealerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const dealer = await requireDealer();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const order = await getDealerOrder(id);
  if (!order || order.dealerId !== dealer.id || !order.invoice || !invoiceVisible(order.invoice)) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link className="text-muted text-sm underline hover:text-accent" href="/haendler/portal/bestellungen">
          ← Meine Bestellungen
        </Link>
        <PrintButton className="ml-auto inline-flex h-11 items-center rounded-full bg-accent px-6 font-bold text-black transition hover:bg-accent-dark" label="Drucken / als PDF speichern" />
      </div>
      <div className="overflow-x-auto rounded-2xl">
        <InvoiceDoc customerNo={order.dealerId.slice(0, 8).toUpperCase()} inv={order.invoice} orderNumber={order.number} reference={order.reference} />
      </div>
    </div>
  );
}
