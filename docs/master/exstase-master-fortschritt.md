# EXSTASE – Fortschritt Master-Auftrag

Branch `claude/project-thread-blovdv` (von main `e33d093`). Sicherungs-Push erlaubt, **kein PR / Merge / Deployment**.
Tests lokal: `redis-server --port 6390|6392|6393 --save "" --appendonly no --daemonize yes`, Brücken `node tests/helpers/upstash-bridge.mjs 8791 6390` (+ 8793→6392, 8794→6393), dann
`REDIS_TEST_URL=http://127.0.0.1:8791 REDIS_TEST_TOKEN=testtoken BACKUP_TEST_SOURCE_URL=http://127.0.0.1:8793 BACKUP_TEST_TARGET_URL=http://127.0.0.1:8794 npm test`.

## Aktuelles Arbeitspaket
AP5 – Phase 3F Verkaufsanalysen

## Status
| AP | Status | Tests (gesamt danach) |
|---|---|---|
| Analyse | Abgeschlossen | 261/261 |
| 1 Firmendaten | Abgeschlossen, Veröffentlichung benötigt Freigabe | 273/273, tsc ok, build ok |
| 2 Phase 3C | Abgeschlossen (war in main; Lücke Mix-Momentaufnahme geschlossen, Checkout-Teil braucht Freigabe) | 277/277, tsc ok, build ok |
| 3 Phase 3D | Abgeschlossen (E-Mail-Versand braucht Freigabe) | 295/295, tsc ok, build ok |
| 4 Phase 3E | Abgeschlossen (ohne Anhänge, ohne Versand, ohne Stripe-Erstattung) | 316/316, tsc ok, build ok |
| 5 Phase 3F | offen | – |
| 6 Stripe/Pfand | offen | – |
| 7 Phase 3G | offen | – |

## Implementiert
- AP4: Kundenservice (Fälle KS-JJJJ-NNNNN atomar, Reklamationen, Retouren ohne Lagerbuchung, Erstattungsanfragen ohne Stripe, Vorlagen ohne Versand, Kundenhistorie, Rechte, Protokoll).
- AP3: automatische Büroberichte (Zeitplan Europe/Berlin, standardmäßig aus), Berichtshistorie, Benachrichtigungen/Erinnerungen ohne Kundendaten, Cron `/api/cron/office` täglich, Leistungsmessung `scripts/perf-office.mts`.
- AP2: `lib/mix-snapshot.ts` – Mixpaket-Inhalt zum Kaufzeitpunkt aus Stripe-Metadaten `mix` lesen (Schreiben im Checkout vorbereitet, nicht aktiv).
- AP1: zentrale Firmendaten (Fax, Website, Geschäftsführer-Reihenfolge), Impressum § 5 DDG, Firmendaten-Abgleich im Dashboard (Übernahme nur per Klick), Steuernummer intern (Rechnungsdaten), Absender-Momentaufnahme auf Lieferscheinen.

## Offene Probleme
- Lieferschein-Redis-Paralleltest läuft vermutlich nur gegen Dateispeicher (AP7 prüfen).
- Stripe-Ladezeit bei sehr vielen Privatbestellungen nicht gemessen (nur geschätzt).
- Registerangaben nicht amtlich verifiziert.
- Stripe-Rechnungen nutzen die Firmendaten aus dem Stripe-Konto.

## Freigabepflichtig
- AP3: `OFFICE_REPORT_EMAILS=1` (Bericht-E-Mails); neuer Cron wird erst mit Deployment aktiv.
- AP2: Checkout schreibt `metadata.mix` (Mix-Zusammensetzung beim Kauf).
- AP1: Veröffentlichung Firmendaten/Impressum; „Betreiberangaben übernehmen“ (Redis-Änderung durch Orhan).

## Nächster Schritt
AP5: Verkaufsanalysen (Kennzahlen, Vergleiche, Produkt/Sorte/Händler/Privat/Rabatt/Influencer, Diagramme, Filter, Excel/PDF, keine erfundenen Gewinne).
