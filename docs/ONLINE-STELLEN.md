# exstase-energy.de online stellen – in 6 Schritten

Diese Anleitung ist für dich, auch wenn du noch nie eine Website online gestellt hast.
Du musst nichts programmieren. Du klickst nur auf Websites und kopierst ein paar Texte hin und her.

**So liest du die Anleitung**

- Mach die Schritte **der Reihe nach**. Jeder Schritt baut auf dem davor auf.
- Am Ende jedes Schritts steht **„So siehst du, dass es geklappt hat“**. Geh erst weiter, wenn das stimmt.
- Klappt etwas nicht? Schau unten bei **[Häufige Probleme](#häufige-probleme)**.
- Vercel (die Hosting-Seite) ist nur auf Englisch. Die Knöpfe stehen hier deshalb **auf Englisch** – so, wie du sie siehst.
- Kaputt machen kannst du nichts. Jede Einstellung lässt sich später wieder ändern.

---

## Auf einen Blick

| Schritt | Was du machst | Dauer |
| --- | --- | --- |
| 0 | [Vorbereitung: Was du brauchst](#schritt-0--was-du-brauchst) | 10 Min. |
| 1 | [Änderungen übernehmen (Pull Request zusammenführen)](#schritt-1--änderungen-übernehmen-pull-request-zusammenführen) | 2 Min. |
| 2 | [Vercel-Konto anlegen und Shop importieren](#schritt-2--vercel-konto-anlegen-und-shop-importieren) | 10 Min. |
| 3 | [Datenspeicher verbinden](#schritt-3--datenspeicher-verbinden) | 5 Min. |
| 4 | [Umgebungsvariablen eintragen](#schritt-4--umgebungsvariablen-eintragen) | 10 Min. |
| 5 | [Stripe einrichten (Bezahlen)](#schritt-5--stripe-einrichten-bezahlen) | 45 Min. + 1–3 Tage Prüfung durch Stripe |
| 6 | [Domain exstase-energy.de verbinden](#schritt-6--domain-exstase-energyde-verbinden) | 15 Min. + Wartezeit (meist unter 1 Stunde) |
| 7 | [Rechtliches vor dem Start](#schritt-7--rechtliches-vor-dem-start) | je nach Anwalt / Rechtstexte-Dienst |
| 8 | [E-Mail-Versand einrichten (Brevo)](#schritt-8--e-mail-versand-einrichten-brevo) | 30 Min. + Wartezeit für DNS |

**Insgesamt:** etwa 2 Stunden Klicken, verteilt auf 2–3 Tage (wegen der Wartezeiten).

---

## Was kostet das?

| Dienst | Wofür | Kosten (Stand Oktober 2026) |
| --- | --- | --- |
| **GitHub** | Hier liegt der Code deines Shops. | kostenlos |
| **Vercel** | Hier „wohnt“ dein Shop im Internet (Hosting). | **Hobby:** 0 € – laut Vercel aber nur für private, **nicht-kommerzielle** Projekte. **Für einen echten Shop brauchst du „Pro“: ca. 20 US-$ im Monat** (für 1 Person). Zum Ausprobieren reicht Hobby. |
| **Upstash Redis** | Speicher für alles, was du im Dashboard änderst – auch für Produktfotos, die du hochlädst. | kostenlos (bis 256 MB und 500.000 Zugriffe im Monat – für einen kleinen Shop in aller Regel genug) |
| **Brevo** | Verschickt die E-Mails des Shops (Bestellbestätigung, Versand, Newsletter-Bestätigung) und deinen Newsletter. | kostenlos bis 300 E-Mails pro Tag |
| **Stripe** | Nimmt die Zahlungen an (Karte, PayPal, Klarna, Apple Pay …). | Keine Grundgebühr. Nur pro Zahlung: mit einer normalen EU-Karte **ca. 1,5 % + 0,25 €**. Beispiel: Bestellung über 49,90 € → ca. 1,00 € Gebühr. Firmen-, Premium- und Nicht-EU-Karten, PayPal und Klarna kosten etwas mehr. |
| **Domain exstase-energy.de** | Die Adresse deines Shops. | Hast du schon. Eine .de-Domain kostet meist 5–15 € im Jahr beim Domain-Anbieter. |
| **Rechtstexte** (empfohlen) | Geprüfte AGB, Datenschutz, Widerruf. | Rechtstexte-Dienste (z. B. Händlerbund, IT-Recht Kanzlei) ca. 10–30 € im Monat |

**Ungefähr pro Monat:** ca. 20 $ (Vercel Pro) + Stripe-Gebühren pro Bestellung + Domain.
Preise ändern sich manchmal. Die aktuellen Preise stehen auf vercel.com/pricing, upstash.com/pricing und stripe.com/de/pricing.

---

## Schritt 0 – Was du brauchst

Leg dir das bereit, bevor du anfängst:

- [ ] **GitHub-Konto** `Orhanyilmaz28` mit Zugang zum Projekt **chatbot** (dort liegt der Shop im Ordner `shop`).
- [ ] **E-Mail-Adresse**, am besten eine Firmenadresse (z. B. hello@exstase.com).
- [ ] **Handy** – für Bestätigungscodes beim Anmelden.
- [ ] **Bankkonto der GmbH** (IBAN) – hierhin zahlt Stripe dein Geld aus.
- [ ] **Ausweis** (Personalausweis oder Reisepass) des Geschäftsführers – Stripe prüft, wer hinter der Firma steht.
- [ ] **Firmendaten:** Handelsregister (Amtsgericht Düsseldorf, HRB 90042), USt-IdNr., Adresse. Außerdem die Namen aller Personen, denen 25 % oder mehr der GmbH gehören.
- [ ] **Zugang zur Domain exstase-energy.de** – also das Login bei dem Anbieter, bei dem die Domain gekauft wurde (z. B. IONOS, Strato, united-domains, GoDaddy oder Shopify).
- [ ] **Kreditkarte** für Vercel Pro.
- [ ] Einen sicheren Ort für Passwörter, am besten einen **Passwort-Manager**.

> **So siehst du, dass es geklappt hat:** Alle Haken sind gesetzt. Du kannst dich bei GitHub anmelden und siehst das Projekt `chatbot`.

---

## Schritt 1 – Änderungen übernehmen (Pull Request zusammenführen)

**Worum geht's?** Alle neuen Teile des Shops (Design, Dashboard …) liegen in einem eigenen Zweig namens `claude/affectionate-curie-nozyux`.
Ein **Pull Request** ist der Vorschlag, diese Änderungen in den Hauptzweig `main` zu übernehmen. Vercel veröffentlicht später immer, was in `main` liegt.

**Dauer:** 2 Minuten

1. Öffne **https://github.com/Orhanyilmaz28/chatbot/pulls** und melde dich an.
2. Klick auf den Pull Request, unter dem steht:
   *„wants to merge … into `main` from `claude/affectionate-curie-nozyux`“*.
   Im Moment ist das **Nr. 2** („exstase-energy.de: Redesign, Video, echte Fotos und neues Logo“).
   Pull Requests mit dem grauen Wort **Draft** (Entwurf) lässt du in Ruhe.
3. Scroll ganz nach unten. Dort steht im Idealfall grün: *„This branch has no conflicts with the base branch“*.
4. Klick auf den grünen Knopf **Merge pull request**.
   Ist neben dem Knopf ein kleiner Pfeil, wähl dort **Create a merge commit**.
5. Klick auf **Confirm merge**.
6. Danach erscheint der Knopf **Delete branch**. **Den drückst du nicht.**

> **So siehst du, dass es geklappt hat:** Oben am Pull Request steht ein lila Etikett **Merged**.
> Wenn du auf **Code** klickst (Zweig `main`), siehst du den Ordner **`shop`**.

> [!TIP]
> **Später kommen neue Änderungen genauso.** Hat Claude (oder ein Entwickler) etwas verbessert, gibt es einen neuen Pull Request.
> Du führst ihn genauso zusammen – Vercel aktualisiert den Shop dann **ganz von selbst** in 2–3 Minuten.

<details>
<summary><b>Plan B:</b> Ich möchte den Pull Request noch nicht zusammenführen</summary>

Du kannst Vercel auch direkt den Zweig `claude/affectionate-curie-nozyux` veröffentlichen lassen.
Mach dafür erst Schritt 2. Danach im Vercel-Projekt: **Settings → Environments → Production** und bei **Branch Tracking** den Zweig `claude/affectionate-curie-nozyux` eintragen
(in älteren Ansichten: **Settings → Git → Production Branch**). Speichern und dann einmal **Redeploy** (siehe Schritt 4).
Einfacher und übersichtlicher ist aber Plan A: zusammenführen.
</details>

---

## Schritt 2 – Vercel-Konto anlegen und Shop importieren

**Worum geht's?** Vercel ist der Dienst, der deinen Shop rund um die Uhr im Internet bereitstellt.

**Dauer:** 10 Minuten

1. Öffne **https://vercel.com/signup**.
2. Vercel fragt, wofür du es nutzt:
   - **Hobby** = kostenlos, zum Ausprobieren.
   - **Pro** = ca. 20 $ im Monat, für echte Shops.

   Du kannst mit Hobby anfangen und vor dem ersten echten Verkauf wechseln (**Settings → Billing**). Wichtig: Für einen Shop, der Geld verdient, verlangt Vercel Pro.
3. Klick auf **Continue with GitHub** und melde dich mit deinem GitHub-Konto an. Bestätige mit **Authorize Vercel**.
4. Klick oben rechts auf **Add New…** → **Project**.
5. Du siehst die Liste **Import Git Repository**. Klick bei **chatbot** auf **Import**.
   - Du siehst `chatbot` nicht? Klick auf **Adjust GitHub App Permissions** (oder **Configure GitHub App**). Wähl dort **Only select repositories** → `chatbot` → **Save**.
6. Jetzt kommt die Seite **New Project** (oder **Configure Project**). Hier sind **drei Dinge** wichtig:

   | Feld | Was du einträgst |
   | --- | --- |
   | **Project Name** | `EXSTASE` |
   | **Root Directory** | Klick auf **Edit**, wähl den Ordner **`shop`** und klick auf **Continue**. |
   | **Framework Preset** | Muss **Next.js** zeigen. (Wenn nicht: auswählen.) |

   Alles andere lässt du, wie es ist. Bei **Environment Variables** trägst du jetzt noch nichts ein – das kommt in Schritt 4.

> [!IMPORTANT]
> **Root Directory = `shop` ist der wichtigste Klick der ganzen Anleitung.**
> Im Hauptordner des Projekts liegt noch ein anderes Programm (eine Chatbot-Vorlage). Ohne diese Einstellung baut Vercel das falsche Programm.

7. Klick auf **Deploy**. Jetzt baut Vercel deinen Shop. Das dauert 2–4 Minuten. Du kannst dabei zusehen.

> **So siehst du, dass es geklappt hat:**
> - Es erscheint **Congratulations!** mit einem kleinen Bild deines Shops.
> - Klick auf **Continue to Dashboard**. Bei **Domains** steht deine Vercel-Adresse, z. B. `EXSTASE.vercel.app`.
> - Öffne diese Adresse: Dein Shop ist da.
> - Leg ein Produkt in den Warenkorb und klick auf **Sicher zur Kasse**. Es erscheint der Hinweis *„Demo-Modus: Bitte STRIPE_SECRET_KEY setzen …“*. **Das ist jetzt richtig so** – Bezahlen richten wir in Schritt 5 ein.
>
> **Schreib dir die Vercel-Adresse auf.** Du brauchst sie in Schritt 4.

---

## Schritt 3 – Datenspeicher verbinden

**Worum geht's?** Wenn du im Dashboard einen Preis änderst, eine Bewertung freigibst oder eine Bestellung als „versendet“ markierst, muss sich der Shop das merken.
Dafür braucht er einen kleinen Datenspeicher: **Upstash Redis**. Er ist kostenlos und lässt sich direkt in Vercel anlegen.

**Dauer:** 5 Minuten

1. Öffne in Vercel dein Projekt **EXSTASE** und klick oben auf den Reiter **Storage**.
2. Klick auf **Create Database** (manchmal heißt es **Connect Database**).
3. Wähl in der Liste **Upstash** (*„Upstash for Redis“* / *„Serverless DB (Redis …)“*) und klick auf **Continue**. Falls gefragt: Bedingungen akzeptieren.
4. Stell Folgendes ein:

   | Feld | Was du wählst |
   | --- | --- |
   | **Primary Region** | **Frankfurt, Germany (eu-central-1)** – so bleiben die Daten in der EU. Das ist wichtig für den Datenschutz. |
   | **Plan** | **Free** |
   | **Database Name** | z. B. `EXSTASE-daten` |

   Dann **Create** (oder **Continue**).
5. Es öffnet sich **Connect Project** (falls nicht: in der neuen Datenbank auf **Connect Project** klicken).
   - Wähl dein Projekt **EXSTASE**.
   - Lass alle Umgebungen angehakt: **Development**, **Preview**, **Production**.
   - Ein Feld **Custom Prefix** (manchmal unter **Advanced**) lässt du **leer** bzw. unverändert.
   - Klick auf **Connect**.

> **So siehst du, dass es geklappt hat:** Geh im Projekt zu **Settings → Environment Variables**.
> Dort stehen jetzt neue Einträge, darunter **`KV_REST_API_URL`** und **`KV_REST_API_TOKEN`**. (Weitere Einträge wie `KV_URL` oder `REDIS_URL` sind normal – einfach in Ruhe lassen.)
>
> Heißen die Einträge anders, z. B. `STORAGE_KV_REST_API_URL`? → [Häufige Probleme](#der-gelbe-kasten-datenspeicher-fehlt-geht-nicht-weg).

**Noch nicht neu bereitstellen** – das machen wir am Ende von Schritt 4 einmal für alles zusammen.

---

## Schritt 4 – Umgebungsvariablen eintragen

**Worum geht's?** Umgebungsvariablen sind geheime Einstellungen, die nicht im Code stehen – zum Beispiel dein Dashboard-Passwort.
Jede Variable hat einen **Namen** (bei Vercel: **Key**) und einen **Wert** (**Value**).

**Dauer:** 10 Minuten

### So trägst du eine Variable ein

1. Im Vercel-Projekt: **Settings** → **Environment Variables**.
2. Bei **Key** den Namen eintragen (genau so schreiben wie unten, mit Großbuchstaben und Unterstrichen).
3. Bei **Value** den Wert eintragen. **Ohne Anführungszeichen, ohne Leerzeichen.**
4. Bei **Environments** alles angehakt lassen (Production, Preview, Development).
5. Für Passwörter und Schlüssel kannst du **Sensitive** einschalten – dann zeigt Vercel den Wert später nicht mehr an. (Dabei fällt das Häkchen bei *Development* weg. Das ist in Ordnung.)
6. **Save** klicken.

### Diese Variablen brauchst du

| Name (Key) | Wert (Value) | Wozu | Pflicht? |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Dein **eigenes, langes** Passwort. Mindestens 8 Zeichen, besser 16 oder mehr. Beispiel-Muster: vier Wörter mit Zahl, z. B. `Wolke-Tasse-Fluss-Kiefer-73` (**nicht** genau dieses nehmen!). | Damit meldest du dich im Dashboard an. | **Ja** |
| `NEXT_PUBLIC_SITE_URL` | **Jetzt:** deine Vercel-Adresse aus Schritt 2, z. B. `https://EXSTASE.vercel.app`. **Ab Schritt 6:** `https://exstase-energy.de`. Immer mit `https://` und **ohne** `/` am Ende. | Dorthin kommen Kund:innen nach dem Bezahlen zurück. Außerdem für Google und Link-Vorschauen. | **Ja** |
| `STRIPE_SECRET_KEY` | Kommt in **Schritt 5**: erst ein Testschlüssel `sk_test_…`, später der echte `sk_live_…`. | Bezahlen und Bestellungen im Dashboard. | **Ja** (ab Schritt 5) |
| `NEWSLETTER_WEBHOOK_URL` | Eine Webhook-Adresse, z. B. von Zapier oder Make. | Schickt jede Newsletter-Anmeldung automatisch weiter (z. B. zu Brevo). Ohne das: Adressen stehen im Dashboard, mit Export. | Nein |
| `REVIEW_WEBHOOK_URL` | Eine Webhook-Adresse, z. B. von Zapier oder Make. | Benachrichtigt dich bei jeder neuen Bewertung (z. B. per E-Mail). | Nein |
| `BREVO_API_KEY`, `MAIL_FROM`, `BREVO_LIST_ID` | Kommen in **Schritt 8** (E-Mail-Versand). | Bestellbestätigung, Versand-E-Mail, Newsletter-Bestätigung, „Passwort vergessen“. | Nein (empfohlen) |
| `STRIPE_WEBHOOK_SECRET` | Kommt in **Schritt 8.4**. | Bestellbestätigung auch, wenn die Danke-Seite geschlossen wird. | Nein (empfohlen) |
| `SESSION_SECRET` | Eine lange Zufallszeichenfolge, z. B. 40 beliebige Buchstaben und Zahlen. | Nur für **Kundenkonten** (vorbereitet, im Dashboard unter *Kunden* einschaltbar): hält Kund:innen angemeldet, auch wenn du dein Admin-Passwort änderst. | Nein (empfohlen, bevor du Kundenkonten einschaltest) |
| `ADMIN_SECRET` | – | Brauchst du nicht. Leer lassen. | Nein |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | – | Hat Vercel in Schritt 3 selbst eingetragen. **Nicht anfassen.** | automatisch |

> [!WARNING]
> **`ADMIN_DEMO` niemals online eintragen.** Diese Variable ist nur zum Testen auf dem eigenen Computer. Sie zeigt erfundene Beispiel-Bestellungen.
> Und: Nimm online **nicht** das Passwort, das du vielleicht vom Testen auf dem eigenen Computer kennst. Wähl ein neues.

### Danach: neu bereitstellen („Redeploy“)

Vercel liest die Variablen nur beim Bereitstellen. **Merksatz: Variable geändert → Redeploy.**

1. Klick oben auf den Reiter **Deployments**.
2. Beim **obersten** Eintrag ganz rechts auf **⋯** (drei Punkte) klicken.
3. **Redeploy** wählen und im Fenster noch einmal **Redeploy** klicken.
4. 2–3 Minuten warten, bis beim Eintrag **Ready** steht.

(Oft zeigt Vercel nach dem Speichern einer Variable auch direkt einen Knopf **Redeploy** an. Den kannst du genauso nehmen.)

> **So siehst du, dass es geklappt hat:**
> - Öffne `https://DEINE-VERCEL-ADRESSE/admin` (z. B. `https://EXSTASE.vercel.app/admin`).
> - Gib dein Passwort ein → **Anmelden**. Du siehst die **Übersicht** des Dashboards.
> - Oben steht **kein** gelber Kasten *„Datenspeicher fehlt“*.
> - Scroll in der Übersicht nach unten zum **Startklar-Check**: Bei **Datenspeicher verbunden** steht *„Online verbunden“*, bei **Shop-Adresse eingetragen** ist ein Haken.
> - Mini-Test: Geh zu **Einstellungen** und trag bei **Telefonnummer** deine Firmennummer ein (die fehlt ohnehin noch). Klick unten auf **Speichern**.
>   Es erscheint grün: *„Gespeichert – die Änderungen sind in wenigen Sekunden im Shop zu sehen.“*

---

## Schritt 5 – Stripe einrichten (Bezahlen)

**Worum geht's?** Stripe nimmt die Zahlungen an und zahlt das Geld auf dein Bankkonto aus.
Du richtest erst einen **Testmodus** ein (kein echtes Geld). Wenn alles klappt, schaltest du auf **live** (echtes Geld).

**Dauer:** ca. 45 Minuten, dazu 1–3 Tage, bis Stripe deine Firma geprüft hat. Testen kannst du schon vorher.

### 5.1 Konto anlegen

1. Öffne **https://dashboard.stripe.com/register**.
2. E-Mail, Name, Passwort eingeben. Land: **Deutschland**.
3. Bestätige deine E-Mail-Adresse (Link in der E-Mail anklicken).
4. Richte die Anmeldung mit Handy-Code ein (Stripe fragt danach).

### 5.2 Firma prüfen lassen (Konto aktivieren)

1. Auf der Stripe-Startseite: **Konto aktivieren** (oder **Zahlungen aktivieren**).
2. Füll die Fragen aus. Das brauchst du:
   - **Rechtsform:** Kapitalgesellschaft / GmbH – *exstase Großhandel GmbH*, Carl-Kühne-Straße 4, 47638 Straelen
   - **Handelsregister:** Amtsgericht Düsseldorf, HRB 90042 – und die **USt-IdNr.**
   - **Geschäftsführer:** persönliche Daten und Foto vom Ausweis (geht meist per Handy)
   - **Eigentümer:** alle Personen mit 25 % oder mehr
   - **Branche / Beschreibung:** z. B. *„Online-Shop für Energy Drinks“*
   - **Website:** `https://exstase-energy.de`
   - **Text auf der Kontoabrechnung** (Abrechnungsbezeichnung): `TRAGETRAUM` – das sehen Kund:innen auf ihrem Kontoauszug. Neutral und diskret.
   - **Bankkonto (IBAN)** der GmbH für die Auszahlungen
3. Absenden. Stripe prüft das meist in Minuten, manchmal in 1–3 Werktagen. Du bekommst eine E-Mail.

### 5.3 Testschlüssel eintragen

1. Schalte in Stripe den **Testmodus** ein (Schalter oben; bei neueren Konten heißt das **Sandbox** – dann die Sandbox öffnen).
2. Geh zu **Entwickler → API-Schlüssel** (englisch: *Developers → API keys*).
3. Beim **Geheimschlüssel** (beginnt mit `sk_test_`) auf **Testschlüssel anzeigen** klicken und kopieren.
   **Nicht** den *veröffentlichbaren Schlüssel* nehmen (beginnt mit `pk_`).
4. In Vercel: **Settings → Environment Variables** → neue Variable `STRIPE_SECRET_KEY`, Wert einfügen → **Save**.
5. **Redeploy** (wie in Schritt 4).

### 5.4 Testkauf machen

1. Öffne deinen Shop (Vercel-Adresse). Leg ein Produkt in den Warenkorb → **Sicher zur Kasse**.
2. Die Bezahlseite von Stripe öffnet sich. Oben steht **Testmodus** (oder **Sandbox**).
3. Gib die **Testkarte** ein:

   | Feld | Eingabe |
   | --- | --- |
   | Kartennummer | `4242 4242 4242 4242` |
   | Ablaufdatum | irgendein Datum in der Zukunft, z. B. `12/34` |
   | Prüfnummer (CVC) | irgendeine dreistellige Zahl, z. B. `123` |
   | Name, Adresse | beliebig, z. B. deine eigene |

4. Haken bei den AGB setzen → **Bezahlen**.

> **So siehst du, dass es geklappt hat:**
> - Du landest auf der Seite **„Danke für deine Bestellung!“**.
> - Im Dashboard unter **Bestellungen** steht die Testbestellung mit Status **Offen**.
> - In Stripe unter **Zahlungen** steht die Zahlung.
> - Im **Startklar-Check** steht bei **Zahlungen mit Stripe** *„Verbunden“* und bei **Echte Zahlungen** *„Testmodus“*.
>
> **Tipp:** Übe jetzt mit der Testbestellung das Versenden im Dashboard (Anleitung: [DASHBOARD.md](DASHBOARD.md)). Da kann nichts passieren.

### 5.5 Zahlungsarten einschalten

1. In Stripe: **Einstellungen** (Zahnrad oben rechts) → **Zahlungen** → **Zahlungsmethoden**.
2. Schalte ein:
   - **Karten** – ist schon an.
   - **Apple Pay** und **Google Pay** – meist schon an. Sie funktionieren ohne weitere Einrichtung, weil die Bezahlseite von Stripe kommt.
   - **PayPal** – auf **Aktivieren** klicken und dein PayPal-**Geschäftskonto** verbinden. Stripe führt dich durch.
   - **Klarna** – auf **Aktivieren** klicken.
   - **SEPA-Lastschrift** – lieber **aus** lassen: Das Geld kommt erst nach mehreren Tagen, und Kund:innen können die Abbuchung zurückholen.
3. Mach das **im Live-Modus** (Testmodus aus). Test- und Live-Modus haben getrennte Einstellungen.

Der Shop zeigt an der Kasse automatisch alle Zahlungsarten, die du hier einschaltest. Am Code muss nichts geändert werden.

### 5.6 E-Mails einschalten

- **Bestätigung für Kund:innen:** In Stripe → **Einstellungen** → (**Unternehmen** →) **Kunden-E-Mails** (englisch: *Customer emails*) → **Erfolgreiche Zahlungen** einschalten.
  Das ist nur nötig, **solange** der eigene E-Mail-Versand (Schritt 8) noch nicht eingerichtet ist. Danach verschickt der Shop eine schönere Bestellbestätigung selbst – dann die Stripe-E-Mail wieder ausschalten, sonst bekommen Kund:innen zwei.
- **Nachricht an dich bei jeder Bestellung:** Lade die **Stripe-App** aufs Handy (iPhone/Android) und erlaube Mitteilungen.
  Oder per E-Mail: In Stripe → **Einstellungen** → **Persönliche Einstellungen** → **Kommunikationseinstellungen** (englisch: *Communication preferences*) → bei **Erfolgreiche Zahlungen** E-Mail einschalten.

### 5.7 Auf echte Zahlungen umschalten (live)

Erst, wenn Stripe deine Firma freigegeben hat (5.2) und der Testkauf geklappt hat.

1. In Stripe den **Testmodus ausschalten** (bzw. die Sandbox verlassen).
2. **Entwickler → API-Schlüssel** → beim **Geheimschlüssel** (beginnt mit `sk_live_`) auf **Live-Schlüssel anzeigen** klicken und kopieren.
   Stripe zeigt diesen Schlüssel eventuell **nur einmal** an – füg ihn sofort in Vercel ein. Verloren? Kein Problem: In Stripe einen neuen erstellen (**Schlüssel rotieren**).
3. In Vercel: **Settings → Environment Variables** → bei `STRIPE_SECRET_KEY` rechts auf **⋯ → Edit** → den Live-Schlüssel einfügen → **Save**.
4. **Redeploy**.
5. Mach einen **echten Probekauf** mit deiner eigenen Karte (günstigstes Produkt).
   Danach in Stripe unter **Zahlungen** die Zahlung öffnen → **Erstatten**. Die Stripe-Gebühr (ca. 0,70 €) bekommst du dabei nicht zurück.

> **So siehst du, dass es geklappt hat:**
> - Die Bezahlseite zeigt **keinen** Hinweis „Testmodus“ mehr.
> - Im **Startklar-Check** steht bei **Echte Zahlungen (Live-Modus)** *„Live“*.
> - Dein Probekauf steht im Dashboard unter **Bestellungen**.
>
> Gut zu wissen: Test- und Live-Bestellungen sind bei Stripe getrennt. Nach dem Umschalten siehst du im Dashboard nur noch echte Bestellungen.

---

## Schritt 6 – Domain exstase-energy.de verbinden

**Worum geht's?** Bisher ist dein Shop unter der Vercel-Adresse erreichbar. Jetzt bekommt er seine richtige Adresse **exstase-energy.de**.

**Dauer:** 15 Minuten Klicken, dann meist 5–60 Minuten warten (selten bis zu 48 Stunden).

> [!WARNING]
> **Ab diesem Schritt sehen alle Besucher:innen den neuen Shop.** Mach ihn erst, wenn Schritt 1–5 klappen.
> Läuft unter exstase-energy.de noch ein alter Shop (z. B. Shopify)? Dann kündige den alten Shop **erst, wenn der neue läuft** – siehe Kasten unten.

### 6.1 Domain bei Vercel hinzufügen

1. Im Vercel-Projekt: **Settings → Domains** → **Add Domain** (oder **Add**).
2. `exstase-energy.de` eintragen → **Add** / **Save**.
3. Vercel fragt nach der Variante mit `www`. Wähl die Möglichkeit, bei der **www.exstase-energy.de auf exstase-energy.de weiterleitet**
   (*„Add exstase-energy.de and redirect www.exstase-energy.de to it“* oder ähnlich) → **Save**.
   Vercel empfiehlt manchmal die umgekehrte Richtung. Nimm trotzdem diese – der Shop ist auf **exstase-energy.de ohne www** eingestellt.
4. Vercel zeigt jetzt **Invalid Configuration** und eine kleine Tabelle mit **Type**, **Name** und **Value**. Das ist normal – diese Einträge musst du gleich beim Domain-Anbieter eintragen.
   Meistens sieht das so aus:

   | Typ | Name | Wert |
   | --- | --- | --- |
   | `A` | `@` | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

> [!IMPORTANT]
> **Nimm immer die Werte, die Vercel dir anzeigt.** Manchmal sind es andere als oben, z. B. eine längere Adresse wie `…vercel-dns-017.com`. Dann gilt die von Vercel.

### 6.2 Einträge beim Domain-Anbieter ändern

1. Öffne einen **zweiten Browser-Tab** und melde dich bei deinem Domain-Anbieter an (IONOS, Strato, united-domains, GoDaddy, Shopify …).
2. Such die Domain **exstase-energy.de** und dort **DNS**, **DNS-Einstellungen** oder **Records bearbeiten**.
3. **A-Eintrag:** Such den Eintrag vom Typ **A** mit dem Namen **@** (manchmal steht da auch nichts oder `exstase-energy.de`).
   Ersetz den alten Wert durch den Wert von Vercel (meist `76.76.21.21`).
   Gibt es **mehrere** A-Einträge für `@`, lösch die alten (z. B. `23.227.38.65` von Shopify). Einträge vom Typ **AAAA** für `@` ebenfalls löschen.
4. **CNAME-Eintrag:** Such den Eintrag vom Typ **CNAME** mit dem Namen **www**.
   Ersetz den Wert durch den Wert von Vercel (meist `cname.vercel-dns.com`). Gibt es keinen, leg ihn neu an.
5. **Speichern.**

> [!CAUTION]
> **Lass diese Einträge in Ruhe:** alles vom Typ **MX** und **TXT**. Die sind für deine **E-Mails** (und für Bestätigungen bei Google & Co.).
> Löschst du sie, kommen keine E-Mails mehr an.

### 6.3 Warten – und dann die Shop-Adresse umstellen

1. Geh zurück zu Vercel (**Settings → Domains**). Vercel prüft von selbst, ob die Einträge stimmen. Neu laden hilft beim Nachsehen.
   Sobald beide Domains **Valid Configuration** zeigen, erstellt Vercel automatisch das Sicherheitszertifikat (das Schloss im Browser).
2. Jetzt die Shop-Adresse umstellen: **Settings → Environment Variables** → `NEXT_PUBLIC_SITE_URL` → **⋯ → Edit** → `https://exstase-energy.de` → **Save**.
3. **Redeploy.**

> **So siehst du, dass es geklappt hat:**
> - In Vercel steht bei `exstase-energy.de` und `www.exstase-energy.de` ein grüner Haken / **Valid Configuration**.
> - **https://exstase-energy.de** zeigt deinen neuen Shop, mit Schloss-Symbol in der Adresszeile.
> - **www.exstase-energy.de** leitet automatisch auf **exstase-energy.de** weiter.
> - Im **Startklar-Check** steht bei **Shop-Adresse**: *„Aktuell eingetragen: https://exstase-energy.de“*.
> - Nach einem Kauf landest du wieder auf **exstase-energy.de** (nicht auf der Vercel-Adresse).

> [!NOTE]
> **Domain bei Shopify gekauft?** Dann änderst du die Einträge in Shopify: **Einstellungen → Domains → exstase-energy.de → Domain-Einstellungen → DNS-Einstellungen bearbeiten**.
> **Kündige Shopify erst, wenn die Domain zu einem anderen Anbieter umgezogen ist** (in Shopify „Domain übertragen“, du bekommst einen Auth-Code für den neuen Anbieter).
> Sonst kann die Domain verloren gehen.
>
> **Vor dem Kündigen eines alten Shops:** Lade alle alten Bestellungen und Rechnungen herunter. Geschäftsunterlagen musst du jahrelang aufbewahren (frag deine Steuerberatung).

---

## Schritt 7 – Rechtliches vor dem Start

Ein Online-Shop in Deutschland muss ein paar Regeln einhalten. Wer sie nicht einhält, kann teure **Abmahnungen** bekommen.
Diese Liste ist **keine Rechtsberatung**. Sie zeigt dir, woran du denken musst. Lass die Rechtstexte bitte von einem Anwalt oder einem Rechtstexte-Dienst prüfen.

- [ ] **Impressum vollständig.** Dashboard → **Einstellungen** → **Firmendaten (Impressum)**. Im Moment fehlen noch **E-Mail-Adresse**, **Telefonnummer** und **USt-IdNr.**
  Fertig, wenn im **Startklar-Check** bei *Firmendaten fürs Impressum* ein Haken ist und auf **exstase-energy.de/impressum** nichts mehr gelb markiert ist.
- [ ] **AGB, Widerrufsbelehrung, Datenschutzerklärung und Versand-Seite prüfen lassen.** Die Texte im Shop sind **Vorlagen**. Offene Punkte darin:
  - **Widerruf:** Wer zahlt die Rücksendung? Das stellst du selbst ein: Dashboard → **Einstellungen** → **Rücksendung bei Widerruf**. Die Widerrufsbelehrung und der Lieferschein passen sich automatisch an.
  - **Lebensmittel / Getränke:** Das Widerrufsrecht gilt grundsätzlich auch hier; für schnell verderbliche Ware kann es entfallen – bei Dosen mit langer Haltbarkeit in der Regel nicht. Das muss richtig formuliert sein. Auch das **Einwegpfand** (0,25 € je Dose) sollte in AGB und Widerrufsbelehrung erwähnt werden.
  - **Datenschutz:** Vercel, Upstash und Stripe sind schon eingetragen. Offen ist nur noch der Newsletter-Anbieter *„[Anbieter eintragen, z. B. Brevo]“*. Wichtig: Die Erklärung sagt, dass die Daten in **Frankfurt** liegen – das stimmt nur, wenn du in Schritt 3 Frankfurt gewählt hast.

  Diese Texte stehen im Code. Schick die geprüften Texte an Claude oder deinen Entwickler – sie werden dann eingebaut.
- [ ] **Alle Dienste in der Datenschutzerklärung nennen:**
  - **Vercel** (Hosting, Firma in den USA)
  - **Upstash** (Datenspeicher, Region Frankfurt – speichert Newsletter-Adressen, Bewertungen mit E-Mail-Adresse und Produktfotos)
  - **Stripe** (Zahlung) – und **PayPal** bzw. **Klarna**, wenn du sie einschaltest
  - **Brevo** (Newsletter), wenn du es nutzt

  Mit diesen Anbietern brauchst du außerdem einen **Vertrag zur Auftragsverarbeitung** (AVV, englisch *DPA*). Den gibt es bei allen in den Einstellungen bzw. auf ihrer Website zum Abschließen oder Herunterladen. Ablegen und aufheben.
- [ ] **Verpackungsregister LUCID.** Wer verpackte Ware an Privatleute verschickt, muss sich **vor dem Verkauf** kostenlos bei **https://lucid.verpackungsregister.org** registrieren.
  Außerdem musst du deine Versandverpackungen bei einem **dualen System** lizenzieren (z. B. über Lizenzero oder Interzero; Kosten je nach Menge). Ohne das droht ein Verkaufsverbot.
  Hast du schon über Shopify verkauft, ist das vielleicht erledigt – prüf, ob es auf die *exstase Großhandel GmbH* läuft.
- [ ] **Newsletter nur mit Double-Opt-in.** Der Shop **sammelt** die Adressen nur. Werbung darfst du erst schicken, wenn die Person ihre Anmeldung in einer Bestätigungs-E-Mail angeklickt hat (*Double-Opt-in*).
  Das übernimmt dein Newsletter-Tool (z. B. **Brevo**). So geht's: [DASHBOARD.md → Newsletter](DASHBOARD.md#newsletter).
- [ ] **Bestellbestätigung mit Widerrufsbelehrung.** Kund:innen müssen spätestens mit der Lieferung AGB, Widerrufsbelehrung und Muster-Widerrufsformular **dauerhaft** bekommen (Papier oder E-Mail – ein Link reicht nicht).
  Die Quittung von Stripe enthält das nicht. **Dafür gibt es den Lieferschein:** Dashboard → Bestellung → **Lieferschein drucken**. Seite 2 enthält Widerrufsbelehrung und Muster-Widerrufsformular – einfach beide Seiten mit ins Paket legen. Lass dir das vom Anwalt bestätigen.
- [ ] **Zutaten, Allergene, Nährwerte und Koffeingehalt.** Beim Online-Verkauf von Lebensmitteln müssen diese Angaben **vor dem Kauf** auf der Produktseite stehen (Lebensmittelinformationsverordnung). Trag sie selbst ein: Dashboard → **Produkte** → Produkt öffnen → **Zutaten & Nährwerte**. Die Angaben stehen auf der Dose. Der Startklar-Check zeigt, bei wie vielen Produkten sie noch fehlen. Energy Drinks mit mehr als 150 mg Koffein je Liter brauchen außerdem den Hinweis „Erhöhter Koffeingehalt. Für Kinder und schwangere oder stillende Frauen nicht empfohlen“ mit Angabe des Koffeingehalts (steht schon in den Produkttexten – bitte den Wert ergänzen).
- [ ] **Werbeaussagen prüfen lassen.** Aussagen wie „gibt Energie“ oder „macht wach“ sind gesundheitsbezogene Angaben (Health-Claims-Verordnung) und nur in engen Grenzen erlaubt.
- [ ] **Pfand.** Einweg-Getränkedosen sind pfandpflichtig (0,25 €). Der Shop berechnet das Pfand an der Kasse; als Hersteller/Vertreiber musst du dich beim Pfandsystem (z. B. DPG) anmelden. Neue Produkte, die im Dashboard angelegt werden, bekommen das Pfand automatisch, wenn die Variante z. B. „12er Pack“ heißt.
- [ ] **Steuern mit der Steuerberatung klären.** Die Preise im Shop enthalten 19 % MwSt. Der Shop liefert auch nach Österreich, in die Niederlande, nach Belgien, Luxemburg, Frankreich, Italien und Dänemark (nicht in die Schweiz – dort kämen Zoll und Schweizer Steuer dazu).
  Ab **10.000 € Umsatz im Jahr** in andere EU-Länder gilt dort deren Mehrwertsteuer (**OSS-Verfahren**). Die Schweiz ist deshalb bewusst nicht als Lieferland eingestellt.

---

## Schritt 8 – E-Mail-Versand einrichten (Brevo)

**Worum geht's?** Damit verschickt der Shop selbst: **Bestellbestätigung**, **Info an dich** bei neuen Bestellungen, **Versand-E-Mail** mit Sendungsverfolgung, **Newsletter-Bestätigung** (Double-Opt-In – Pflicht für Newsletter) und **„Passwort vergessen“**.
Wir nehmen **Brevo**: Anbieter aus der EU, deutsche Oberfläche, kostenlos bis 300 E-Mails pro Tag. Damit schreibst du später auch deinen Newsletter.

**Dauer:** ca. 30 Minuten, dazu Wartezeit für die DNS-Einträge (wie bei der Domain).

### 8.1 Konto anlegen
1. **brevo.com/de** → **Kostenlos anmelden**. Firmendaten eintragen (exstase Großhandel GmbH).

### 8.2 Domain bestätigen (damit E-Mails nicht im Spam landen)
1. In Brevo: oben rechts auf deinen Namen → **Absender, Domains & dedizierte IPs** (englisch: *Senders, Domains & Dedicated IPs*) → Reiter **Domains** → **Domain hinzufügen** → `exstase-energy.de`.
2. Brevo zeigt dir **3–4 Einträge** (Typ **TXT** und ggf. **CNAME**: „Brevo-Code“, „DKIM“, „DMARC“). Fenster offen lassen.
3. Bei **STRATO** → Domainverwaltung → **exstase-energy.de** → **DNS** → **TXT- und CNAME-Records verwalten** → jeden Eintrag von Brevo **genau so** anlegen (Name/Host und Wert kopieren) → speichern.
4. Zurück bei Brevo auf **Authentifizieren** / **Prüfen** klicken. Das kann ein paar Minuten bis Stunden dauern – einfach später noch einmal klicken.

> [!CAUTION]
> Nur **neue** Einträge hinzufügen. **Vorhandene MX- und TXT-Einträge nicht löschen** – sonst kommen deine eigenen E-Mails nicht mehr an.
> Gibt es schon einen TXT-Eintrag, der mit `v=DMARC1` beginnt, nur den Wert nach Brevos Vorgabe anpassen, keinen zweiten anlegen.

5. Unter **Absender** einen Absender anlegen, z. B. Name `EXSTASE`, E-Mail `hello@exstase.com` (am besten eine Adresse, die es bei dir wirklich gibt – Antworten von Kund:innen landen sonst im Nichts).

### 8.3 API-Schlüssel holen und in Vercel eintragen
1. In Brevo: oben rechts auf deinen Namen → **SMTP & API** → Reiter **API-Schlüssel** → **Neuen API-Schlüssel erstellen** → Name `Shop` → **Erstellen** → Schlüssel **kopieren** (er wird nur einmal angezeigt).
2. In Vercel → **Settings → Environment Variables** diese Einträge anlegen:

| Name (Key) | Wert (Value) |
| --- | --- |
| `BREVO_API_KEY` | der kopierte Schlüssel (beginnt mit `xkeysib-`) |
| `MAIL_FROM` | `EXSTASE <hello@exstase.com>` – genau die Absender-Adresse aus 8.2 |
| `BREVO_LIST_ID` | *optional:* In Brevo → **Kontakte → Listen** → Liste „Newsletter“ anlegen → die **Nummer (ID)** der Liste. Dann landen bestätigte Newsletter-Adressen automatisch dort. |

3. **Redeploy** (wie in Schritt 4).
4. Im Dashboard → **Einstellungen → E-Mails** → **Test-E-Mail an mich**. Kommt sie an (auch im Spam-Ordner nachsehen), klappt alles.

### 8.4 Stripe-Webhook verbinden (empfohlen)
Damit kommt die Bestellbestätigung auch dann, wenn jemand nach dem Bezahlen die Seite sofort schließt – und bei Zahlarten, die erst später bestätigt werden (z. B. Klarna, Lastschrift).

1. Stripe → **Entwickler** (englisch: *Developers*) → **Webhooks** → **Endpunkt hinzufügen**.
2. **Endpunkt-URL:** `https://www.exstase-energy.de/api/stripe/webhook`
3. **Ereignisse auswählen:** `checkout.session.completed` und `checkout.session.async_payment_succeeded` → **Endpunkt hinzufügen**.
4. Beim neuen Endpunkt unter **Signaturgeheimnis** auf **Anzeigen** klicken → Wert kopieren (beginnt mit `whsec_`).
5. In Vercel die Variable `STRIPE_WEBHOOK_SECRET` mit diesem Wert anlegen → **Redeploy**.

> [!NOTE]
> Test- und Live-Modus haben in Stripe **getrennte** Webhooks. Wenn du auf echte Zahlungen umschaltest (5.7), den Webhook im Live-Modus noch einmal anlegen und das neue `whsec_…` in Vercel eintragen.

### 8.5 Stripe-Quittung ausschalten
Jetzt kommt die Bestellbestätigung vom Shop. In Stripe → **Einstellungen → Kunden-E-Mails** → **Erfolgreiche Zahlungen** ausschalten, damit Kund:innen keine zwei E-Mails bekommen.

> **So siehst du, dass es geklappt hat:**
> - Dashboard → **Übersicht → Startklar-Check:** „E-Mail-Versand eingerichtet“ ist grün.
> - Nach einem Testkauf bekommst du die Info-E-Mail „Neue Bestellung“, die Kund:innen-Adresse die Bestellbestätigung.
> - Eine Newsletter-Anmeldung im Shop schickt eine Bestätigungs-E-Mail; nach dem Klick steht die Adresse im Dashboard auf **Bestätigt**.

---

## Start-Checkliste

Wenn hier alles abgehakt ist, kannst du loslegen:

- [ ] Shop läuft unter **https://exstase-energy.de** (mit Schloss).
- [ ] Dashboard-Login unter **https://exstase-energy.de/admin** klappt.
- [ ] **Startklar-Check** in der Übersicht: alle Punkte grün.
- [ ] Echter Probekauf geklappt und erstattet.
- [ ] Zahlungsarten eingeschaltet (PayPal, Klarna, Apple Pay …).
- [ ] Bestätigungs-E-Mails von Stripe sind an.
- [ ] Rechtliches aus Schritt 7 erledigt.
- [ ] Vercel läuft im **Pro**-Tarif.

---

## Häufige Probleme

### Vercel meldet beim Bauen einen Fehler (z. B. „No Next.js version detected“)
Meistens fehlt **Root Directory = `shop`**.
**Lösung:** Projekt → **Settings → Build and Deployment** (in älteren Ansichten **Settings → General**) → **Root Directory** → `shop` → **Save** → **Redeploy**.

### Vercel meldet „Deployment blocked“ oder „Git author … must have access“
Bei privaten GitHub-Projekten baut Vercel manchmal nur Änderungen, die von **dir** stammen.
**Lösung:** Führ Pull Requests selbst auf GitHub zusammen (Schritt 1, mit **Create a merge commit**). Oder klick in Vercel bei **Deployments** auf **⋯ → Redeploy**.

### Login-Seite sagt „Noch kein Passwort eingerichtet“
`ADMIN_PASSWORD` fehlt oder ist kürzer als 8 Zeichen.
**Lösung:** Variable eintragen (Schritt 4) → **Redeploy**.

### „Das Passwort stimmt nicht“
- Groß- und Kleinschreibung prüfen. Kein Leerzeichen am Ende?
- Passwort in Vercel geändert, aber kein **Redeploy** gemacht? Dann gilt noch das alte.
- **Passwort vergessen?** In Vercel bei `ADMIN_PASSWORD` einen neuen Wert eintragen → **Redeploy**. Alle Geräte werden dabei abgemeldet.

### Der gelbe Kasten „Datenspeicher fehlt“ geht nicht weg
1. Hast du nach Schritt 3 ein **Redeploy** gemacht?
2. **Settings → Environment Variables**: Gibt es `KV_REST_API_URL` **und** `KV_REST_API_TOKEN`?
3. Heißen sie anders, z. B. mit einem Wort davor (`STORAGE_KV_REST_API_URL`)? Dann leg **zwei neue Variablen** an:
   `KV_REST_API_URL` mit dem Wert von `…_KV_REST_API_URL` und `KV_REST_API_TOKEN` mit dem Wert von `…_KV_REST_API_TOKEN`. Danach **Redeploy**.
   (Die Werte findest du auch in Vercel unter **Storage** → deine Datenbank → **.env.local**-Ansicht bzw. **Quickstart**.)

### An der Kasse steht „Demo-Modus: Bitte STRIPE_SECRET_KEY setzen …“
`STRIPE_SECRET_KEY` fehlt, ist falsch geschrieben oder es fehlt das **Redeploy**.
**Lösung:** Schritt 5.3 wiederholen.

### An der Kasse steht „Zahlung konnte nicht gestartet werden“
- Hast du den **Geheimschlüssel** (`sk_…`) genommen und nicht den veröffentlichbaren (`pk_…`)?
- Beim Live-Schlüssel: Ist dein Stripe-Konto schon freigegeben (Schritt 5.2)?
- Genaue Fehlermeldung: In Stripe → **Entwickler → Protokolle** (englisch: *Logs*).

### Nach dem Bezahlen lande ich auf der falschen Seite (oder beim alten Shop)
`NEXT_PUBLIC_SITE_URL` stimmt nicht.
**Lösung:** Richtigen Wert eintragen (mit `https://`, ohne `/` am Ende) → **Redeploy**.

### Bestellungen fehlen im Dashboard
- Mit einem **Testschlüssel** siehst du nur Test-Bestellungen, mit dem **Live-Schlüssel** nur echte. Welcher gerade gilt, zeigt der **Startklar-Check**.
- Oben in der Übersicht steht ein roter Kasten *„Stripe konnte nicht abgefragt werden“*? Dann ist der Schlüssel falsch – neu kopieren (Schritt 5.3 bzw. 5.7).

### Die Domain zeigt bei Vercel „Invalid Configuration“
- Noch etwas warten (bis zu 48 Stunden möglich, meist viel schneller).
- Stimmen die Einträge **genau** mit denen von Vercel überein? Keine Leerzeichen, kein Punkt zu viel?
- Sind **alte A- oder AAAA-Einträge** für `@` noch da? Löschen.
- Nachprüfen kannst du das auf **https://dnschecker.org** (dort `exstase-energy.de` und Typ `A` eingeben).

### Kund:innen bekommen keine Bestätigungs-E-Mail
In Stripe → **Einstellungen → Kunden-E-Mails** → **Erfolgreiche Zahlungen** einschalten (Schritt 5.6). Im Testmodus verschickt Stripe keine Quittungen.

### Ich habe im Dashboard etwas geändert, sehe es aber nicht im Shop
- Seite neu laden (am Computer: **Strg + F5**, am Mac: **Cmd + Shift + R**).
- Steht im Dashboard ein gelber Kasten *„Datenspeicher fehlt“*? Dann wurde nichts gespeichert → Schritt 3.

### Ich komme gar nicht weiter
Mach einen Screenshot von der Fehlermeldung und schick ihn an Claude oder deinen Entwickler.
Hilfreich ist auch: In Vercel → **Deployments** → oberster Eintrag → **Build Logs** (oder **Logs**) – davon ebenfalls einen Screenshot.

---

## Täglich arbeiten

Der Shop läuft? Dann brauchst du ab jetzt fast nur noch das **Dashboard** unter **https://exstase-energy.de/admin**:
Bestellungen versenden, Preise ändern, Bewertungen freigeben, Newsletter-Adressen exportieren.

**Wie das geht, steht hier: [DASHBOARD.md](DASHBOARD.md).**
