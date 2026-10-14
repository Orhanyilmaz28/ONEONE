import type { Metadata } from "next";
import { BankForm } from "./bank-form";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getInvoiceSettings } from "@/lib/dealer-orders";

export const metadata: Metadata = { title: "Rechnungsdaten" };

export default async function InvoiceSettingsPage() {
  await requireAdmin();
  const s = await getInvoiceSettings();
  return (
    <>
      <PageHeader description="Bankverbindung und Zahlungsziel für Händler-Rechnungen. Firmenname, Adresse, USt-IdNr. und Handelsregister kommen aus Einstellungen → Firmendaten." title="Händler" />
      <DealerTabs active="/admin/haendler/rechnungsdaten" />
      <BankForm initial={s} />
    </>
  );
}
