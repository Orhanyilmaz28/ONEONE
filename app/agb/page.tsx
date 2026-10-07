import type { Metadata } from "next";
import Link from "next/link";
import { ImportedLegalPage, LegalPage, companyView } from "@/components/legal-page";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "AGB" };

export default async function Page() {
  const imported = getImportedPage("agb");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Firmendaten aus dem Dashboard (Einstellungen) – fehlende Angaben erscheinen als gelber Platzhalter
  const c = companyView((await getSettings()).company);
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <p className="rounded-xl bg-accent/10 p-4 text-ink!">
        Vorlage – bitte vor dem Livegang rechtlich prüfen lassen (z. B. über einen Rechtstexte-Dienst wie IT-Recht
        Kanzlei, Händlerbund oder Trusted Shops).
      </p>
      <h2>§ 1 Geltungsbereich</h2>
      <p>
        Diese AGB gelten für alle Bestellungen über den Online-Shop von {c.name}, {c.street}, {c.city}.
      </p>
      <h2>§ 2 Vertragsschluss</h2>
      <p>
        Die Darstellung der Produkte im Shop stellt kein rechtlich bindendes Angebot dar. Durch Klicken auf
        „Zahlungspflichtig bestellen“ im Checkout geben Sie eine verbindliche Bestellung ab. Der Vertrag kommt mit
        unserer Auftragsbestätigung per E-Mail oder mit Versand der Ware zustande.
      </p>
      <h2>§ 3 Preise und Versandkosten</h2>
      <p>
        Alle Preise sind Endpreise inkl. gesetzlicher Mehrwertsteuer. Zusätzlich anfallende Versandkosten werden vor
        Abgabe der Bestellung angezeigt (siehe <Link href="/versand">Versand & Lieferung</Link>).
      </p>
      <p>
        Für Einweg-Getränkeverpackungen wird zusätzlich ein Pfand von 0,25 € je Dose bzw. Flasche erhoben. Das Pfand ist im Preis nicht enthalten und wird vor Abgabe der
        Bestellung gesondert ausgewiesen.
      </p>
      <h2>§ 4 Zahlung</h2>
      <p>
        Die Zahlung erfolgt über unseren Zahlungsdienstleister Stripe per Kreditkarte, PayPal, Apple Pay, Google Pay,
        Klarna oder SEPA-Lastschrift.
      </p>
      <h2>§ 5 Eigentumsvorbehalt</h2>
      <p>Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.</p>
      <h2>§ 6 Widerrufsrecht</h2>
      <p>
        Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Einzelheiten finden Sie in unserer{" "}
        <Link href="/widerruf">Widerrufsbelehrung</Link>.
      </p>
      <h2>§ 7 Gewährleistung</h2>
      <p>Es gelten die gesetzlichen Gewährleistungsrechte.</p>
    </LegalPage>
  );
}
