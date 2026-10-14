import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "./editor";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import type { InvoicePayload } from "./actions";
import { getDealerOrder, getInvoiceSettings } from "@/lib/dealer-orders";
import { getDealer } from "@/lib/dealer-store";

export const metadata: Metadata = { title: "Rechnung" };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id)) notFound();
  const order = await getDealerOrder(id);
  if (!order) notFound();
  const [dealer, bank] = await Promise.all([getDealer(order.dealerId), getInvoiceSettings()]);
  const inv = order.invoice;
  // Vorschlag aus der Bestellung, solange es noch keine Rechnung gibt
  const initial: InvoicePayload = inv
    ? { date: inv.date, serviceDate: inv.serviceDate, dueDays: inv.dueDays, lines: inv.lines, shippingNet: inv.shippingNet, shippingText: inv.shippingText, discountNet: inv.discountNet, discountText: inv.discountText, note: inv.note, billTo: inv.billTo }
    : {
        date: today(),
        serviceDate: today(),
        dueDays: bank.dueDays,
        lines: order.calc.lines.map((l) => ({
          text: `${l.title} – Tray ${Math.round(l.units / l.trays)} × 250 ml${l.canPrice ? ` (${(l.canPrice / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €/Dose)` : ""}`,
          qty: l.trays,
          unit: "Tray",
          price: l.perTray,
          deposit: Math.round(l.units / l.trays),
        })),
        shippingNet: order.calc.shippingNet ?? 0,
        shippingText: order.calc.shippingNet === null ? "Spedition" : "Versand",
        discountNet: 0,
        discountText: "Rabatt",
        note: bank.note,
        billTo: { company: order.delivery.company, contact: order.delivery.contact, street: dealer?.street ?? order.delivery.street, zip: dealer?.zip ?? order.delivery.zip, city: dealer?.city ?? order.delivery.city, vatId: dealer?.vatId ?? "" },
      };
  return (
    <>
      <PageHeader description={`Bestellung ${order.number} · ${order.delivery.company} · ${order.dealerEmail}`} title={inv ? `Rechnung ${inv.number}` : "Rechnung erstellen"} />
      <div className="mb-6 flex flex-wrap gap-4 text-[14px]">
        <Link className="underline" href={`/admin/haendler/bestellungen#${order.id}`}>
          ← Zurück zu den Bestellungen
        </Link>
        {!bank.iban ? (
          <Link className="text-amber-700 underline" href="/admin/haendler/rechnungsdaten">
            Bankverbindung für Rechnungen fehlt noch – jetzt eintragen
          </Link>
        ) : null}
      </div>
      <InvoiceEditor initial={initial} orderId={order.id} status={inv ? { number: inv.number, released: inv.released, paid: inv.paid, replaced: (inv.replaced ?? []).map((r) => r.number) } : undefined} />
    </>
  );
}
