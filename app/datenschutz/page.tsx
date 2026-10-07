import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ImportedLegalPage, LegalPage, Placeholder, companyView } from "@/components/legal-page";
import { getImportedPage } from "@/lib/pages";
import { getAccountsConfig } from "@/lib/customers";
import { mailProvider } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Datenschutz" };

/** Externer Link im Rechtstext */
function Ext({ href }: { href: string }) {
  return (
    <a className="break-words underline underline-offset-2 hover:text-ink" href={href} rel="noopener noreferrer" target="_blank">
      {href.replace(/^https:\/\//, "")}
    </a>
  );
}

function Basis({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

export default async function Page() {
  const imported = getImportedPage("datenschutz");
  if (imported) {
    return <ImportedLegalPage page={imported} />;
  }
  // Firmendaten aus dem Dashboard (Einstellungen) – fehlende Angaben erscheinen als gelber Platzhalter
  const [settings, accountsConfig] = await Promise.all([getSettings(), getAccountsConfig()]);
  const c = companyView(settings.company);
  // Abschnitt „Kundenkonto“ erscheint nur, wenn Kundenkonten im Dashboard eingeschaltet sind – die Nummern danach rücken auf
  const accounts = accountsConfig.enabled;
  const n = (num: number) => (accounts ? num + 1 : num);
  // Wer verschickt die E-Mails des Shops? (Brevo/Resend – ergibt sich aus den Zugangsdaten in Vercel)
  const provider = mailProvider();
  const mailService =
    provider === "brevo"
      ? { name: "Brevo (Sendinblue SAS, Paris, Frankreich)", where: "in der EU", url: "https://www.brevo.com/de/legal/privacypolicy/" }
      : provider === "resend"
        ? { name: "Resend (USA)", where: "in den USA (auf Grundlage der EU-Standardvertragsklauseln)", url: "https://resend.com/legal/privacy-policy" }
        : null;
  return (
    <LegalPage title="Datenschutzerklärung">
      <p className="rounded-xl bg-accent/10 p-4 text-ink!">
        Vorlage – bitte vor dem Livegang von einer Anwältin, einem Anwalt oder einem Rechtstexte-Dienst (z. B. IT-Recht Kanzlei, Händlerbund oder Trusted Shops)
        prüfen lassen und an die tatsächlich genutzten Dienste anpassen. Gelb markierte Stellen müssen noch ergänzt werden.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {c.name}, {c.street}, {c.city}, {c.country}
        <br />
        {c.owner}
        <br />
        E-Mail: {c.email} · Telefon: {c.phone}
      </p>
      <p>Bei allen Fragen zum Datenschutz und zu deinen Rechten kannst du dich jederzeit an diese Adresse wenden.</p>

      <h2>2. Hosting</h2>
      <p>
        Diese Website wird bei Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA gehostet und über deren weltweites Servernetz ausgeliefert. Bei
        jedem Aufruf verarbeitet Vercel technisch notwendige Daten in Server-Logfiles: IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, zuvor besuchte Seite
        (Referrer) sowie Browser und Betriebssystem. Das ist nötig, um die Website sicher und zuverlässig anzuzeigen und Angriffe abzuwehren. Rechtsgrundlage
        ist unser berechtigtes Interesse (<Basis>Art. 6 Abs. 1 lit. f DSGVO</Basis>).
      </p>
      <p>
        Vercel ist nach dem EU-US Data Privacy Framework zertifiziert. Die Übermittlung in die USA stützt sich daher auf den Angemessenheitsbeschluss der
        EU-Kommission (<Basis>Art. 45 DSGVO</Basis>). Mit Vercel haben wir einen Vertrag über Auftragsverarbeitung (<Basis>Art. 28 DSGVO</Basis>) geschlossen.
        Datenschutzhinweise von Vercel: <Ext href="https://vercel.com/legal/privacy-policy" />
      </p>

      <h2>3. Datenbank</h2>
      <p>
        Daten, die unser Shop dauerhaft speichern muss, liegen in der Datenbank „Upstash Redis“ der Upstash, Inc. (USA). Die Datenbank wird in der Region
        Frankfurt am Main (EU) betrieben. Gespeichert werden dort:
      </p>
      {/* Region nur korrekt, wenn bei Upstash „Frankfurt (eu-central-1)“ gewählt wurde – siehe docs/ONLINE-STELLEN.md */}
      <ul>
        {accounts ? <li>Kundenkonten (Name, E-Mail-Adresse, Passwort-Hash, ggf. Lieferadresse, siehe Abschnitt 9),</li> : null}
        <li>Newsletter-Anmeldungen (E-Mail-Adresse und Zeitpunkt der Anmeldung, siehe Abschnitt {n(9)}),</li>
        <li>eingereichte Produktbewertungen einschließlich Vorname, E-Mail-Adresse und ggf. Bestellnummer (siehe Abschnitt 8),</li>
        <li>der Versandstatus von Bestellungen (z. B. „versendet“, Versanddienstleister und Sendungsnummer).</li>
      </ul>
      <p>
        Mit Upstash haben wir einen Vertrag über Auftragsverarbeitung (<Basis>Art. 28 DSGVO</Basis>) geschlossen. Sollten dabei Daten in die USA übermittelt
        werden (z. B. im Rahmen von Wartung oder Support), geschieht das auf Grundlage der EU-Standardvertragsklauseln (<Basis>Art. 46 Abs. 2 lit. c DSGVO</Basis>).
        Die Rechtsgrundlage für die Speicherung richtet sich nach dem jeweiligen Zweck (Abschnitte 5, 8 und 9).
      </p>

      <h2>4. Warenkorb und Cookies</h2>
      <p>
        Dein Warenkorb wird ausschließlich lokal in deinem Browser (localStorage) gespeichert und nicht an uns übertragen, bevor du zur Kasse gehst. Wir setzen
        keine Tracking- oder Werbe-Cookies und keine Analyse-Werkzeuge ein.
      </p>
      {accounts ? (
        <p>
          Wenn du dich in dein Kundenkonto einloggst, setzen wir ein technisch notwendiges Cookie („tt_kunde“), damit du angemeldet bleibst. Es enthält nur eine
          verschlüsselt signierte Kennung und läuft nach 30 Tagen oder beim Abmelden ab (<Basis>§ 25 Abs. 2 Nr. 2 TDDDG</Basis>).
        </p>
      ) : null}

      <h2>5. Bestellung und Zahlung</h2>
      <p>
        Zur Abwicklung von Bestellungen und Zahlungen nutzen wir Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210,
        Irland („Stripe“). Wenn du zur Kasse gehst, wirst du auf eine Bezahlseite von Stripe weitergeleitet. Dabei verarbeitet Stripe Name, Liefer- und
        Rechnungsanschrift, E-Mail-Adresse, bestellte Artikel und Zahlungsdaten sowie zur Betrugsvorbeugung technische Daten wie IP-Adresse und
        Geräteinformationen. Auf der Bezahlseite setzt Stripe dafür notwendige Cookies.
      </p>
      <p>
        Alle Zahlungsarten – Kreditkarte, PayPal, Klarna, Apple Pay, Google Pay und SEPA-Lastschrift – werden über Stripe abgewickelt. Wählst du eine davon, gibt
        Stripe die dafür nötigen Daten an den jeweiligen Anbieter weiter:
      </p>
      <ul>
        <li>PayPal: PayPal (Europe) S.à r.l. et Cie, S.C.A., 22–24 Boulevard Royal, L-2449 Luxemburg</li>
        <li>Klarna: Klarna Bank AB (publ), Sveavägen 46, 111 34 Stockholm, Schweden – Klarna kann dabei eine Identitäts- und Bonitätsprüfung durchführen</li>
        <li>Apple Pay: Apple Distribution International Ltd., Hollyhill Industrial Estate, Hollyhill, Cork, Irland</li>
        <li>Google Pay: Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland</li>
      </ul>
      <p>
        Für diese Anbieter gelten zusätzlich deren eigene Datenschutzhinweise. Rechtsgrundlage ist die Erfüllung des Kaufvertrags (<Basis>Art. 6 Abs. 1 lit. b DSGVO</Basis>),
        für die Aufbewahrung von Bestelldaten unsere gesetzlichen Pflichten (<Basis>Art. 6 Abs. 1 lit. c DSGVO</Basis>) und für die Betrugsvorbeugung unser berechtigtes
        Interesse (<Basis>Art. 6 Abs. 1 lit. f DSGVO</Basis>). Stripe kann Daten auch an die Stripe, Inc. in den USA übermitteln; Stripe ist nach dem EU-US Data
        Privacy Framework zertifiziert. Datenschutzhinweise von Stripe: <Ext href="https://stripe.com/de/privacy" />
      </p>

      <h2>6. Versand</h2>
      <p>
        Damit deine Bestellung ankommt, geben wir Name und Lieferanschrift an das beauftragte Versandunternehmen (z. B. DHL) weiter (<Basis>Art. 6 Abs. 1 lit. b DSGVO</Basis>).
      </p>

      <h2>7. Kontakt per E-Mail</h2>
      <p>
        Wenn du uns schreibst, verarbeiten wir deine E-Mail-Adresse und deine Nachricht, um deine Anfrage zu beantworten – bei Fragen zu einer Bestellung zur
        Vertragserfüllung (<Basis>Art. 6 Abs. 1 lit. b DSGVO</Basis>), sonst aus berechtigtem Interesse (<Basis>Art. 6 Abs. 1 lit. f DSGVO</Basis>).
      </p>

      <h2>8. Produktbewertungen</h2>
      <p>
        Du kannst unsere Produkte über ein Formular bewerten. Dabei verarbeiten wir deine Sternebewertung, deinen Vornamen, deine E-Mail-Adresse, deinen
        Bewertungstext, optional eine Überschrift und deine Bestellnummer sowie den Zeitpunkt der Bewertung. Wir prüfen jede Bewertung, bevor sie erscheint.
      </p>
      <p>
        Veröffentlicht werden nur Vorname, Sterne, Überschrift, Text und Datum – bei geprüfter Bestellnummer mit dem Hinweis „Verifizierter Kauf“.{" "}
        <strong>Deine E-Mail-Adresse und deine Bestellnummer werden nie veröffentlicht.</strong> Wir nutzen sie nur, um den Kauf zu prüfen, bei Rückfragen Kontakt
        aufzunehmen und Missbrauch zu verhindern.
      </p>
      <p>
        Rechtsgrundlage für die Veröffentlichung ist deine Einwilligung (<Basis>Art. 6 Abs. 1 lit. a DSGVO</Basis>), die du im Formular per Häkchen erteilst. Die
        Verarbeitung von E-Mail-Adresse und Bestellnummer beruht auf unserem berechtigten Interesse an echten und missbrauchsfreien Bewertungen (
        <Basis>Art. 6 Abs. 1 lit. f DSGVO</Basis>). Du kannst deine Einwilligung jederzeit per E-Mail an {c.email} widerrufen – wir löschen deine Bewertung dann.
        Abgelehnte Bewertungen löschen wir regelmäßig.
      </p>

      {accounts ? (
        <>
          <h2>9. Kundenkonto</h2>
          <p>
            Du kannst freiwillig ein Kundenkonto anlegen. Dabei speichern wir deinen Namen, deine E-Mail-Adresse, dein Passwort (nur als sicher verschlüsselter
            Hash – wir können es nicht lesen), den Zeitpunkt der Registrierung und der letzten Anmeldung sowie – wenn du sie einträgst – deine Lieferadresse. Im
            Konto zeigen wir dir deine Bestellungen, die wir anhand deiner E-Mail-Adresse bei unserem Zahlungsdienstleister Stripe abrufen.
          </p>
          <p>
            Rechtsgrundlage ist die Durchführung des Nutzungsvertrags über das Kundenkonto (<Basis>Art. 6 Abs. 1 lit. b DSGVO</Basis>). Die Daten liegen in unserer
            Datenbank (siehe Abschnitt 3). Du kannst dein Konto jederzeit selbst unter „Mein Konto → Meine Daten“ löschen; die Kontodaten werden dann sofort
            entfernt. Bestelldaten, die wir aus handels- und steuerrechtlichen Gründen aufbewahren müssen, bleiben davon unberührt.
          </p>
        </>
      ) : null}

      <h2>{n(9)}. Newsletter</h2>
      <p>
        Wenn du dich für unseren Newsletter anmeldest, speichern wir deine E-Mail-Adresse, den Zeitpunkt der Anmeldung und die Stelle, an der du dich angemeldet
        hast, in unserer Datenbank (Abschnitt 3). Bevor wir dir einen Newsletter schicken, erhältst du eine E-Mail mit einem Bestätigungslink (Double-Opt-in). Erst
        wenn du den Link anklickst, bekommst du Newsletter von uns. Adressen, die nicht innerhalb von 7 Tagen bestätigt werden, löschen wir.
      </p>
      <p>
        Wir verwenden deine Adresse ausschließlich für den Versand unseres Newsletters. Rechtsgrundlage ist deine Einwilligung (<Basis>Art. 6 Abs. 1 lit. a DSGVO</Basis>).
        Den Zeitpunkt von Anmeldung und Bestätigung speichern wir, um die Einwilligung nachweisen zu können (<Basis>Art. 6 Abs. 1 lit. c DSGVO</Basis> i. V. m.{" "}
        <Basis>Art. 7 Abs. 1 DSGVO</Basis>). Du kannst dich jederzeit abmelden – über den Link am Ende jedes Newsletters oder per E-Mail an {c.email}. Danach
        löschen wir deine Adresse.
      </p>
      <p>
        Newsletter-Dienstleister: {mailService ? mailService.name : <Placeholder>[Anbieter eintragen, z. B. Brevo]</Placeholder>}
      </p>
      {mailService ? (
        <>
          <h3>E-Mails des Shops</h3>
          <p>
            Bestellbestätigungen, Versandbenachrichtigungen, Newsletter-Bestätigungen und – falls du ein Kundenkonto hast – E-Mails zum Zurücksetzen des Passworts
            verschicken wir über {mailService.name}. Dabei werden deine E-Mail-Adresse, dein Name und der Inhalt der jeweiligen E-Mail {mailService.where} verarbeitet.
            Mit dem Anbieter besteht ein Vertrag über Auftragsverarbeitung (<Basis>Art. 28 DSGVO</Basis>). Rechtsgrundlage ist die Erfüllung des Kaufvertrags (
            <Basis>Art. 6 Abs. 1 lit. b DSGVO</Basis>) bzw. deine Einwilligung beim Newsletter. Datenschutzhinweise des Anbieters: <Ext href={mailService.url} />
          </p>
        </>
      ) : null}

      <h2>{n(10)}. Schriftarten</h2>
      <p>Schriftarten werden lokal von unserem Server ausgeliefert; es findet keine Verbindung zu Google oder anderen Schriftanbietern statt.</p>

      <h2>{n(11)}. Speicherdauer</h2>
      <p>
        Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck nötig ist. Bestell- und Rechnungsdaten müssen wir aus steuer- und
        handelsrechtlichen Gründen bis zu zehn Jahre aufbewahren (§ 147 AO, § 257 HGB). Newsletter-Adressen löschen wir nach deiner Abmeldung, Bewertungen auf
        Wunsch.
      </p>

      <h2>{n(12)}. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO)
        und Datenübertragbarkeit (Art. 20 DSGVO). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Schreib uns
        dafür einfach an {c.email}.
      </p>
      <p>
        <strong>Widerspruchsrecht:</strong> Verarbeiten wir Daten auf Grundlage unseres berechtigten Interesses (<Basis>Art. 6 Abs. 1 lit. f DSGVO</Basis>), kannst
        du dem aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).
      </p>
      <p>Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).</p>

      <h2>{n(13)}. Verschlüsselung</h2>
      <p>Diese Website nutzt aus Sicherheitsgründen eine SSL- bzw. TLS-Verschlüsselung. Du erkennst sie am „https://“ in der Adresszeile deines Browsers.</p>

      <p className="mt-8 text-sm">Stand: Oktober 2026</p>
    </LegalPage>
  );
}
