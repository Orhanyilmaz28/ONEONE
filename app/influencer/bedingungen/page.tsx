import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, companyView } from "@/components/legal-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Teilnahmebedingungen für Influencer", alternates: { canonical: "/influencer/bedingungen" } };

/** Bedingungen des Partnerprogramms (Rabattcode, Provision, Gutschrift) */
export default async function Page() {
  const c = companyView((await getSettings()).company);
  return (
    <LegalPage title="Teilnahmebedingungen für Influencer">
      <p>Bedingungen für das EXSTASE-Partnerprogramm (Rabattcode und Provision).</p>

      <h2>§ 1 Vertragspartner und Teilnahme</h2>
      <p>
        (1) Vertragspartner ist die {c.name}, {c.street}, {c.city} (nachfolgend „wir“). Teilnehmen können volljährige Personen und Unternehmen, die einen
        eigenen Social-Media-Kanal oder eine Website betreiben („Partner“).
      </p>
      <p>
        (2) Die Teilnahme beginnt mit unserer Freischaltung nach der Bewerbung. Ein Anspruch auf Freischaltung besteht nicht. Mit der Freischaltung erhält der
        Partner einen persönlichen Rabattcode und Zugang zu seinem Partner-Dashboard. Der Partner hält seine Angaben (Anschrift, Steuerangaben,
        Bankverbindung) dort aktuell.
      </p>

      <h2>§ 2 Rabattcode</h2>
      <p>
        (1) Kundinnen und Kunden, die den Code bei einer Bestellung im Online-Shop einlösen oder über den persönlichen Link des Partners in den Shop kommen,
        erhalten den im Dashboard angegebenen Rabatt auf den Warenwert. Treffen Code-Rabatt und Mix-Rabatt zusammen, erhält die Kundschaft den höheren Rabatt;
        die Provision fällt trotzdem an.
      </p>
      <p>
        (2) Wir können Code-Rabatt und Provisionssatz mit Wirkung für künftige Bestellungen ändern und teilen die Änderung im Dashboard mit. Wir können einen
        Code pausieren, etwa bei Missbrauch oder Verstößen gegen diese Bedingungen.
      </p>

      <h2>§ 3 Provision</h2>
      <p>
        (1) Für jede bezahlte Bestellung, bei der der Code des Partners eingelöst wurde, erhält der Partner die im Dashboard angegebene Provision. Grundlage ist
        der Warenwert nach Abzug aller Rabatte, ohne Umsatzsteuer, Pfand und Versandkosten.
      </p>
      <p>
        (2) Keine Provision entsteht für Bestellungen, die storniert, widerrufen oder erstattet werden, für Bestellungen des Partners selbst und für
        Bestellungen, die durch Manipulation, unzulässige Werbung oder auf andere unredliche Weise zustande kommen. Wird eine bereits abgerechnete Bestellung
        später storniert oder erstattet, verrechnen wir die Provision mit der nächsten Gutschrift.
      </p>
      <p>(3) Der Partner sieht alle Bestellungen mit seinem Code (ohne Kundendaten) und den Stand seiner Provision im Dashboard.</p>

      <h2>§ 4 Abrechnung per Gutschrift und Auszahlung</h2>
      <p>
        (1) Wir rechnen die Provision monatlich nach Ablauf des Kalendermonats im Gutschriftverfahren ab (§ 14 Abs. 2 Satz 2 UStG). Der Partner ist damit
        einverstanden, dass wir die Abrechnung erstellen. Die Gutschrift stellen wir im Dashboard als PDF bereit.
      </p>
      <p>
        (2) Ist der Partner Kleinunternehmer im Sinne von § 19 UStG, weisen wir keine Umsatzsteuer aus; andernfalls zahlen wir die Provision zuzüglich der
        gesetzlichen Umsatzsteuer. Der Partner teilt uns Änderungen seines steuerlichen Status unverzüglich mit und ist für die Versteuerung seiner Einnahmen
        selbst verantwortlich.
      </p>
      <p>
        (3) Den Betrag überweisen wir innerhalb von 14 Tagen nach Erstellung der Gutschrift auf die im Dashboard hinterlegte Bankverbindung. Fehlt diese,
        zahlen wir aus, sobald sie eingetragen ist. Einwendungen gegen eine Gutschrift sind innerhalb von 4 Wochen nach Bereitstellung in Textform mitzuteilen;
        danach gilt sie als anerkannt.
      </p>

      <h2>§ 5 Pflichten bei der Werbung</h2>
      <p>(1) Der Partner kennzeichnet Beiträge, in denen er für EXSTASE wirbt oder seinen Code nennt, deutlich als Werbung (z. B. „Werbung“ oder „Anzeige“).</p>
      <p>
        (2) Der Partner macht keine falschen oder irreführenden Aussagen über unsere Produkte, insbesondere keine gesundheits- oder leistungsbezogenen Aussagen,
        die über die Angaben auf der Verpackung hinausgehen. Energy Drinks dürfen nicht gezielt gegenüber Kindern und Jugendlichen beworben und nicht als
        geeignet für Kinder, Schwangere oder Stillende dargestellt werden. Der Partner bewirbt keinen übermäßigen Konsum und keine Mischung mit Alkohol.
      </p>
      <p>
        (3) Der Partner hält die Regeln der jeweiligen Plattform ein. Er schaltet keine Suchmaschinenwerbung auf die Marke „EXSTASE“, veröffentlicht seinen Code
        nicht auf Gutschein- oder Rabattportalen und versendet keine unerwünschte Werbung (Spam).
      </p>
      <p>
        (4) Der Partner darf die Marke EXSTASE und die bereitgestellten Produktbilder nur im Rahmen dieser Partnerschaft nutzen. Er handelt im eigenen Namen;
        er ist nicht berechtigt, Erklärungen in unserem Namen abzugeben.
      </p>

      <h2>§ 6 Laufzeit und Kündigung</h2>
      <p>
        (1) Die Partnerschaft läuft auf unbestimmte Zeit und kann von beiden Seiten jederzeit ohne Angabe von Gründen in Textform (z. B. per E-Mail an {c.email})
        beendet werden. Mit Ende der Partnerschaft wird der Code deaktiviert.
      </p>
      <p>
        (2) Bei einem erheblichen Verstoß gegen diese Bedingungen können wir den Code sofort sperren und die Partnerschaft fristlos beenden. Provisionen für
        Bestellungen, die durch den Verstoß zustande gekommen sind, entfallen.
      </p>
      <p>(3) Provisionen für ordnungsgemäß vermittelte Bestellungen bis zum Ende der Partnerschaft rechnen wir mit der nächsten Gutschrift ab.</p>

      <h2>§ 7 Haftung, Datenschutz, Schlussbestimmungen</h2>
      <p>
        (1) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit; im Übrigen nur für die
        Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Der Partner stellt uns von Ansprüchen Dritter
        frei, die auf einer schuldhaften Verletzung seiner Pflichten aus § 5 beruhen.
      </p>
      <p>
        (2) Wie wir die Daten des Partners verarbeiten, steht in unserer <Link href="/datenschutz">Datenschutzerklärung</Link>. Kundendaten erhält der Partner
        nicht.
      </p>
      <p>
        (3) Es gilt das Recht der Bundesrepublik Deutschland. Ist der Partner Kaufmann, ist Gerichtsstand unser Geschäftssitz. Wir können diese Bedingungen mit
        Wirkung für die Zukunft ändern; Änderungen teilen wir im Dashboard und per E-Mail mit, der Partner kann dann nach § 6 kündigen. Sollten einzelne
        Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam.
      </p>

      <p className="mt-8 text-sm">Stand: Oktober 2026</p>
    </LegalPage>
  );
}
