# EXSTASE – Phase 3D: Büroautomatisierung und Performance (für ChatGPT)

Branch `claude/project-thread-blovdv`, Arbeitspaket 3 des Master-Auftrags. Kein PR, kein Merge, kein Deployment.
Ergebnis: **295/295 Tests**, `tsc` ok, `next build` ok.

## Was gebaut wurde
| Anforderung | Umsetzung |
|---|---|
| Automatische Berichte (täglich/wöchentlich/monatlich, Uhrzeit, Berichtsart, Filter, Empfänger, aktiv/inaktiv) | `/admin/buero/einstellungen/berichte` · Logik `lib/office/automation.ts` (rein, testbar) · Speicher `lib/office/automation-service.ts` (`tt:office-auto:config`) |
| Standardmäßig aus | keine Zeitpläne, Zusammenfassung aus, neuer Bericht „inaktiv“ vorausgewählt |
| Europe/Berlin, Zeitumstellung | Termine über `berlinToUtc`; getestet an 29.03. und 25.10.2026 (23-/25-Stunden-Tag) |
| Berichtsarten | Tagesbericht, Kennzahlen, Versandliste, Artikel-Sammelliste (nutzen die bestehenden PDF-/Kennzahl-Funktionen) |
| Keine Doppelläufe | Termin-Schlüssel `tt:office-auto:run:<id>:<Tag>` mit NX (atomar); paralleler Aufruf getestet |
| Fehler / Wiederholung | unvollständige Daten oder Fehler → Eintrag „fehlgeschlagen/unvollständig“, Sperre gelöst, höchstens 3 Versuche je Termin; Vorfall `office_report_failed` bzw. `stripe_unreachable` an die Überwachung |
| Berichtshistorie | `/admin/buero/berichte` (`tt:office-reports:JJJJ-MM`): Zeitpunkt, Zeitraum, Status, E-Mail-Status, Kennzahlen; „PDF ansehen“ erzeugt über den geschützten Dokument-Endpunkt neu; „Erneut erstellen“/„Jetzt erstellen“ (ohne E-Mail) |
| Benachrichtigungen | neue Privat-/Händlerbestellung, Zahlung offen, Prüfbedarf, nach Freigabe geändert, Export-/Dokumentfehler, Bericht verfügbar/fehlgeschlagen – Karte in der Büro-Übersicht |
| Erinnerungen | länger offen (24 h), freigegeben aber nicht weitergegeben (24 h), weitergegeben aber nicht versendet (48 h), Lieferdaten unvollständig, fehlerhafter Export – Schwellen einstellbar |
| Nur einmal melden | `tt:office-auto:sent:<id>` (NX, 14 Tage) für die tägliche Zusammenfassung |
| Datenschutz | Hinweise, Berichte und E-Mails nur mit Bestellnummer, Kanal, Zahlen und Sorten – nie Name, Adresse oder E-Mail (getestet) |
| E-Mail | **nur mit Freigabe** `OFFICE_REPORT_EMAILS=1` in Vercel; sonst nur Ablage im Büro. Nie an Kund:innen oder Logistik |
| Cron | `/api/cron/office`, geschützt mit `CRON_SECRET`; `vercel.json` täglich `0 4 * * *` (Hobby-Tarif erlaubt nur täglich). Termine bis 36 h verspätet werden nachgeholt, ältere nicht; ein neu eingeschalteter Bericht holt keine alten Termine nach |
| Rechte | `office.automation` (einstellen) nur Administrator · `office.reports` (manuell erstellen) Admin + Büro · Lesezugriff sieht Historie und Hinweise. Rate-Limits: 30/h Einstellungen, 20/h manuelle Berichte |
| Keine Datenänderung | Berichte lesen nur; Test prüft, dass Bestellungen unverändert bleiben und kein Bürostatus angelegt wird |

Neue Dateien: `lib/office/automation.ts`, `lib/office/automation-service.ts`, `app/api/cron/office/route.ts`,
`app/admin/buero/berichte/*`, `app/admin/buero/einstellungen/berichte/*`, `tests/master-ap3.test.mts` (18 Tests),
`scripts/perf-office.mts`. Geändert: Rollen, Rate-Limits, Überwachungs-Vorfälle, Büro-Reiter „Berichte“, Büro-Übersicht, `vercel.json`.

## Performance (3.6) – gemessen
Lokal, Node 22, erfundene Bestellungen (`npx tsx scripts/perf-office.mts`), ohne Netz:

| Vorgang | 500 | 2 000 | 10 000 |
|---|---|---|---|
| Kennzahlen | 4 ms | 9 ms | 18 ms |
| Filter | <1 ms | 1 ms | 3 ms |
| Excel vollständig als XLSX-Datei | 111 ms (135 KB) | 293 ms (503 KB) | 1,6 s (2,4 MB) |
| PDF Tagesbericht | 92 ms | 288 ms | 1,3 s |
| PDF Versandliste | 85 ms | 312 ms | 1,5 s (1,4 MB) |
| PDF Sammelliste | 8 ms | 7 ms | 57 ms |
| Bürobericht-Zusammenfassung | 2 ms | 6 ms | 24 ms |
| Erinnerungen + Benachrichtigungen | 3 ms | 4 ms | 229 ms |

Bewertung: Berechnung und Dateierzeugung sind auch bei 10 000 Bestellungen deutlich unter dem 300-s-Limit.
**Engpass ist das Laden aus Stripe** (100 Sitzungen je Abfrage, inkl. Positionen): **nicht gemessen** (kein Netz zu Stripe im Test).
Schätzung: 10 000 Privatbestellungen ≈ 100 Abfragen ≈ 30–60 s; Grenze 20 000 je Zeitraum bleibt (sonst klare Meldung).
Upstash: ein Lauf liest 4 Schlüssel + Bürostatus (MGET in 100er-Blöcken) und schreibt 2–4 Schlüssel je Bericht.
Empfehlung (nicht umgesetzt, keine zweite Bestelldatenbank): Büro-Übersicht standardmäßig auf „Monat“ statt Jahr laden, wenn das Volumen > 5 000/Jahr steigt.

## Freigabepflichtig
- `OFFICE_REPORT_EMAILS=1` in Vercel (E-Mail-Versand der Berichte).
- Neuer Cron in `vercel.json` wird erst mit dem Merge/Deployment aktiv (ohne aktive Zeitpläne passiert nichts).

## Offen / Grenzen
- Nur ein Cron-Lauf pro Tag (Hobby). Berichte mit Uhrzeit nach 05/06 Uhr entstehen am Folgetag; für stündlich wäre Vercel Pro nötig.
- Berichte werden nicht als Datei gespeichert, sondern bei „PDF ansehen“ aus den aktuellen Daten neu erzeugt (Zeitraum bleibt gleich).
