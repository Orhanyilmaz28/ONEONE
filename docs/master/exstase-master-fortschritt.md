# EXSTASE – Fortschritt Master-Auftrag

Branch `claude/project-thread-blovdv` (von main `e33d093`). Sicherungs-Push erlaubt, **kein PR / Merge / Deployment**.
Tests lokal: `redis-server --port 6390|6392|6393 --save "" --appendonly no --daemonize yes`, Brücken `node tests/helpers/upstash-bridge.mjs 8791 6390` (+ 8793→6392, 8794→6393), dann
`REDIS_TEST_URL=http://127.0.0.1:8791 REDIS_TEST_TOKEN=testtoken BACKUP_TEST_SOURCE_URL=http://127.0.0.1:8793 BACKUP_TEST_TARGET_URL=http://127.0.0.1:8794 npm test`.

## Aktuelles Arbeitspaket
AP2 – Phase 3C prüfen und Lücken schließen

## Status
| AP | Status | Tests (gesamt danach) |
|---|---|---|
| Analyse | Abgeschlossen | 261/261 |
| 1 Firmendaten | Abgeschlossen, Veröffentlichung benötigt Freigabe | 273/273, tsc ok, build ok |
| 2 Phase 3C | in Arbeit | – |
| 3 Phase 3D | offen | – |
| 4 Phase 3E | offen | – |
| 5 Phase 3F | offen | – |
| 6 Stripe/Pfand | offen | – |
| 7 Phase 3G | offen | – |

## Implementiert
- AP1: zentrale Firmendaten (Fax, Website, Geschäftsführer-Reihenfolge), Impressum § 5 DDG, Firmendaten-Abgleich im Dashboard (Übernahme nur per Klick), Steuernummer intern (Rechnungsdaten), Absender-Momentaufnahme auf Lieferscheinen.

## Offene Probleme
- Registerangaben nicht amtlich verifiziert.
- Stripe-Rechnungen nutzen die Firmendaten aus dem Stripe-Konto.

## Freigabepflichtig
- AP1: Veröffentlichung Firmendaten/Impressum; „Betreiberangaben übernehmen“ (Redis-Änderung durch Orhan).

## Nächster Schritt
AP2: Abgleich 3C-Funktionen gegen Auftrag 2.1–2.14, Lücken schließen, Bericht `exstase-phase-3c-fuer-chatgpt.md`.
