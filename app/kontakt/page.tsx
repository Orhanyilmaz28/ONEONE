import type { Metadata } from "next";
import { ImportedLegalPage, LegalPage, companyView, isMissing } from "@/components/legal-page";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Kontakt" };

/** „+49 2834 123456“ → „tel:+492834123456“ */
function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function Page() {
  const imported = getImportedPage("kontakt");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Firmendaten aus dem Dashboard (Einstellungen) – fehlende Angaben erscheinen als gelber Platzhalter
  const { company } = await getSettings();
  const c = companyView(company);
  const email = company.email.trim();
  const phone = company.phone.trim();
  return (
    <LegalPage title="Kontakt">
      <p>Fragen zu deiner Bestellung oder zu unseren Produkten? Wir helfen gern – meist innerhalb von 24 Stunden.</p>
      <h2>E-Mail</h2>
      <p>
        {isMissing(email) ? (
          c.email
        ) : (
          <a className="text-accent underline" href={`mailto:${email}`}>
            {email}
          </a>
        )}
      </p>
      <h2>Telefon</h2>
      <p>
        {isMissing(phone) ? (
          c.phone
        ) : (
          <a className="text-accent underline" href={telHref(phone)}>
            {phone}
          </a>
        )}{" "}
        (Mo–Fr, 9–17 Uhr)
      </p>
      <h2>Anschrift</h2>
      <p>
        {c.name}
        <br />
        {c.street}
        <br />
        {c.city}
      </p>
    </LegalPage>
  );
}
