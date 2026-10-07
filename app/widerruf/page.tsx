import type { Metadata } from "next";
import { ImportedLegalPage, LegalPage, WithdrawalForm, WithdrawalInstructions, companyView, withdrawalContact } from "@/components/legal-page";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Widerrufsbelehrung" };

export default async function Page() {
  const imported = getImportedPage("widerruf");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Firmendaten und Rücksendekosten aus dem Dashboard (Einstellungen) – fehlende Angaben erscheinen als gelber Platzhalter
  const settings = await getSettings();
  const contact = withdrawalContact(companyView(settings.company));
  return (
    <LegalPage title="Widerrufsbelehrung">
      <WithdrawalInstructions contact={contact} paidBy={settings.returns.paidBy} />
      <WithdrawalForm contact={contact} />
    </LegalPage>
  );
}
