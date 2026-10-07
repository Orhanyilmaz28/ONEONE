import type { Metadata } from "next";
import { ImportedLegalPage, LegalPage } from "@/components/legal-page";
import { shippingRules } from "@/components/trust";
import { formatPrice } from "@/lib/format";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Versand & Lieferung" };

export default async function Page() {
  const imported = getImportedPage("versand");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Versandkosten aus dem Dashboard (Einstellungen)
  const shipping = shippingRules((await getSettings()).shipping);
  return (
    <LegalPage title="Versand & Lieferung">
      <h2>Versandkosten</h2>
      <ul>
        <li>Standardversand (DHL): {shipping.alwaysFree ? "kostenlos" : formatPrice(shipping.cost)}</li>
        {shipping.freeFrom ? <li>Kostenloser Standardversand ab {formatPrice(shipping.freeFrom)} Bestellwert</li> : null}
        {shipping.express ? <li>Express (DHL Express, nächster Werktag): {formatPrice(shipping.express)}</li> : null}
      </ul>
      <h2>Lieferzeit</h2>
      <p>
        Bestellungen werden innerhalb von 1–2 Werktagen versendet. Die Lieferzeit beträgt in Deutschland in der
        Regel 1–3 Werktage, ins EU-Ausland 3–7 Werktage.
      </p>
      <h2>Liefergebiete</h2>
      <p>Deutschland, Österreich, Niederlande, Belgien, Luxemburg, Frankreich, Italien, Dänemark.</p>
      <h2>Zahlungsarten</h2>
      <p>Kreditkarte, PayPal, Apple Pay, Google Pay, Klarna und SEPA-Lastschrift – sicher abgewickelt über Stripe.</p>
    </LegalPage>
  );
}
