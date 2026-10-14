# Prüfbericht EXSTASE-Shop

Stand: 14.10.2026 · Nur gelesen und geprüft – **nichts geändert, nichts deployt, keine produktiven Daten angefasst.**
Dieser Bericht liegt nur lokal in `docs/` und ist noch **nicht** committet (ein Push auf `main` würde bei Vercel automatisch ein Deployment auslösen).

Leitregel: **Funktion verbessern, Design erhalten.** Alle Punkte unten sind technisch/inhaltlich; keiner verlangt eine Designänderung.

Bewertung: 🔴 sofort · 🟠 vor Livegang · 🟡 bald · 🟢 optional

---

## 1. Sicherheit und Datenschutz

| # | Fund | Wo | Bewertung |
|---|---|---|---|
| S1 | **Next.js 16.2.10 hat bekannte Sicherheitslücken** (laut `npm audit`: 1 kritisch, u. a. Umgehung der Proxy-Schutzfunktion, Cache-Vergiftung, Probleme in Server Actions und Bildoptimierung). Behoben ab **16.4.0**, laut npm **kein Major-Sprung**. Dazu `postcss` (hoch, kommt über Next) und `sharp` (hoch, nur beim Erzeugen eigener Bilder im Build/Skript). | `package.json` | 🔴 |
| S2 | **Kein Schutz gegen Passwort-Raten am Admin-Login.** Nur ein Passwort aus `ADMIN_PASSWORD`, keine Sperre nach Fehlversuchen. (Händler- und Kundenlogin haben eine Sperre nach 8 Versuchen.) Abhilfe ohne Code: Vercel Firewall → Rate-Limit-Regel auf `/admin/login`. | `lib/admin-auth.ts`, `app/admin/actions.ts` | 🟠 |
| S3 | **Öffentliche Formulare ohne echte Spam-Bremse**: Newsletter und Händler-Registrierung haben nur ein verstecktes Feld. Die Registrierung nimmt Dateien bis 5 MB an → Speicher (Upstash) könnte vollgemüllt werden. Vorschlag: Rate-Limit je IP (Vercel Firewall) und/oder Cloudflare Turnstile; Obergrenze für offene Anfragen. | `app/api/haendler`, `app/api/newsletter` | 🟠 |
| S4 | **Gewerbenachweise sind personenbezogene Daten.** Sie liegen als Base64 im Datenspeicher. Beim **Ablehnen** wird die Datei nicht gelöscht (nur beim „Löschen“). Es fehlt eine Aufbewahrungsfrist. Vorschlag: Nachweis automatisch löschen, wenn abgelehnt; Frist festlegen; in der Datenschutzerklärung nennen. | `lib/dealer-store.ts`, `app/datenschutz` | 🟠 |
| S5 | **Datenschutzerklärung nennt Händler-Registrierung/Händlerbereich nicht**, ebenso nicht Upstash als Auftragsverarbeiter und Brevo. AVV mit Upstash, Brevo, Stripe, Vercel prüfen. Texte sind laut Hinweis nur Vorlage → Rechtsprüfung. | `app/datenschutz/page.tsx` | 🟠 |
| S6 | **Keine Content-Security-Policy, kein HSTS im Code.** HSTS liefert Vercel auf Custom-Domains selbst. Eine CSP würde ich zuerst nur als „Report-Only“ einführen, damit nichts bricht (Stripe, Bilder, Video). | `next.config.ts` | 🟡 |
| S7 | **Positiv:** Preise werden im Checkout nur serverseitig aus dem Katalog gelesen; Stripe-Webhook prüft die Signatur; Cookies sind `httpOnly`, `sameSite=lax`, in Produktion `secure`; Passwörter mit scrypt; Admin-/Händler-Downloads (Nachweis, Pässe) prüfen die Anmeldung selbst; Paletten sind serverseitig vom Kauf ausgeschlossen. | – | ✅ |
| S8 | `SESSION_SECRET` ist optional. Ohne ihn hängen Händler-/Kunden-Sitzungen am `ADMIN_PASSWORD` (Passwortwechsel meldet alle ab). Empfehlung: eigenen Wert setzen. | `lib/*-auth.ts` | 🟡 |

## 2. Fehler

| # | Fund | Wo | Bewertung |
|---|---|---|---|
| F1 | **Canonical-URL ist auf jeder Seite die Startseite.** `app/layout.tsx` setzt `alternates.canonical = "/"`, nur Produktseiten und `/haendler` überschreiben das. Alle übrigen Seiten (Kollektionen, `/products`, `/kontakt`, `/palette`, AGB …) melden Google „kanonisch ist die Startseite“ → Indexierungsproblem. | `app/layout.tsx:30` | 🔴 (SEO) |
| F2 | **`SITE_URL` fällt auf `http://localhost:3000` zurück**, wenn `NEXT_PUBLIC_SITE_URL` fehlt. Dann zeigen Sitemap, Canonical, Stripe-Rückkehr-URLs und E-Mail-Links auf localhost. Die Variable wird beim **Build** eingesetzt (Änderung = neues Deployment). | `lib/format.ts:12` | 🟠 |
| F3 | **Alte Domain `exstase-energy.de` steckt im Code**: `lib/company.ts` (`domain`) → erscheint im Impressum („EXSTASE Energy (exstase-energy.de) ist eine Marke …“), Lieferschein, Rechtstexte; außerdem Kommentare/Hinweise im Admin (`einstellungen`, Startseite des Dashboards) und im Stripe-Webhook-Kommentar. Falsche Angabe im **Impressum** – rechtlich relevant. | `lib/company.ts:8`, `app/impressum`, `components/legal-page.tsx` | 🟠 |
| F4 | `next.config.ts` prüft keine Umgebungsvariablen beim Start. Fehlende Pflicht-Variablen fallen erst zur Laufzeit auf (gelbe Hinweise im Dashboard). Vorschlag: Start-Check, der im Build **warnt**. | – | 🟡 |
| F5 | Erledigt: Kaufleiste „Größe wählen“ bei nur einer Variante; Preis-Überlauf in Produktkarten auf dem Handy (bereits behoben und deployt). | – | ✅ |

## 3. Zahlungen und Bestellabwicklung

| # | Fund | Bewertung |
|---|---|---|
| Z1 | **Stripe ist noch im Demo-Modus** (kein `STRIPE_SECRET_KEY`). Vor Livegang: Testmodus-Durchlauf mit allen Zahlarten, Webhook einrichten, dann Live-Schlüssel. | 🔴 vor Verkauf |
| Z2 | **MwSt.-Ausweis / Rechnung klären:** Der Checkout nutzt feste Brutto-Preise (`tax_behavior: inclusive`) **ohne Stripe Tax**. Stripe berechnet dadurch keine Steuerzeilen; die Bestätigungs-E-Mail nennt nur „Gesamt (inkl. MwSt.)“. Für B2C-Rechnungen sind **ausgewiesener MwSt.-Betrag, Steuersatz, USt-IdNr.** nötig. Es gibt keine Rechnungserzeugung. → mit Steuerberatung klären (Stripe Tax oder eigene Rechnung). | 🟠 |
| Z3 | **Lieferländer:** DE, AT, NL, BE, LU, FR, IT, DK. Bei Auslandslieferung an Verbraucher gelten ggf. andere MwSt.-Sätze (OSS-Verfahren) und andere Pfandsysteme. Die Pfandpflicht gilt für Deutschland; ob Auslandsversand mit deutschem Pfand sinnvoll/zulässig ist, muss geprüft werden. Vorschlag: vorerst nur DE. | 🟠 |
| Z4 | **Pfand** wird als eigene Position `0,25 € × Stück` berechnet, getrennt ausgewiesen, nicht in der Versandkosten-Grenze – technisch korrekt und konsistent (Dose/Flasche). Steuerliche Behandlung des Pfands (durchlaufender Posten) mit Steuerberatung bestätigen. | 🟡 |
| Z5 | Webhook-Pfad im Code-Kommentar nennt noch die alte Domain. Endpoint-URL in Stripe muss zur aktiven Domain passen (siehe Domain-Plan). | 🟡 |
| Z6 | Händler-Paletten laufen bewusst **nicht** über den Checkout (nur Anfrage). Händler-Bestellung mit Rechnung ist noch nicht gebaut. | – |

## 4. Produkt-, Steuer- und Pfandangaben

- Shop-Preise: Energy, Coffee, Tea 18,00 € je 24er Tray (0,75 € je Dose); Wasser 6,60 € je 12er Tray (0,55 € je Flasche) – **alle auf Basis Ihrer Angaben**, bitte final bestätigen. Preise stehen in `data/products.json` und lassen sich im Dashboard überschreiben.
- Alle Produktseiten: **Grundpreis je Dose/Flasche** und Pfandhinweis sind vorhanden. Pflichtangabe **Grundpreis pro Liter** (PAngV, z. B. 0,75 € / 0,25 l = 3,00 €/l) fehlt – nur Preis je Dose. 🟠 **Vorschlag, Design bleibt gleich:** Zeile ergänzen.
- **Zutaten, Nährwerte, Allergene (LMIV):** Aus den Artikelpässen übernommen (Reiter „Zutaten & Nährwerte“) für Classic, Tropical, Kiwi & Lemon, Watermelon, White Peach, Ice Bonbon, Lime, Blueberry Coconut, Ice Coffee Latte und Cappuccino sowie die drei Aqua-x-Wasser. 🟠 Offen: Dragonfruit Lychee, Cactus, X-Tea (keine Pässe) und Ice Coffee Caramel, Espresso, Vanille (Pässe ohne Zutatenblock; Caramel und Vanille tragen beide Art.-Nr. D31102).
- Koffeinhinweis ist vorhanden. Nicht geprüft: Altersempfehlung/Kennzeichnung für Energy Drinks laut Etikett.
- Bei Wasser steht in manchen Texten noch „Dose“ – größtenteils bereits auf „Dose/Flasche“ umgestellt.
- Blueberry Coconut ist auf 250 ml korrigiert (laut neuem Foto und Artikelpass).
- Es fehlen Artikelpässe für Lime, X-Tea (3), Aqua x (3), Gesamtkatalog. Produkte aus dem Sammel-PDF ohne Shop-Eintrag: Classic 500 ml, Cola, Apple.

## 5. Brevo und E-Mail

- Versandcode für Brevo und Resend ist vorhanden; ohne `BREVO_API_KEY`/`MAIL_FROM` werden **keine** E-Mails verschickt (Bestellbestätigung, Newsletter-Bestätigung, Händler-Zugangslink). Newsletter läuft dann ohne Double-Opt-In.
- Absender laut Beispiel `hello@exstase.com`. **`exstase.com` ist die Domain der Marken-Website** – für Brevo muss die Absenderdomain per DNS (SPF, DKIM, DMARC) verifiziert sein; das geht nur, wenn Sie dort DNS-Zugriff haben. **Empfehlung:** Absender auf der künftigen Shop-Domain, z. B. `shop@exstaseshop.com`, sobald diese Ihnen gehört und die DNS-Einträge gesetzt sind.
- E-Mail-Automatisierung heute: Bestellbestätigung (Kunde + Shop), Versandmail, Newsletter-Bestätigung, Passwort-Reset (Kundenkonten), Händler-Freischaltung. **Fehlt:** Abbruch-Erinnerung, Willkommensserie, Bewertungsanfrage, Händler-Newsletter (siehe Vorschläge).
- Alle E-Mail-Links basieren auf `SITE_URL` → folgen automatisch der konfigurierten Domain (nach Umstellung neu bauen).

## 6. Domain-Umstellung auf exstaseshop.com (Vorbereitung – **nichts davon ist aktiv**)

Ist-Zustand: Eine zentrale Variable `NEXT_PUBLIC_SITE_URL` steuert Canonical (Produktseiten), Sitemap, robots.txt, Open Graph (`metadataBase`), JSON-LD (Organisation, Website, Produkt), E-Mail-Links, Stripe `success_url`/`cancel_url`, AGB-Link im Checkout, Aktivierungslinks. **Das ist die richtige Grundlage.** Cookies setzen **kein** `Domain`-Attribut (host-bezogen) → keine Altlasten, aber nach dem Wechsel müssen sich alle erneut anmelden.

Empfohlene Maßnahmen (erst nach Freigabe):

1. **Code (klein, ohne Designänderung):** (a) Canonical aus dem Layout entfernen/dynamisch je Seite (F1); (b) Fallback für `SITE_URL` auf `VERCEL_PROJECT_PRODUCTION_URL` statt localhost (F2); (c) `company.domain` aus der gleichen Variable ableiten (F3); (d) Admin-Hinweistexte auf die neue Domain; (e) Vorschau-Deployments (`*.vercel.app` außer der Produktionsadresse) mit `noindex`.
2. **Umschalt-Schalter, standardmäßig AUS:** Umgebungsvariable (z. B. `REDIRECT_TO_PRIMARY=1`), die im `proxy.ts` Anfragen von `exstaseshop.vercel.app` per **301** auf `exstaseshop.com` leitet. Bis Sie sie setzen, passiert nichts.
3. **Reihenfolge am Umstellungstag** (Checkliste):
   1. Domain bei Vercel hinzufügen, DNS setzen, Zertifikat abwarten, **beide** Adressen parallel erreichbar lassen.
   2. Alles auf der neuen Domain testen (Startseite, Produkte, Kasse im Stripe-Testmodus, Händlerlogin, E-Mails).
   3. `NEXT_PUBLIC_SITE_URL=https://exstaseshop.com` setzen → neu bauen.
   4. **Stripe:** zweiten Webhook-Endpunkt auf der neuen Domain anlegen (alten erst nach Test löschen); Redirect-URLs kommen aus dem Code.
   5. **Brevo:** Absenderdomain mit SPF/DKIM/DMARC verifizieren, `MAIL_FROM` ändern.
   6. **Redirect-Schalter** aktivieren (301 von der Vercel-Adresse auf die Hauptdomain) – erst jetzt.
   7. **Google Search Console:** Domain-Property `exstaseshop.com` (DNS-Verifizierung) anlegen, Sitemap einreichen, URL-Prüfung der Startseite. Die Vercel-Adresse bleibt als eigene Property zur Beobachtung der Weiterleitung. (Adressänderung-Tool von Google ist für `vercel.app` nicht nötig/nutzbar – 301 genügt.)
   8. Impressum/Datenschutz/AGB, Händlerlinks, Social-Profile, Stripe-Branding auf die neue Domain prüfen.
4. **Doppelte Indexierung vermeiden:** saubere Canonical-URLs (F1), 301 nach Umstellung, Sitemap nur mit der Hauptdomain, `noindex` für Vorschau-URLs.
5. Händler- und Kundenzugänge: Zugangs-Links, die vor der Umstellung verschickt wurden, zeigen auf die alte Adresse – nach 301 funktionieren sie weiter (Weiterleitung inkl. Query-String prüfen).

## 7. Geschwindigkeit (ohne Designänderung)

- Bilder laufen über `next/image` (AVIF/WebP). Produktfotos als WebP 60–100 KB – gut.
- Startseite lädt ein Hero-Video (ca. 400 KB, mp4, `autoplay`). Vorschlag: nur auf größeren Bildschirmen/ohne Datensparmodus laden; Poster bleibt.
- `public/dosen-foto` umfasst ca. 6–7 MB; viele Mix-Bilder sind Kopien gleicher Sorten-Kombinationen → Duplikate zusammenfassen (nur Aufräumen, kein Design).
- `data/artikelpaesse` (ca. 6 MB) wird nur in die Download-Route gebündelt – ok.
- Vorschlag: Vercel **Speed Insights** (unsichtbar) einschalten und echte Messwerte abwarten, bevor optimiert wird.

## 8. Dashboard und Händlerfunktionen

- Admin: Händler-Anfragen (Suche, Status, Gewerbenachweis ansehen), Basispreise, Stufen (Basic/Silver/Gold/Platin, Prozente frei), individuelle Preise je Händler, Artikelpässe. Funktioniert lokal Ende-zu-Ende; **bei Vercel erst mit verbundenem Upstash-Speicher**.
- Händlerbereich: eigene Oberfläche, Preisliste nur Einzelartikel (1 Tray / ab 2 Trays / Palette), Stufenplakette, Artikelpässe.
- Lücken: kein „Passwort vergessen“ im Händlerbereich (Zugangslink muss neu erzeugt werden); keine Händler-Bestellung; Nachweis-Aufbewahrung (S4); Aqua-Palette: Trays je Palette unbekannt (geschätzt, im Händlerbereich nur Palettenpreis).

## 9. Tests und Monitoring

- **Es gibt keine automatisierten Tests, kein CI, kein Monitoring.** Nur `tsc`/Build werden von Hand ausgeführt.
- Vorschlag (alles ohne Designwirkung): (1) kleine Unit-Tests für Preislogik (Stufen/Individuell, Pfand, Mix-Rabatt, Checkout-Summen); (2) Browser-Rauchtest (Startseite, Produkt, Warenkorb, Checkout-Start, Händler-Login) mit Playwright; (3) GitHub Action: `typecheck` + Build + Tests bei jedem Push; (4) Monitoring: Vercel Analytics/Speed Insights, ein Uptime-Check auf `/` und `/api/...`, Fehler-Alarme (z. B. Sentry); (5) Alarm bei fehlgeschlagenen Stripe-Webhooks.

## 10. Conversion (ohne Designänderung, nur Vorschläge)

- Versandkosten/Lieferzeit früher sichtbar machen (Text im Warenkorb existiert).
- Gäste-Checkout bleibt; Kundenkonten sind abschaltbar und aktuell aus.
- Abbruch-E-Mail (Brevo), Bewertungsanfrage nach Lieferung, Nachbestellen-Hinweis.
- Strukturierte Daten: Produkt-Angebote enthalten Preis/Verfügbarkeit; Grundpreis fehlt (siehe Abschnitt 4).
- Keine neuen Animationen/Effekte.

## 11. Design – nur Hinweise, **keine** Änderung ausgeführt

Dokumentiert, zur Freigabe:
- Das Hero-Video startet auch auf Mobilgeräten automatisch (Datenvolumen, Barrierefreiheit): optional Pause-Schaltfläche (WCAG 2.2.2). Wird bei „Bewegung reduzieren“ bereits ausgeblendet.
- Hero-Slider wechselt automatisch alle ~5 s und pausiert bei Hover/Fokus, hat aber keinen sichtbaren Pause-Knopf (WCAG).
- Hilfe-Knopf wurde auf Handys bei Produktseiten ausgeblendet (bereits live), weil er den Kaufknopf überdeckte – Bedienbarkeitskorrektur.
- Frühere Eingriffe in dieser Sitzung (Dunkel-Theme, Hero, Händlerbereich) sind live; weitere Designänderungen erfolgen nur nach Ihrer Freigabe.

---

## Empfohlene Reihenfolge (bei Freigabe)

1. 🔴 **Next.js auf 16.4.0** aktualisieren (Patch-Update, Build + Rauchtest prüfen) – kein Designeffekt.
2. 🔴 **Canonical-Fehler** beheben, `SITE_URL`-Fallback, Domain aus der Konfiguration (Impressum!).
3. 🟠 Stripe-Testmodus, Webhook, MwSt./Rechnung klären, Lieferländer festlegen.
4. 🟠 Upstash verbinden, Brevo/Absenderdomain, Datenschutz ergänzen, Nachweis-Löschung.
5. 🟠 Grundpreis pro Liter und Zutaten/Nährwerte auf Produktseiten.
6. 🟡 Tests, CI, Monitoring, Rate-Limits/Turnstile.
7. 🟡 Domain-Umstellung nach Checkliste (Abschnitt 6) – erst nach Test, mit Redirect-Schalter.

**Nichts davon wurde umgesetzt.** Bitte geben Sie an, welche Punkte ich umsetzen soll; ein Deployment erfolgt erst nach Ihrer ausdrücklichen Freigabe.
