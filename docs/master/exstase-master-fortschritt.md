# EXSTASE – Fortschritt Master-Auftrag

Branch `claude/project-thread-blovdv` (von main `e33d093`). Sicherungs-Push erlaubt, **kein PR / Merge / Deployment**.
Tests lokal: `redis-server --port 6390|6392|6393 --save "" --appendonly no --daemonize yes`, Brücken `node tests/helpers/upstash-bridge.mjs 8791 6390` (+ 8793→6392, 8794→6393), dann
`REDIS_TEST_URL=http://127.0.0.1:8791 REDIS_TEST_TOKEN=testtoken BACKUP_TEST_SOURCE_URL=http://127.0.0.1:8793 BACKUP_TEST_TARGET_URL=http://127.0.0.1:8794 npm test`.

## Aktuelles Arbeitspaket
Alle Arbeitspakete abgeschlossen. **STOPP – Warte auf Orhans Freigabe für die Veröffentlichung.**

## Status
| AP | Status | Tests (gesamt danach) |
|---|---|---|
| Analyse | Abgeschlossen | 261/261 |
| 1 Firmendaten | Abgeschlossen, Veröffentlichung benötigt Freigabe | 273/273, tsc ok, build ok |
| 2 Phase 3C | Abgeschlossen (war in main; Lücke Mix-Momentaufnahme geschlossen, Checkout-Teil braucht Freigabe) | 277/277, tsc ok, build ok |
| 3 Phase 3D | Abgeschlossen (E-Mail-Versand braucht Freigabe) | 295/295, tsc ok, build ok |
| 4 Phase 3E | Abgeschlossen (ohne Anhänge, ohne Versand, ohne Stripe-Erstattung) | 316/316, tsc ok, build ok |
| 5 Phase 3F | Abgeschlossen (ohne Gewinn – keine Einkaufspreise) | 334/334, tsc ok, build ok |
| 6 Stripe/Pfand | Abgeschlossen (Korrektur vorbereitet, aus; Checkout unverändert) | 347/347, tsc ok, build ok |
| 7 Phase 3G | Abgeschlossen (Bewertung B; Szenario A ohne Stripe-Schlüssel nicht möglich) | 347/347, tsc ok, build ok, npm audit 0 |

## Implementiert
- AP7: Gesamt-QS (Git, Sicherheit, Browser-Durchlauf Shop + Büro mit 3 Rollen, Szenarien B–F), Redis-Lieferscheintest echt gegen Redis (`tests/master-ap7-redis-notes.test.mts`), `.env.example` ergänzt, Livecheck- und Abschlussbericht.
- AP6: Prüfung Stripe/Pfand: Ursache = Gutschein ohne applies_to; Zahlung und Büro-Export korrekt, Pfand-Posten auf Stripe-Rechnung rabattiert; Korrektur `lib/checkout-deposit-fix.ts` (aus).
- AP5: Verkaufsanalysen (Kennzahlen, Zeitvergleiche, Produkte/Gruppen/Sorten, Händler, Privatkunden, Codes/Provisionen aus Provisionsbuch, SVG-Diagramme, Filter, Excel/PDF-Export mit Rechten und Protokoll).
- AP4: Kundenservice (Fälle KS-JJJJ-NNNNN atomar, Reklamationen, Retouren ohne Lagerbuchung, Erstattungsanfragen ohne Stripe, Vorlagen ohne Versand, Kundenhistorie, Rechte, Protokoll).
- AP3: automatische Büroberichte (Zeitplan Europe/Berlin, standardmäßig aus), Berichtshistorie, Benachrichtigungen/Erinnerungen ohne Kundendaten, Cron `/api/cron/office` täglich, Leistungsmessung `scripts/perf-office.mts`.
- AP2: `lib/mix-snapshot.ts` – Mixpaket-Inhalt zum Kaufzeitpunkt aus Stripe-Metadaten `mix` lesen (Schreiben im Checkout vorbereitet, nicht aktiv).
- AP1: zentrale Firmendaten (Fax, Website, Geschäftsführer-Reihenfolge), Impressum § 5 DDG, Firmendaten-Abgleich im Dashboard (Übernahme nur per Klick), Steuernummer intern (Rechnungsdaten), Absender-Momentaufnahme auf Lieferscheinen.

## Offene Probleme
- Datenschutzerklärung: Cloudflare R2 (Sicherungen) fehlt.
- Versandfrei-Grenze „Warenwert“ (AGB) vs. „Bestellwert“ (Versandseite).
- Stripe-Testkauf (Szenario A) noch nicht gemacht.
- Stripe-Ladezeit bei sehr vielen Privatbestellungen nicht gemessen (nur geschätzt).
- Registerangaben nicht amtlich verifiziert.
- Stripe-Rechnungen nutzen die Firmendaten aus dem Stripe-Konto.

## Freigabepflichtig
- AP7: PR, Merge, Vercel-Deployment (vorher „Jetzt sichern“). Vollständige Liste: `EXSTASE-MASTER-ABSCHLUSSBERICHT.md`.
- AP6: Stripe-Testkauf zur Bestätigung; Checkout-Korrektur (A oder B); rechtliche Prüfung Pfand/USt-Satz Eiskaffee.
- AP3: `OFFICE_REPORT_EMAILS=1` (Bericht-E-Mails); neuer Cron wird erst mit Deployment aktiv.
- AP2: Checkout schreibt `metadata.mix` (Mix-Zusammensetzung beim Kauf).
- AP1: Veröffentlichung Firmendaten/Impressum; „Betreiberangaben übernehmen“ (Redis-Änderung durch Orhan).

## Nächster Schritt
Warten auf Orhans Freigabe. Danach: PR erstellen, nach grünen Prüfungen mergen, Deployment, „Betreiberangaben übernehmen“.
