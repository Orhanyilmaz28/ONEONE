# Das Dashboard – so arbeitest du jeden Tag mit deinem Shop

Im Dashboard erledigst du alles, was im Alltag anfällt: Bestellungen versenden, Produkte anlegen und Preise ändern, Bewertungen freigeben, Newsletter-Adressen exportieren und deine Firmendaten pflegen.
Du brauchst dafür nur einen Browser – am Computer, Tablet oder Handy.

> Der Shop ist noch nicht online? Dann zuerst: **[ONLINE-STELLEN.md](ONLINE-STELLEN.md)**.

**Inhalt**

1. [Anmelden](#anmelden)
2. [Deine tägliche Runde (5 Minuten)](#deine-tägliche-runde-5-minuten)
3. [Übersicht](#übersicht)
4. [Bestellungen](#bestellungen)
5. [Produkte](#produkte)
6. [Bewertungen](#bewertungen)
7. [Newsletter](#newsletter)
8. [Einstellungen](#einstellungen)
9. [KI-Kennzeichnung](#ki-kennzeichnung)
10. [Shop mit Passwort schützen](#shop-mit-passwort-schützen)
11. [E-Mails](#e-mails)
12. [Kunden (Kundenkonten – vorbereitet)](#kunden-kundenkonten--vorbereitet)
13. [Was das Dashboard nicht macht](#was-das-dashboard-nicht-macht)
14. [Häufige Fragen](#häufige-fragen)

---

## Anmelden

1. Öffne **https://exstase-energy.de/admin**.
   (Vor dem Umzug auf die Domain: deine Vercel-Adresse mit `/admin` dahinter, z. B. `https://EXSTASE.vercel.app/admin`.)
2. Gib dein **Passwort** ein (das ist der Wert von `ADMIN_PASSWORD` aus Schritt 4 der Online-Anleitung).
3. Klick auf **Anmelden**.

**Gut zu wissen**

- Du bleibst **7 Tage** angemeldet. Danach fragt das Dashboard wieder nach dem Passwort.
- **Abmelden:** links unten in der Seitenleiste (auf dem Handy ganz unten auf der Seite). Mach das an fremden Computern immer.
- **Shop ansehen ↗** (links unten) öffnet deinen Shop in einem neuen Tab.
- **Auf dem Handy** steht das Menü oben als Leiste. Wisch nach links, um alle Bereiche zu sehen.
- **Passwort vergessen?** In Vercel bei `ADMIN_PASSWORD` ein neues eintragen und **Redeploy** klicken. Danach sind alle Geräte abgemeldet.

---

## Deine tägliche Runde (5 Minuten)

1. **Übersicht** öffnen. Rechts steht **Zu erledigen**.
2. Gibt es **offene Bestellungen**? → verpacken und versenden ([so geht's](#eine-bestellung-versenden--schritt-für-schritt)).
3. Gibt es **neue Bewertungen**? → lesen und **Veröffentlichen** oder **Ablehnen**.
4. Einmal pro Woche oder Monat: **Newsletter** → **Als CSV exportieren** → in Brevo importieren.

Das war's.

---

## Übersicht

Die Startseite des Dashboards. Hier siehst du auf einen Blick, wie dein Shop läuft.

| Bereich | Was du siehst |
| --- | --- |
| **Kennzahlen** (Kacheln oben) | Umsatz heute, Umsatz der letzten 7 und 30 Tage, Anzahl Bestellungen, durchschnittlicher Bestellwert – mit Vergleich zu den 30 Tagen davor. Die Kachel **Offene Versendungen** führt direkt zu den Bestellungen. |
| **Umsatz pro Tag** | Ein Balken pro Tag (letzte 30 Tage). Fahr mit der Maus über einen Balken (Handy: antippen), dann siehst du die genauen Zahlen. Darunter: **Alle Tageswerte als Tabelle**. |
| **Bestseller · 30 Tage** | Deine meistverkauften Produkte. |
| **Zu erledigen** | Bestellungen, die noch verschickt werden müssen, neue Bewertungen und die Zahl deiner Newsletter-Abonnent:innen. Ein Klick führt direkt dorthin. |
| **Startklar-Check** | Die Punkte, die vor dem Verkaufsstart erledigt sein sollten: Stripe, Live-Modus, Datenspeicher, Shop-Adresse, Impressum, Zutatenrialangaben, Passwort. Bei jedem offenen Punkt steht **So geht's**. Oben rechts zeigt ein kleiner Ring, wie viele schon erledigt sind. |

**Hinweise oben auf der Seite**

- **Blau – „Beispieldaten“**: Stripe ist noch nicht verbunden. Die Zahlen sind erfunden, damit du siehst, wie es später aussieht. (Das gibt es nur beim Testen auf dem eigenen Computer.)
- **Gelb – „Stripe ist noch nicht verbunden“**: Es kann noch niemand bezahlen. → [ONLINE-STELLEN.md, Schritt 5](ONLINE-STELLEN.md#schritt-5--stripe-einrichten-bezahlen).
- **Rot – „Bestellungen konnten nicht vollständig geladen werden“**: Der Stripe-Schlüssel stimmt nicht. → Schlüssel in Stripe neu kopieren und in Vercel ersetzen.
- **Gelb – „Datenspeicher fehlt“** (ganz oben, auf jeder Seite): Änderungen können nicht gespeichert werden. → [ONLINE-STELLEN.md, Schritt 3](ONLINE-STELLEN.md#schritt-3--datenspeicher-verbinden).

Stornierte Bestellungen zählen in den Zahlen **nicht** mit.

---

## Bestellungen

Hier stehen alle **bezahlten** Bestellungen der **letzten 90 Tage**, die neueste oben. Sie kommen automatisch von Stripe – du musst nichts eintragen.

### Die Liste

- **Filter oben:** Alle · Offen · Versendet · Erledigt · Storniert. Die Zahl daneben zeigt, wie viele es jeweils gibt.
- **Gelber Balken „… Bestellungen warten auf den Versand“** → Klick zeigt nur die offenen.
- **Suche:** Name, E-Mail-Adresse, Ort, Sendungsnummer oder Bestellnummer (z. B. `EX-4F7K2Q`) eingeben → **Suchen**.
- Bei offenen Bestellungen, die schon länger liegen, steht in Gelb **„wartet seit … Tagen“**.
- **Ältere Bestellungen** (mehr als 90 Tage) findest du in Stripe unter **Zahlungen** (Link unter der Liste).

### Was bedeuten die Status?

| Status | Bedeutung | Wann stellst du ihn ein? |
| --- | --- | --- |
| **Offen** (gelb) | Bezahlt, wartet auf Versand. | Automatisch bei jeder neuen Bestellung. |
| **Versendet** (blau) | Paket ist unterwegs. | Sobald du das Paket abgegeben hast. |
| **Erledigt** (grün) | Angekommen, alles fertig. | Wenn du sicher bist, dass alles passt (freiwillig). |
| **Storniert** (rot) | Abgebrochen bzw. Geld zurück. | Nachdem du in Stripe erstattet hast (siehe unten). |

### Eine Bestellung versenden – Schritt für Schritt

Klick in der Liste auf die Bestellung. Bei offenen Bestellungen steht oben ein gelber Kasten **„So versendest du diese Bestellung“** – er erklärt die 3 Schritte noch einmal.

1. **Lieferschein drucken**
   - Oben rechts auf **Lieferschein** klicken.
   - Auf **Drucken** klicken. Im Druckfenster kannst du auch **Als PDF speichern** wählen.
   - Der Lieferschein (A4) zeigt Absender, Lieferadresse, Bestellnummer, alle Artikel mit Packungsgröße. **Preise stehen nicht drauf** – gut, falls das Paket ein Geschenk ist.
   - Ausdrucken und mit ins Paket legen.
2. **Paket bei DHL aufgeben**
   - Paketschein online kaufen, z. B. auf dhl.de (Link steht im gelben Kasten).
   - Rechts bei **Lieferadresse** auf **Kopieren** klicken. Jetzt kannst du die Adresse beim Paketschein einfügen (Strg + V bzw. Cmd + V).
3. **Im Dashboard als „Versendet“ speichern**
   - Unten im Bereich **Versand & Status**:
     - **Status:** auf **Versendet** klicken.
     - **Versand mit:** DHL Paket (oder DHL Express, DPD, Hermes, GLS, UPS).
     - **Sendungsnummer:** von deinem Paketschein abtippen oder einfügen. Leerzeichen sind egal.
       Ist die Nummer gültig, erscheint darunter **Sendung verfolgen ↗** – damit kannst du sie prüfen.
     - **Interne Notiz** (freiwillig): sieht nur du, nie die Kund:in. Z. B. *„Kundin hat angerufen – Lieferadresse geändert“*.
   - Auf **Speichern** klicken. Es erscheint grün: *„Gespeichert – die Bestellung ist jetzt als ‚Versendet' markiert.“*
4. **Kund:in benachrichtigen**
   - **Mit eingerichtetem E-Mail-Versand** (siehe [Online-Anleitung Schritt 8](ONLINE-STELLEN.md#schritt-8--e-mail-versand-einrichten-brevo)): Beim Status **Versendet** steht über **Speichern** ein Häkchen **„Versand-E-Mail an die Kund:in schicken“** – schon gesetzt. Einfach speichern: Die E-Mail mit Sendungsnummer und Link zur Paketverfolgung geht sofort raus. Danach steht dort „erneut schicken“, damit nichts doppelt rausgeht.
   - **Ohne E-Mail-Versand:** Nach dem Speichern erscheint ein grüner Kasten **„Letzter Schritt“** mit dem Knopf **Versand-E-Mail öffnen**. Das öffnet **dein E-Mail-Programm** mit einer fertigen Nachricht – dort auf **Senden** klicken.

> **Wichtig (ohne E-Mail-Versand):** Erst wenn du in deinem E-Mail-Programm auf **Senden** klickst, geht die Nachricht raus.
> Den Knopf **E-Mail an Kund:in** gibt es außerdem immer oben rechts auf der Bestellseite.

> **Tipp:** Passiert beim Klick auf „Versand-E-Mail öffnen“ nichts? Dann ist auf dem Gerät kein E-Mail-Programm eingerichtet (z. B. wenn du nur Webmail im Browser nutzt).
> Richte ein Standard-E-Mail-Programm ein (z. B. Outlook, Apple Mail oder die Mail-App am Handy) – oder schreib die E-Mail von Hand und kopiere die Sendungsnummer hinein.

Rechts auf der Bestellseite siehst du außerdem:

- **Kund:in** – Name, E-Mail (anklickbar), ggf. Telefon
- **Lieferadresse** – mit **Kopieren**-Knopf
- **Zahlung** – Status (z. B. *Bezahlt*), Betrag und **Zahlung in Stripe öffnen ↗**
- **Verlauf** – wann bestellt, wann versendet, wann zuletzt bearbeitet

### Etwas falsch eingetragen?

Einfach den richtigen Status bzw. die richtige Nummer eintragen und noch einmal **Speichern**. Stellst du eine Bestellung auf **Offen** zurück, wird auch das Versanddatum wieder gelöscht.

### Geld zurückzahlen (Erstattung) und stornieren

Geld zurückzahlen kannst du **nur in Stripe** – nicht im Dashboard.

1. Bestellung im Dashboard öffnen → rechts **Zahlung in Stripe öffnen ↗**.
2. In Stripe auf **Erstatten** klicken, Betrag wählen (ganz oder teilweise) → bestätigen.
3. Zurück im Dashboard: Status auf **Storniert** setzen → **Speichern**.

Das Geld ist je nach Zahlungsart nach einigen Tagen wieder bei der Kund:in. Die Stripe-Gebühr bekommst du dabei nicht zurück.

---

## Produkte

Hier legst du fest, **was im Shop zu sehen ist und was es kostet** – und legst neue Produkte an.

Jedes Produkt hat zwei Reiter:

- **Preise & Verfügbarkeit** – Preise, Streichpreise, ausverkauft, sichtbar, Bestseller, Zutaten & Nährwerte.
- **Bilder, Texte & Varianten** – Fotos, Name, Beschreibung, Kollektionen, Packungsgrößen, Löschen.

### Die Liste

- **Filter:** Alle · Im Shop · Ausgeblendet · Bestseller · Ausverkauft · Angepasst.
  **Angepasst** zeigt alle Produkte, bei denen du etwas geändert hast.
- **Suche:** z. B. „Classic“ oder „Zero“.
- Klick auf ein Produkt (oder **Bearbeiten**), um es zu ändern.

### Preis ändern

1. Produkt öffnen. Links steht **Preise & Verfügbarkeit** mit allen Varianten (Packungsgrößen).
2. Bei der Variante den neuen **Preis** eintragen, z. B. `29,90`.
3. Unten auf **Speichern** klicken. Die Leiste unten zeigt, ob noch etwas ungespeichert ist.

**Für alle Varianten auf einmal:** Oben im grauen Kasten **„Für alle … Varianten auf einmal“** bei **Preis setzen** den Preis eintragen → **Übernehmen** → unten **Speichern**.
Die Knöpfe im grauen Kasten füllen nur die Felder aus. **Gespeichert wird erst mit „Speichern“.**

- Erlaubt sind Preise von **0,50 €** bis **9.999,00 €**.
- Unter jeder Variante steht klein der **Original**-Preis. Ein **blauer Punkt** zeigt, dass du diese Variante geändert hast. Mit dem kleinen Pfeil-Symbol daneben holst du den Original-Wert zurück.
- Der neue Preis gilt nach wenigen Sekunden im Shop – **auch für Artikel, die schon im Warenkorb liegen**.

### Streichpreis (Angebot)

Der Streichpreis ist der durchgestrichene „Statt“-Preis, z. B. *59,90 € ~~statt 63,80 €~~*.

- Bei **Streichpreis** einen Wert eintragen, der **höher** ist als der Preis.
- Feld leer lassen = kein Streichpreis.
- Für alle Varianten: im grauen Kasten bei **Streichpreis setzen** → **Übernehmen** (leeres Feld → **Entfernen**).

> Achtung, rechtlich: Ein Streichpreis muss ein Preis sein, den du **wirklich vorher verlangt** hast (bei Rabatt-Aktionen gilt der niedrigste Preis der letzten 30 Tage). Erfundene Streichpreise können abgemahnt werden.

### Ausverkauft markieren

- Den Schalter **Verfügbar** bei der Variante ausschalten → **Speichern**.
- Mehrere auf einmal: **Alle ausverkauft** (für das ganze Produkt) oder bei einer Farbe **Alle ausverkauft** (nur diese Farbe).
- Im Shop ist diese Variante dann nicht mehr bestellbar. Sind alle Varianten aus, steht beim Produkt **„Ausverkauft“**.
- Wieder da? Schalter wieder einschalten bzw. **Alle verfügbar** → **Speichern**.

Das Dashboard kennt nur **verfügbar ja/nein** – es zählt keinen Lagerbestand mit.

### Produkt ausblenden

Rechts im Kasten **Sichtbarkeit**: Schalter **Im Shop anzeigen** ausschalten → **Speichern**.
Das Produkt ist dann im Shop nicht mehr zu finden – auch nicht über einen direkten Link. Einschalten bringt es zurück.

### Bestseller auf der Startseite

Rechts im Kasten **Sichtbarkeit**: Schalter **Als Bestseller auf der Startseite** einschalten → **Speichern**.
Das Produkt erscheint im Bereich „Bestseller“ auf der Startseite. Dort passen **bis zu 8** Produkte hinein – der Kasten zeigt, wie viele gerade ausgewählt sind.
In der Produktliste des Dashboards erkennst du Bestseller am gelben Etikett **★ Bestseller**.

### Zutaten & Nährwerte eintragen (Pflicht)

Beim Online-Verkauf von Lebensmitteln müssen Zutaten, Allergene und Nährwerte **vor dem Kauf** sichtbar sein (Lebensmittelinformationsverordnung). Dazu gehört auch der Koffeingehalt.

1. Produkt öffnen → Kasten **Zutaten, Nährwerte & Allergene**.
2. Angaben von der Dose abschreiben.
3. **Speichern**. Die Angaben erscheinen auf der Produktseite unter **Zutaten & Nährwerte**.

In der Produktliste zeigt ein gelbes Schild **Zutaten fehlen**, wo noch etwas offen ist.

### Alles zurücksetzen

Rechts unten im Kasten **Original-Werte**: **Zurücksetzen auf Original** → **Ja, zurücksetzen**.
Dann gelten wieder alle ursprünglichen Preise, Verfügbarkeiten und Einstellungen dieses Produkts.
**Zutaten & Nährwerte bleiben dabei erhalten** – sie sind eine Pflichtangabe.

### Neues Produkt anlegen

1. **Produkte** → oben rechts **Neues Produkt**.
2. **Produktname** und **Preis** eintragen – mehr ist nicht Pflicht.
3. **Bilder hinzufügen** anklicken (oder Fotos in das Feld ziehen). Mehrere auf einmal gehen auch.
4. Bei **Größen, Farben & Varianten** eintragen, was Kund:innen auswählen können, z. B. *Packung: 6er Pack, 12er Pack, 24er Pack*. Das Pfand (0,25 € je Dose) berechnet der Shop aus dem Namen der Variante.
5. Rechts die **Kollektion** anhaken (Energy Drinks, Zero, Mixpakete) und am besten gleich **Zutaten & Nährwerte** eintragen.
6. Unten **Produkt anlegen**. Danach landest du bei den Preisen und kannst sie je Variante noch anpassen.

> Tipp: Noch nicht fertig? Haken bei **Gleich im Shop zeigen** weg – dann bleibt das Produkt ausgeblendet, bis du es unter *Preise & Verfügbarkeit → Sichtbarkeit* einschaltest.

### Bilder ändern, hinzufügen, löschen

Produkt öffnen → Reiter **Bilder, Texte & Varianten** → Kasten **Bilder**.

- **Hinzufügen:** auf **Bilder hinzufügen** klicken oder Fotos hineinziehen. Handy-Fotos werden automatisch verkleinert, der Standort im Foto wird entfernt.
- **Reihenfolge:** mit den Pfeilen **‹ ›** oder durch Ziehen. Das **erste Bild** ist das Hauptbild auf den Produktkarten. Mit dem **Stern** machst du ein Bild sofort zum Hauptbild.
- **Löschen:** roter Mülleimer oben rechts am Bild.
- **Bildbeschreibung** (optional): ein paar Worte, was zu sehen ist – hilft Google und Menschen mit Sehbehinderung.
- Unten **Speichern**. Erst dann ändert sich der Shop.

Am schönsten wirken Fotos im **Hochformat (4:5)** vor einem ruhigen, hellen Hintergrund. Bis zu 12 Bilder pro Produkt.

### KI-Bilder kennzeichnen

Unter jedem Bild gibt es eine Auswahl: **Echtes Foto** (Standard), **KI-generiert** oder **KI-bearbeitet**. Für alle Bilder und Videos auf einen Blick gibt es den Menüpunkt **KI-Kennzeichnung** (siehe unten).

### Name, Beschreibung und Details ändern

Im gleichen Reiter: **Produktname**, **Untertitel** (kurzer Satz auf den Produktkarten) und **Beschreibung**.
In der Beschreibung gilt:

- Leerzeile = neuer Absatz
- `## ` am Zeilenanfang = Zwischenüberschrift
- `- ` am Zeilenanfang = Aufzählung
- `**Wort**` = fett

Die Knöpfe **F**, **Überschrift** und **• Liste** über dem Feld machen das für dich. Mit **Vorschau** siehst du, wie es im Shop aussieht.
Rechts unter **Details**: Stichpunkte (eine Zeile = ein Häkchen) und Dosen im Paket.

### Packungsgrößen ändern

Im Kasten **Größen, Farben & Varianten** Werte ergänzen oder entfernen, z. B. bei Packung *„, 48er Pack“* anhängen.
Darunter steht, wie viele Varianten neu dazukommen oder wegfallen. Neue Varianten bekommen erst einmal den Preis der ersten Variante – unter **Preise & Verfügbarkeit** kannst du ihn danach ändern.

### Produkt löschen

Reiter **Bilder, Texte & Varianten** → ganz unten **Produkt löschen** → **Ja, endgültig löschen**.

- Produkte aus dem **ursprünglichen Sortiment** findest du danach in der Produktliste unten unter **Gelöschte Produkte** und kannst sie dort **wiederherstellen**.
- **Selbst angelegte** Produkte sind dann wirklich weg (samt Bildern).
- Nur vorübergehend nicht verkaufen? Dann lieber **ausblenden** (siehe oben).

---

## Bewertungen

Kund:innen können auf jeder Produktseite unter **„Bewertung schreiben“** eine Bewertung abgeben.
Neue Bewertungen erscheinen **erst im Shop, wenn du sie veröffentlichst**.

### Oben siehst du

- **Warten auf Freigabe** – so viele musst du noch lesen.
- **Im Shop sichtbar** – alle Bewertungen, die Kund:innen sehen (inklusive der aus dem bisherigen Shop übernommenen).
- **Durchschnitt im Shop** – z. B. *4,8 von 5*.

### Reiter

**Neu** · **Veröffentlicht** · **Abgelehnt**

### Eine Bewertung freigeben

1. Reiter **Neu** öffnen.
2. Bewertung lesen. Du siehst Sterne, Titel, Text, Produkt, den **Namen im Shop**, die **E-Mail (privat)** und ggf. die **Bestellnummer**.
3. Entscheiden:
   - **Veröffentlichen** → erscheint sofort im Shop auf der Produktseite.
   - **Ablehnen** → bleibt unsichtbar (du findest sie unter **Abgelehnt** und kannst sie später doch noch veröffentlichen).
   - **Löschen** → endgültig weg (fragt noch einmal nach).
4. Verklickt? In der Meldung unten gibt es **Rückgängig**.

**Kauf geprüft:** Hat die Person eine Bestellnummer angegeben und du findest diese Bestellung unter **Bestellungen**, setz den Haken **„Kauf geprüft“**. Im Shop steht dann **„Verifizierter Kauf“**.
Setz den Haken **nur**, wenn du die Bestellung wirklich gefunden hast.

Eine schon veröffentlichte Bewertung nimmst du mit **Aus dem Shop nehmen** wieder heraus.

### Fair und rechtssicher

Im Shop steht: *„Wir veröffentlichen positive wie negative Bewertungen.“*
Lehne deshalb nur ab, was **beleidigend** ist, **Werbung** enthält oder **nichts mit dem Produkt zu tun** hat – nicht, weil eine Bewertung kritisch ist.

Im Shop erscheint nur der **Vorname**. E-Mail und Bestellnummer siehst nur du.

**Fest eingebaute Bewertungen:** Unter **Veröffentlicht** ganz unten stehen die Bewertungen aus dem bisherigen Shop. Sie sind immer sichtbar und können hier nicht geändert werden.

> Möchtest du bei jeder neuen Bewertung eine Nachricht bekommen? Das geht mit der Variable `REVIEW_WEBHOOK_URL` (z. B. über Zapier oder Make). Lass dir das bei Bedarf einrichten.

---

## Newsletter

Hier stehen alle, die sich im Shop für den Newsletter eingetragen haben (Startseite oder Fußzeile).

> [!IMPORTANT]
> **Der Shop sammelt die Adressen nur – er verschickt selbst keine Newsletter.**
> Werbe-E-Mails darfst du nur an Personen schicken, die ihre Anmeldung in einer **Bestätigungs-E-Mail** angeklickt haben (*Double-Opt-in*).
> Bestätigung, Versand und Abmelde-Link übernimmt ein Newsletter-Tool. Empfehlung im Dashboard: **Brevo** (Anbieter aus der EU, deutsche Oberfläche, kostenloser Einstieg).

### Oben siehst du

**Angemeldet insgesamt** · **Neu in 30 Tagen** · **Letzte Anmeldung**

### Adressen zu Brevo bringen

1. Oben rechts auf **Als CSV exportieren** klicken. Die Datei (z. B. `newsletter-2026-10-05.csv`) landet in deinem Download-Ordner. Sie lässt sich auch mit Excel öffnen.
2. In Brevo: **Kontakte → Kontakte importieren → Datei importieren** und die Datei hochladen. Die Spalte „EMAIL“ erkennt Brevo automatisch.
3. Den neuen Kontakten **zuerst die Bestätigungs-E-Mail (Double-Opt-in)** schicken. Erst wer bestätigt hat, bekommt Werbung.
4. Du kannst die Datei jedes Mal komplett importieren – doppelte Adressen erkennt Brevo selbst.

*Hinweis:* Wie genau Brevo die Bestätigungs-E-Mail verschickt, kann sich ändern – schau in der Brevo-Hilfe unter dem Stichwort **„Double-Opt-in“** nach.
Bequemer ist eine automatische Weiterleitung jeder Anmeldung an Brevo (über die Variable `NEWSLETTER_WEBHOOK_URL` und z. B. Zapier oder Make). Die lässt du dir am besten einmal einrichten.

### Suchen und löschen

- **Suche:** einen Teil der E-Mail-Adresse eingeben → **Suchen**.
- **Löschen:** Möchte jemand gelöscht werden (oder sich abmelden), lösch die Adresse **hier und in Brevo**.

Nenne Brevo außerdem in deiner Datenschutzerklärung.

---

## Einstellungen

Drei Bereiche – oben kannst du direkt hinspringen: **Firmendaten** · **Versand** · **Aktions-Hinweis**.
Was du hier speicherst, ist **nach wenigen Sekunden im ganzen Shop** zu sehen.

Unten gibt es eine **Speichern-Leiste**. Sie zeigt immer an, ob alles gespeichert ist (*„Alles gespeichert“* bzw. *„Ungespeicherte Änderungen“*).
Mit **Verwerfen** machst du ungespeicherte Änderungen rückgängig. Der Knopf **Speichern** ist nur aktiv, wenn du etwas geändert hast.

### Firmendaten (Impressum)

Diese Angaben stehen im **Impressum**, in den **AGB**, im **Widerruf** und in der **Datenschutzerklärung**.

- Felder: Firmenname, Markenname, Vertreten durch, Straße und Hausnummer, PLZ und Ort, Land, E-Mail-Adresse, Telefonnummer, USt-IdNr., Handelsregister.
- Unter jedem Feld steht eine kurze Erklärung, was hineingehört.
- Fehlt etwas Wichtiges, steht beim Feld **„fehlt noch“** und oben ein gelber Kasten **„Pflichtangaben fürs Impressum fehlen“**. Klick auf den Namen im Kasten – dann springt der Cursor direkt ins Feld.
- Rechts siehst du eine **Vorschau Impressum**. Oben rechts: **Impressum ansehen ↗**.
- **USt-IdNr.** im Format `DE123456789` (steht im Schreiben vom Bundeszentralamt für Steuern).

**Im Moment fehlen noch:** E-Mail-Adresse, Telefonnummer und USt-IdNr. Bis dahin steht im Impressum ein gelb markierter Platzhalter – ein Impressum mit Lücken kann abgemahnt werden.

### Versand

| Einstellung | Bedeutung |
| --- | --- |
| **Standardversand (DHL)** | Versandkosten pro Bestellung, inkl. MwSt. `0` = Versand immer kostenlos. Aktuell 4,95 €. |
| **Kostenloser Versand ab einem Bestellwert** | Schalter an → ab diesem Warenwert (z. B. 49,00 €) kostet der Standardversand nichts. Im Warenkorb zeigt ein Balken, wie viel noch fehlt. |
| **Express-Versand anbieten** | Schalter an → Kund:innen können an der Kasse schnelleren Versand (nächster Werktag) dazubuchen, z. B. für 12,90 €. Schalter aus → kein Express. |

- Rechts zeigt **So sieht es im Shop aus**, was Kund:innen sehen.
- **Standardwerte einsetzen** stellt alles auf 4,95 € · kostenlos ab 49 € · Express 12,90 € zurück (danach noch **Speichern**).
- Die Versandkosten gelten sofort im Warenkorb **und** an der Kasse (Stripe).
- Oben rechts: **Versandseite ansehen ↗**.

### Rücksendung bei Widerruf

Hier legst du fest, **wer die Rücksendung bezahlt**, wenn jemand vom Widerrufsrecht Gebrauch macht:

- **Kund:in zahlt** – üblich bei vielen Shops.
- **Wir zahlen** – kundenfreundlicher, kostet dich das Rücksende-Porto.

Unter jeder Wahl steht der genaue Satz, der dann in der **Widerrufsbelehrung** und auf **Seite 2 des Lieferscheins** erscheint. **Speichern** nicht vergessen.

### Aktions-Hinweis

Ein kurzer Text (bis 120 Zeichen) für die **schwarze Leiste ganz oben** auf jeder Shop-Seite.
Zum Beispiel: *„Nur bis Sonntag: 15 % auf alle Sets“* oder *„Betriebsferien: Versand ab 7. Januar“*.

- **Leer lassen** = kein Hinweis. Dann zeigt die Leiste wie bisher die Vorteile deines Shops.
- Darunter siehst du eine **Vorschau**.
- **Speichern** nicht vergessen. Zum Abschalten: Text löschen → **Speichern**.

**Rabatt-Code für eine Aktion:** Ein Code wie `SOMMER15` funktioniert an der Kasse nur, wenn du ihn **in Stripe angelegt** hast:
In Stripe → **Produktkatalog** → **Gutscheine** (englisch: *Coupons*) → neuen Gutschein anlegen (z. B. 15 %) → darin einen **Aktionscode** (*Promotion code*) mit dem Namen `SOMMER15` hinzufügen.
An der Stripe-Kasse gibt es dann ein Feld **„Aktionscode hinzufügen“**. *(Die genauen Menünamen in Stripe können leicht abweichen.)*

---

## KI-Kennzeichnung

Unter **KI-Kennzeichnung** siehst du **alle Bilder und Videos** des Shops als Kacheln – Videos, Produktfotos, Bilder der Startseite. Unter jeder Kachel stehen drei Knöpfe:

- **Echt** – echtes Foto oder Video, keine Kennzeichnung (Standard).
- **KI-generiert** – komplett mit KI erstellt → im Shop steht „KI-generierte Darstellung“ am Bild.
- **KI-bearbeitet** – echte Aufnahme, mit KI verändert → „KI-bearbeitete Darstellung“.

**Ein Klick speichert sofort**, nach wenigen Sekunden ist es im Shop zu sehen. Unten erscheint kurz eine Bestätigung. Sobald etwas als KI markiert ist, steht im Footer automatisch ein kurzer allgemeiner Hinweis.

- Oben filtern: **Alle · Videos · Fotos · Als KI markiert**.
- Unter jeder Kachel steht, **wo** das Medium im Shop vorkommt. Bei Videos spielt beim Darüberfahren eine Vorschau.
- Ein Video gilt überall gleich – auch seine Standbilder.
- Produktbilder kannst du auch im Produkt unter **Bilder, Texte & Varianten** einstellen. Beides ist dasselbe – zuletzt gespeichert gilt.

**Echte Produktfotos bitte immer auf „Echt“ lassen.**

---

## Shop mit Passwort schützen

Unter **Einstellungen → Shop mit Passwort schützen** kannst du den ganzen Shop hinter ein Passwort stellen – z. B. vor dem offiziellen Start oder für Testpersonen.

1. **Passwort für den Shop** eintragen (mind. 6 Zeichen – **nicht** dein Dashboard-Passwort, denn dieses gibst du weiter).
2. Optional einen **Text für die Passwort-Seite**, z. B. *„Wir öffnen am 1. November!“*.
3. Schalter **Passwortschutz einschalten** → **Speichern**. Nach wenigen Sekunden gilt der Schutz.

Was dann passiert:
- Besucher:innen sehen nur die Seite **„Bald geöffnet“** mit Passwort-Feld. Mit dem richtigen Passwort kommen sie hinein und bleiben 30 Tage freigeschaltet.
- **Du** siehst den Shop ganz normal, solange du im Dashboard angemeldet bist. Oben im Dashboard steht ein gelber Hinweis 🔒.
- Das Dashboard (**/admin**) ist immer erreichbar. Google & Co. sehen den Shop nicht.
- **Neues Passwort speichern** = alle müssen das neue Passwort eingeben.
- Zum Öffnen für alle: Schalter aus → **Speichern**.

---

## E-Mails

Unter **Einstellungen → E-Mails** siehst du, ob der E-Mail-Versand eingerichtet ist, und stellst ein, was der Shop verschickt:

- **Bestellbestätigung an Kund:innen** – mit Bestellübersicht, Lieferadresse und Widerrufsbelehrung.
- **Info an mich bei neuen Bestellungen** – an die Adresse für Benachrichtigungen (leer = E-Mail aus den Firmendaten).
- **Versand-E-Mail vorschlagen** – beim Status „Versendet“ ist das Häkchen schon gesetzt.
- **Test-E-Mail an mich** – zum Ausprobieren.

Immer automatisch (sobald eingerichtet): **Newsletter-Bestätigung** (Double-Opt-In) und **„Passwort vergessen“** für Kundenkonten.
Im Bereich **Newsletter** siehst du bei jeder Adresse den Status: **Bestätigt**, **Wartet** (Bestätigungs-E-Mail verschickt) oder **Ohne Bestätigung** (ältere Anmeldungen). Nur an bestätigte Adressen darfst du Newsletter schicken.

---

## Kunden (Kundenkonten – vorbereitet)

Kund:innen können sich im Shop ein Konto anlegen: Bestellungen und Lieferstatus ansehen, Lieferadresse speichern, Passwort ändern und das Konto selbst löschen.
**Bestellen ohne Konto bleibt immer möglich.**

Die Funktion ist **fertig eingebaut, aber ausgeschaltet.** Im Shop sieht man davon nichts, bis du sie einschaltest.

### Ausprobieren (solange ausgeschaltet)

1. Dashboard → **Kunden** → oben **Registrierung ansehen ↗**.
2. Ein Testkonto anlegen. Oben steht gelb **„Vorschau“** – nur du siehst den Bereich, weil du im Dashboard angemeldet bist.
3. Danach unter **Kunden** das Testkonto wieder **löschen**.

Tipp: Mit einer E-Mail-Adresse, mit der schon bestellt wurde, siehst du im Konto direkt die Bestellungen.

### Einschalten

Dashboard → **Kunden** → **Kundenkonten einschalten**. Ab dann:

- steht oben im Shop ein **Personen-Symbol** („Mein Konto“),
- erscheint in der **Datenschutzerklärung** automatisch der Abschnitt „Kundenkonto“,
- wird an der Kasse die E-Mail-Adresse angemeldeter Kund:innen vorausgefüllt, damit die Bestellung im Konto auftaucht.

Vorher bitte die Punkte unter **„Bevor du einschaltest“** ansehen:

- **SESSION_SECRET** (empfohlen): In Vercel unter *Settings → Environment Variables* eine neue Variable `SESSION_SECRET` mit einer langen Zufallszeichenfolge anlegen (z. B. 40 beliebige Buchstaben und Zahlen) → **Redeploy**. Sonst werden beim Ändern des Admin-Passworts alle Kund:innen abgemeldet.
- **Datenschutzerklärung** zusammen mit den anderen Rechtstexten prüfen lassen.

### Passwort vergessen

Mit eingerichtetem **E-Mail-Versand** geht das automatisch: Kund:innen geben ihre Adresse ein und bekommen einen Link (60 Minuten gültig, nur einmal nutzbar).
Ohne E-Mail-Versand wird gebeten, dir eine E-Mail zu schreiben. Du kannst dann:

- bei zu vielen Fehlversuchen unter **Kunden** auf **Sperre aufheben** klicken (die Sperre dauert sonst 15 Minuten), oder
- das Konto **löschen** – die Person legt es einfach neu an. Ihre Bestellungen erscheinen danach wieder, weil sie über die E-Mail-Adresse verknüpft sind.

### Sicherheit

- Passwörter werden nur verschlüsselt (als „Hash“) gespeichert – auch du kannst sie nicht lesen.
- Nach 8 falschen Passwörtern ist die Anmeldung 15 Minuten gesperrt.
- Abmelden und Passwortwechsel beenden die Anmeldung auf allen anderen Geräten.

---

## Was das Dashboard nicht macht

Damit du nichts falsch erwartest:

- **Keine Werbe-E-Mails.** Der Shop verschickt Bestellbestätigung, Versand-E-Mail, Newsletter-Bestätigung und „Passwort vergessen“ (sobald der [E-Mail-Versand](ONLINE-STELLEN.md#schritt-8--e-mail-versand-einrichten-brevo) eingerichtet ist). Den Newsletter selbst schreibst und verschickst du in Brevo.
- **Keine Rechnungen.** Der Lieferschein ist keine Rechnung. Brauchst du Rechnungen (z. B. für Geschäftskund:innen), sprich mit deiner Steuerberatung. Stripe bietet dafür eigene Funktionen.
- **Keine Erstattungen.** Geld zurück geht nur in **Stripe** ([siehe oben](#geld-zurückzahlen-erstattung-und-stornieren)).
- **Kein Lagerbestand.** Nur „verfügbar“ oder „ausverkauft“.
- **Keine Videos.** Die stehen fest im Shop – dafür Claude oder deinen Entwickler fragen.
- **Keine Rabatt-Codes.** Die legst du in Stripe an ([siehe oben](#aktions-hinweis)).
- **Keine automatischen Kunden-E-Mails** (z. B. „Passwort zurücksetzen“). Kundenkonten sind vorbereitet, siehe [Kunden](#kunden-kundenkonten--vorbereitet).
- **Rechtstexte** (AGB, Widerruf, Datenschutz) ändern sich nur über die Firmendaten automatisch. Alles andere darin steht im Code.

---

## Häufige Fragen

**Ich habe gespeichert, sehe es aber nicht im Shop.**
Ein paar Sekunden warten und die Shop-Seite neu laden (Computer: **Strg + F5**, Mac: **Cmd + Shift + R**).

**Beim Speichern kommt „Kein Datenspeicher verbunden …“.**
Online fehlt der Datenspeicher → [ONLINE-STELLEN.md, Schritt 3](ONLINE-STELLEN.md#schritt-3--datenspeicher-verbinden).

**Beim Speichern kommt „Du bist nicht mehr angemeldet …“.**
Deine Anmeldung ist abgelaufen (nach 7 Tagen oder nach einem Passwortwechsel). Seite neu laden, wieder anmelden, noch einmal speichern.

**Eine Bestellung fehlt.**
- Es erscheinen nur **bezahlte** Bestellungen.
- Nur die **letzten 90 Tage** – ältere findest du in Stripe.
- Mit einem **Testschlüssel** siehst du nur Testbestellungen, mit dem **Live-Schlüssel** nur echte.

**Da steht „Beispieldaten“ bzw. „Beispiel“.**
Das sind erfundene Bestellungen zum Üben. Es gibt sie nur beim Testen auf dem eigenen Computer, solange Stripe nicht verbunden ist. Echte Kund:innen bekommen davon nichts mit.

**Kann ich das Dashboard auf dem Handy benutzen?**
Ja. Alle Bereiche funktionieren auch auf dem Handy. Das Menü steht oben – zum Wischen.

**Kann jemand anderes ins Dashboard?**
Nur wer das Passwort kennt. Gib es nicht weiter. Wenn du glaubst, jemand kennt es: in Vercel ein neues Passwort eintragen und **Redeploy** – dann sind alle abgemeldet.
