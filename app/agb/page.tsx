import type { Metadata } from "next";
import Link from "next/link";
import { ImportedLegalPage, LegalPage, companyView } from "@/components/legal-page";
import { shippingRules } from "@/components/trust";
import { formatPrice } from "@/lib/format";
import { getImportedPage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "AGB", alternates: { canonical: "/agb" } };

/**
 * Allgemeine Geschäftsbedingungen für Bestellungen im Online-Shop (Verbraucher und Unternehmer).
 * Händler mit Händlerzugang: zusätzlich /haendler/bedingungen · Influencer: /influencer/bedingungen.
 */
export default async function Page() {
  const imported = getImportedPage("agb");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  const settings = await getSettings();
  const c = companyView(settings.company);
  const shipping = shippingRules(settings.shipping);
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen">
      <h2>§ 1 Geltungsbereich, Vertragspartner</h2>
      <p>
        (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Bestellungen, die Sie über unseren Online-Shop abgeben. Vertragspartner ist die {c.name},{" "}
        {c.street}, {c.city}, {c.country} (nachfolgend „wir“ oder „uns“), {c.owner}, E-Mail: {c.email}, Telefon: {c.phone}.
      </p>
      <p>
        (2) Verbraucher ist jede natürliche Person, die ein Rechtsgeschäft zu Zwecken abschließt, die überwiegend weder ihrer gewerblichen noch ihrer selbständigen
        beruflichen Tätigkeit zugerechnet werden können (§ 13 BGB). Unternehmer ist eine natürliche oder juristische Person oder eine rechtsfähige
        Personengesellschaft, die bei Abschluss des Rechtsgeschäfts in Ausübung ihrer gewerblichen oder selbständigen beruflichen Tätigkeit handelt (§ 14 BGB).
      </p>
      <p>
        (3) Abweichende Bedingungen des Kunden erkennen wir nicht an, es sei denn, wir stimmen ihrer Geltung ausdrücklich zu. Für Bestellungen registrierter
        Händler über den Händlerbereich gelten zusätzlich und vorrangig die <Link href="/haendler/bedingungen">Händlerbedingungen</Link>, für das Partnerprogramm
        die <Link href="/influencer/bedingungen">Teilnahmebedingungen für Influencer</Link>.
      </p>

      <h2>§ 2 Vertragsschluss</h2>
      <p>
        (1) Die Darstellung der Produkte im Online-Shop ist kein rechtlich bindendes Angebot, sondern eine Aufforderung zur Bestellung. Angaben zu Produkten
        (Abbildungen, Inhalt, Zutaten, Nährwerte) beschreiben die Ware; geringfügige Abweichungen im Design der Verpackung sind möglich.
      </p>
      <p>
        (2) Sie können Produkte in den Warenkorb legen und dort Mengen ändern, Produkte entfernen und einen Rabattcode eingeben. Mit „Sicher zur Kasse“ gelangen
        Sie auf die Bezahlseite unseres Zahlungsdienstleisters Stripe. Dort geben Sie Ihre E-Mail-Adresse, Liefer- und Rechnungsanschrift ein, wählen Versandart
        und Zahlungsart und bestätigen unsere AGB. Vor dem Absenden sehen Sie eine Übersicht mit allen Artikeln, Preisen, Pfand, Versandkosten und dem
        Gesamtbetrag. Eingabefehler können Sie jederzeit vor dem Absenden direkt in den Eingabefeldern korrigieren oder über „Zurück“ den Warenkorb ändern.
      </p>
      <p>
        (3) Mit dem Klick auf den Bestell-Button auf der Bezahlseite (z. B. „Bezahlen“) geben Sie ein verbindliches Angebot zum Kauf der Waren im Warenkorb ab.
        Wir nehmen Ihr Angebot an, indem wir die Zahlung annehmen (bei Kreditkarte, PayPal, Apple Pay, Google Pay und Klarna mit Abschluss des
        Zahlungsvorgangs), Ihnen eine Bestellbestätigung per E-Mail schicken oder die Ware versenden – je nachdem, was zuerst geschieht.
      </p>
      <p>
        (4) Vertragssprache ist Deutsch. Wir speichern den Vertragstext (Bestelldaten und AGB). Die Bestelldaten erhalten Sie mit der Bestellbestätigung per
        E-Mail; die jeweils aktuellen AGB können Sie jederzeit auf dieser Seite abrufen und ausdrucken.
      </p>

      <h2>§ 3 Preise, Pfand, Versandkosten</h2>
      <p>
        (1) Alle Preise sind Endpreise in Euro einschließlich der gesetzlichen Umsatzsteuer. Es gilt der Preis zum Zeitpunkt der Bestellung.
      </p>
      <p>
        (2) Für Einweg-Getränkeverpackungen erheben wir das gesetzliche Pfand von 0,25 € je Dose bzw. Flasche. Das Pfand ist nicht im Produktpreis enthalten und
        wird im Warenkorb und auf der Bezahlseite gesondert ausgewiesen. Pfandpflichtige Einwegverpackungen mit dem DPG-Pfandzeichen können Sie bei jedem
        Händler zurückgeben, der Getränke in Verpackungen dieser Art verkauft; dort wird Ihnen das Pfand erstattet.
      </p>
      <p>
        (3) Hinzu kommen Versandkosten: Standardversand {shipping.alwaysFree ? "kostenlos" : formatPrice(shipping.cost)}
        {shipping.freeFrom ? `, ab ${formatPrice(shipping.freeFrom)} Warenwert kostenlos` : ""}
        {shipping.express ? `; Express ${formatPrice(shipping.express)}` : ""}. Einzelheiten unter <Link href="/versand">Versand & Lieferung</Link>. Die
        Versandkosten werden vor Abgabe der Bestellung angezeigt.
      </p>

      <h2>§ 4 Rabatte und Rabattcodes</h2>
      <p>
        (1) Beim Kauf mehrerer Sorten gewähren wir einen Mix-Rabatt nach der im Shop angezeigten Staffel auf den Warenwert (ohne Pfand und Versand).
      </p>
      <p>
        (2) Rabattcodes (z. B. Codes unserer Partner) gelten nur für Bestellungen im Online-Shop, sind nicht übertragbar, nicht in bar auszahlbar und können nicht
        nachträglich auf bereits abgeschlossene Bestellungen angerechnet werden. Pro Bestellung kann ein Code eingelöst werden. Rabatte werden nicht
        zusammengerechnet: Treffen Mix-Rabatt und Code-Rabatt zusammen, gilt der für Sie höhere Rabatt.
      </p>
      <p>
        (3) Wird eine Bestellung ganz oder teilweise widerrufen und fällt dadurch die Voraussetzung eines Rabatts weg, erstatten wir den tatsächlich gezahlten
        Betrag der zurückgegebenen Waren.
      </p>

      <h2>§ 5 Zahlung</h2>
      <p>
        (1) Die Zahlung wird über Stripe Payments Europe, Ltd. (Irland) abgewickelt. Es stehen die Zahlungsarten zur Verfügung, die auf der Bezahlseite angezeigt
        werden (z. B. Kreditkarte, PayPal, Apple Pay, Google Pay). Bei einzelnen Zahlungsarten gelten ergänzend die Bedingungen des jeweiligen Anbieters.
      </p>
      <p>(2) Der Kaufpreis ist mit Vertragsschluss sofort fällig. Bei Klarna gelten die von Klarna mitgeteilten Zahlungsfristen.</p>

      <h2>§ 6 Lieferung</h2>
      <p>
        (1) Wir liefern nach Deutschland, Österreich, in die Niederlande, nach Belgien, Luxemburg, Frankreich, Italien und Dänemark. Die Lieferzeit ist auf der
        Seite <Link href="/versand">Versand & Lieferung</Link> angegeben und beginnt am Tag nach Vertragsschluss.
      </p>
      <p>
        (2) Ist ein bestellter Artikel entgegen der Anzeige im Shop nicht verfügbar, informieren wir Sie unverzüglich. Bereits geleistete Zahlungen für nicht
        lieferbare Artikel erstatten wir unverzüglich.
      </p>
      <p>
        (3) Werden Waren mit offensichtlichen Transportschäden angeliefert, reklamieren Sie solche Schäden bitte möglichst sofort beim Zusteller und
        nehmen Sie Kontakt mit uns auf. Ihre gesetzlichen Rechte bleiben davon unberührt; der Hinweis hilft uns nur, Ansprüche gegenüber dem Versanddienst
        geltend zu machen.
      </p>

      <h2>§ 7 Eigentumsvorbehalt</h2>
      <p>Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.</p>

      <h2>§ 8 Widerrufsrecht</h2>
      <p>
        Verbrauchern steht ein gesetzliches Widerrufsrecht zu. Einzelheiten und das Muster-Widerrufsformular finden Sie in unserer{" "}
        <Link href="/widerruf">Widerrufsbelehrung</Link>.
      </p>

      <h2>§ 9 Gewährleistung und Haftung</h2>
      <p>
        (1) Es gelten die gesetzlichen Mängelhaftungsrechte. Lebensmittel sind bis zum aufgedruckten Mindesthaltbarkeitsdatum bei sachgerechter Lagerung (kühl,
        trocken, vor Sonne geschützt) mindestens haltbar.
      </p>
      <p>
        (2) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz sowie
        im Umfang einer übernommenen Garantie. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (einer Pflicht, deren Erfüllung die
        ordnungsgemäße Durchführung des Vertrags erst ermöglicht und auf deren Einhaltung Sie regelmäßig vertrauen dürfen) ist unsere Haftung auf den
        vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.
      </p>

      <h2>§ 10 Hinweis zu Energy Drinks</h2>
      <p>
        Unsere Energy Drinks haben einen erhöhten Koffeingehalt und werden für Kinder sowie schwangere oder stillende Frauen nicht empfohlen. Die genauen Angaben
        zu Zutaten, Allergenen, Nährwerten und Koffeingehalt finden Sie auf der jeweiligen Produktseite.
      </p>

      <h2>§ 11 Streitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Bei Fragen oder
        Beschwerden erreichen Sie uns unter {c.email}.
      </p>

      <h2>§ 12 Schlussbestimmungen</h2>
      <p>
        (1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Bei Verbrauchern gilt diese Rechtswahl nur, soweit dadurch nicht
        der Schutz durch zwingende Bestimmungen des Rechts des Staates entzogen wird, in dem der Verbraucher seinen gewöhnlichen Aufenthalt hat.
      </p>
      <p>
        (2) Sind Sie Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand für alle Streitigkeiten
        aus diesem Vertrag unser Geschäftssitz.
      </p>
      <p>(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>

      <p className="mt-8 text-sm">Stand: Oktober 2026</p>
    </LegalPage>
  );
}
