import type { Metadata } from "next";
import { ImportedLegalPage, LegalPage, companyView } from "@/components/legal-page";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Impressum" };

export default async function Page() {
  const imported = getImportedPage("impressum");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Firmendaten aus dem Dashboard (Einstellungen) – fehlende Angaben erscheinen als gelber Platzhalter
  const c = companyView((await getSettings()).company);
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        {c.name}
        <br />
        {c.street}
        <br />
        {c.city}
        <br />
        {c.country}
      </p>
      <h2>Vertreten durch</h2>
      <p>{c.owner}</p>
      <h2>Marke</h2>
      <p>
        {c.brand} ({c.domain}) ist eine Marke der {c.name}.
      </p>
      <h2>Kontakt</h2>
      <p>
        Telefon: {c.phone}
        <br />
        E-Mail: {c.email}
      </p>
      <h2>Umsatzsteuer-ID</h2>
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:
        <br />
        {c.vatId}
      </p>
      <h2>Registereintrag</h2>
      <p>
        Eintragung im Handelsregister
        <br />
        Registergericht und Registernummer: {c.register}
      </p>
      <h2>Verantwortlich für den Inhalt</h2>
      <p>
        {c.person}, {c.street}, {c.city}
      </p>
      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </LegalPage>
  );
}
