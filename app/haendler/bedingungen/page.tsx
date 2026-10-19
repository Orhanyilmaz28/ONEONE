import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, companyView } from "@/components/legal-page";
import { PALLET_MIN_TRAYS } from "@/lib/dealer-order-calc";
import { getInvoiceSettings } from "@/lib/dealer-orders";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Händlerbedingungen", alternates: { canonical: "/haendler/bedingungen" } };

/** Geschäftsbedingungen für registrierte Händler (B2B, Bestellung auf Rechnung über den Händlerbereich) */
export default async function Page() {
  const [settings, invoice] = await Promise.all([getSettings(), getInvoiceSettings().catch(() => ({ dueDays: 14 }))]);
  const c = companyView(settings.company);
  const due = invoice.dueDays || 14;
  return (
    <LegalPage title="Händlerbedingungen">
      <p>Geschäftsbedingungen für den Verkauf an gewerbliche Wiederverkäufer, Gastronomie und Veranstalter („Händler“).</p>

      <h2>§ 1 Geltungsbereich</h2>
      <p>
        (1) Diese Bedingungen gelten für alle Verträge zwischen der {c.name}, {c.street}, {c.city} (nachfolgend „wir“) und Händlern, die über den Händlerbereich
        oder auf anderem Weg (E-Mail, Telefon) zu Händlerkonditionen bestellen. Sie gelten ausschließlich gegenüber Unternehmern im Sinne von § 14 BGB,
        juristischen Personen des öffentlichen Rechts und öffentlich-rechtlichen Sondervermögen.
      </p>
      <p>
        (2) Ergänzend gelten unsere <Link href="/agb">AGB</Link>, soweit diese Händlerbedingungen nichts anderes regeln. Allgemeine Geschäftsbedingungen des
        Händlers gelten nur, wenn wir ihnen ausdrücklich schriftlich zustimmen.
      </p>

      <h2>§ 2 Registrierung und Händlerzugang</h2>
      <p>
        (1) Der Zugang zum Händlerbereich setzt eine Registrierung mit Gewerbenachweis und unsere Freischaltung voraus. Ein Anspruch auf Freischaltung besteht
        nicht. Der Händler versichert, gewerblich zu handeln, und hält seine Angaben aktuell.
      </p>
      <p>
        (2) Die Zugangsdaten sind geheim zu halten und dürfen nicht an Dritte weitergegeben werden. Wir können den Zugang sperren, wenn der Verdacht eines
        Missbrauchs besteht oder der Händler mit Zahlungen in Verzug ist.
      </p>

      <h2>§ 3 Preise und Vertragsschluss</h2>
      <p>
        (1) Es gelten die im Händlerbereich angezeigten Preise je Dose bzw. Tray für die jeweilige Mengenstufe. Alle Händlerpreise verstehen sich netto zuzüglich
        Einwegpfand (0,25 € je Dose bzw. Flasche) und der gesetzlichen Umsatzsteuer, die auch auf das Pfand anfällt. Palettenpreise gelten ab einer Gesamtmenge
        von {PALLET_MIN_TRAYS} Trays je Bestellung (auch gemischt); einzelne Artikel sind nur palettenweise bestellbar und im Händlerbereich entsprechend
        gekennzeichnet.
      </p>
      <p>
        (2) Mit dem Absenden einer Bestellung im Händlerbereich gibt der Händler ein verbindliches Angebot ab. Der Vertrag kommt zustande, wenn wir die
        Bestellung bestätigen (Status „Bestätigt“ im Händlerbereich oder per E-Mail) oder die Ware ausliefern. Wir können Bestellungen ohne Angabe von Gründen
        ablehnen, etwa bei fehlender Verfügbarkeit.
      </p>
      <p>(3) Ein Widerrufsrecht besteht für Händler nicht.</p>

      <h2>§ 4 Lieferung und Gefahrübergang</h2>
      <p>
        (1) Bestellungen unterhalb einer Palette versenden wir per Paketdienst zu den im Händlerbereich angezeigten Versandkosten. Ab einer Palette liefern wir per
        Spedition frei Bordsteinkante an die angegebene Lieferadresse; die Frachtkosten werden vorab mit dem Händler abgestimmt. Liefertermine sind nur
        verbindlich, wenn wir sie ausdrücklich zusagen.
      </p>
      <p>
        (2) Die Gefahr geht mit Übergabe der Ware an den Paketdienst bzw. die Spedition auf den Händler über. Der Händler sorgt dafür, dass die Ware zur
        vereinbarten Zeit angenommen und – bei Speditionslieferung – abgeladen werden kann.
      </p>

      <h2>§ 5 Zahlung</h2>
      <p>
        (1) Die Zahlung erfolgt auf Rechnung. Die Rechnung stellen wir im Händlerbereich bereit. Der Rechnungsbetrag ist ohne Abzug innerhalb von {due} Tagen
        ab Rechnungsdatum fällig, sofern auf der Rechnung nichts anderes angegeben ist.
      </p>
      <p>
        (2) Bei Zahlungsverzug gelten die gesetzlichen Verzugszinsen (§ 288 Abs. 2 BGB) und die Verzugspauschale (§ 288 Abs. 5 BGB). Wir können weitere
        Lieferungen von der Begleichung offener Rechnungen oder von Vorkasse abhängig machen.
      </p>
      <p>(3) Aufrechnen oder zurückbehalten darf der Händler nur mit unbestrittenen oder rechtskräftig festgestellten Forderungen.</p>

      <h2>§ 6 Eigentumsvorbehalt</h2>
      <p>
        (1) Die Ware bleibt bis zur vollständigen Bezahlung aller Forderungen aus der Geschäftsbeziehung unser Eigentum.
      </p>
      <p>
        (2) Der Händler darf die Ware im ordnungsgemäßen Geschäftsgang weiterverkaufen. Er tritt uns bereits jetzt alle Forderungen aus dem Weiterverkauf in Höhe
        des Rechnungsbetrags ab; wir nehmen die Abtretung an. Der Händler bleibt zur Einziehung ermächtigt, solange er seinen Zahlungspflichten nachkommt.
      </p>

      <h2>§ 7 Untersuchungs- und Rügepflicht, Mängel</h2>
      <p>
        (1) Der Händler hat die Ware unverzüglich nach Erhalt auf Menge, Transportschäden und erkennbare Mängel zu prüfen und diese uns unverzüglich, spätestens
        innerhalb von 5 Werktagen, in Textform anzuzeigen; versteckte Mängel unverzüglich nach Entdeckung (§ 377 HGB). Transportschäden sind zusätzlich auf dem
        Lieferschein bzw. Frachtbrief zu vermerken.
      </p>
      <p>
        (2) Bei berechtigten Mängeln liefern wir nach unserer Wahl Ersatz oder schreiben den Betrag gut. Die Verjährungsfrist für Mängelansprüche beträgt ein Jahr
        ab Ablieferung; dies gilt nicht bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben, Körper oder Gesundheit sowie in den Fällen des § 478 BGB.
      </p>
      <p>
        (3) Der Händler lagert die Ware sachgerecht (kühl, trocken, vor Sonne und Frost geschützt) und verkauft sie nur bis zum Mindesthaltbarkeitsdatum bzw.
        unter Beachtung der lebensmittelrechtlichen Vorgaben.
      </p>

      <h2>§ 8 Haftung</h2>
      <p>
        Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und im
        Umfang einer Garantie. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden
        begrenzt; im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen. Entgangener Gewinn wird bei leichter Fahrlässigkeit nicht ersetzt.
      </p>

      <h2>§ 9 Marke und Werbung</h2>
      <p>
        Der Händler darf die Marke EXSTASE sowie die von uns bereitgestellten Produktbilder und Artikelpässe zur Bewerbung und zum Verkauf unserer Produkte
        nutzen. Eine Veränderung der Marke oder eine Nutzung für andere Produkte ist nicht gestattet. Werbung per E-Mail senden wir nur mit Einwilligung des
        Händlers; Informationen zu Bestellungen, Rechnungen und dem Händlerbereich sind keine Werbung.
      </p>

      <h2>§ 10 Schlussbestimmungen</h2>
      <p>
        (1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Ausschließlicher Gerichtsstand für alle Streitigkeiten ist unser
        Geschäftssitz, sofern der Händler Kaufmann ist; wir dürfen auch am Sitz des Händlers klagen.
      </p>
      <p>
        (2) Wir können diese Bedingungen mit Wirkung für künftige Bestellungen ändern; die geänderte Fassung teilen wir im Händlerbereich mit. Sollten einzelne
        Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam.
      </p>

      <p className="mt-8 text-sm">Stand: Oktober 2026</p>
    </LegalPage>
  );
}
