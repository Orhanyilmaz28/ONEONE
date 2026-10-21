# EXSTASE – Phase 3G: Gesamt-QS und Livecheck (für ChatGPT)

Branch `claude/project-thread-blovdv`, Arbeitspaket 7. Stand 21.10.2026. **Kein PR, kein Merge, kein Deployment.**
Alle Prüfungen lokal (Produktions-Build `next build` + `next start`, eigene lokale Redis über Upstash-REST-Brücke,
`ADMIN_DEMO=1`, kein Stripe-Schlüssel, kein E-Mail-Schlüssel). Keine produktiven Daten berührt.

## 1. Git-Stand (7.2)
| Punkt | Ergebnis |
|---|---|
| Branch | `claude/project-thread-blovdv`, Stand = `origin` (Sicherungs-Push erlaubt) |
| Basis | `main` = `e33d093` (unverändert seit Beginn) |
| Commits | 7 (AP1–AP7) |
| Umfang | 72 Dateien vor AP7, +6 715 / −64 Zeilen; AP7 ändert nur Tests, `.env.example`, Doku |
| Konflikte mit main | keine (`git merge-tree` ohne Konflikt) |
| Nicht eingecheckt | nichts (nach AP7-Commit) |
| Risiken | Büro-/Analyse-Code neu, aber getrennt vom Shop; Checkout und Stripe-Webhook **unverändert** |

## 2. Tests, Build, Sicherheit (gelaufen)
- `npm test`: **347/347** bestanden (gegen lokale Redis inkl. Sicherungs-/Wiederherstellungstests). `tsc --noEmit` ok. `next build` ok.
- **Testlücke behoben:** Der bisherige Test „Parallele Lieferscheine gegen Redis“ lief in Wahrheit gegen den Dateispeicher
  (Speicher war schon geladen). Neu: `tests/master-ap7-redis-notes.test.mts` setzt die Umgebung vor dem Import und
  prüft `storeKind() === "redis"`: 20 parallele Lieferscheine → 20 verschiedene Nummern, 6× dieselbe Bestellung → eine Nummer. Bestanden.
- `npm audit`: **0 Schwachstellen** (mit und ohne Dev-Pakete). Keine neuen Pakete im ganzen Master-Auftrag.
- Geheimnisse: Diff durchsucht (Stripe-/Webhook-Schlüssel, IBAN, Steuernummer, Tokens) → nichts. Keine `.env`-Datei im Repo.

## 3. Sicherheitsprüfung (7.5)
| Bereich | Ergebnis |
|---|---|
| Anmeldung + 2FA | Admin und Büro-Zugänge: Passwort → Pflicht-Einrichtung 2FA → Code. Im Browser durchgespielt (Admin, Büro, Lesen) |
| Rollen | Jede neue Seite mit `requireOffice(Recht)`, jede Aktion/API mit `assertOffice(Recht)`. Lesen: 4 Schreib-/Export-Versuche per POST → **403** (Export, Dokument, Analyse, Arbeitsablauf). Büro: kein Zugriff auf Admin-Bereich, Benutzer, Automatik-Einstellungen (Umleitung) |
| Ohne Anmeldung | `/admin/buero/*` → Umleitung zur Anmeldung; `POST /api/admin/buero/analyse` → 401 |
| CSRF | Server-Actions (Next prüft Herkunft) + eigene `sameOrigin`-Prüfung bei POST-Downloads |
| Rate-Limits | Berichte, Kundenservice, Analyse-Export, Automatik, Login/2FA |
| Cron | `/api/cron/office` und `/api/cron/backup` ohne `CRON_SECRET` → 401 |
| Exporte/Dokumente | `no-store`, nur an anfragende Person, Exporthistorie + Sicherheitsprotokoll; Analyse-Dateien ohne Privatkunden-Namen/Adressen/E-Mails |
| Redis | nur über `lib/store`/`lib/kv`; Nummern atomar (CAS), parallel gegen echte Redis getestet |
| Stripe-Webhook | unverändert: Signaturprüfung, 503 ohne Geheimnis, 500 → Stripe wiederholt |
| Hinweise (bestehend, kein Fehler) | Kein Content-Security-Policy-Header (X-Frame-Options, Referrer-/Permissions-Policy vorhanden). `SESSION_SECRET` sollte in Vercel gesetzt sein (sonst aus `ADMIN_PASSWORD` abgeleitet) |

## 4. Shop-Test (7.3) – im Browser, lokal
| Bereich | Ergebnis |
|---|---|
| Startseite, Produkte, Kategorien, Produktseite, Mix-Konfigurator, Händler-/Influencer-Seiten, Rechtstexte | 18 Seiten, alle 200, keine JS-Fehler |
| Warenkorb | 1 × Classic + 1 × Tropical: Zwischensumme 36,00 €, Mix-Rabatt 3 % −1,08 €, Einwegpfand 12,00 € (48 × 0,25 €), Hinweis Gratisversand ab 69 € |
| Rabattcode | Prüf-Schnittstelle meldet unbekannten Code als ungültig (`{"valid":false}`) |
| Checkout (B2C) | ohne Stripe-Schlüssel korrekt gesperrt (503 „Demo-Modus“). **Stripe-Testzahlung nicht möglich** (kein Testschlüssel lokal) |
| Kundenkonten | `/konto/*` → 404, weil Kundenkonten ausgeschaltet sind (gewollt, Schalter im Dashboard) |
| Händlerportal | Anfrage mit Nachweis → Admin-Freigabe → Aktivierungslink → Passwort → Preisliste → Bestellung `H-2026-0001` |
| Influencer | Seiten laden; Provision in Analysen nur aus dem Provisionsbuch (Tests) |
| Rechnungen, Bestätigungs-E-Mails | nicht live geprüft (kein E-Mail-/Stripe-Schlüssel) – durch bestehende Tests abgedeckt |

## 5. Büro-Test (7.4) – im Browser, lokal
Alle 20 Büro-Seiten für Admin, Büro und Lesen geladen (Status 200, keine JS-Fehler). Geprüft im Ablauf: Anmeldung + 2FA,
Rollen, Übersicht mit Filter, Excel (gültige XLSX, 5 Blätter), Lieferschein-PDF (`LS-2026-00002`), Freigabe,
„An Logistik weitergegeben“ (nur Markierung, nichts verschickt), Versandstatus mit Sendungsnummer, Exporthistorie,
Kundenservice (Fall anlegen bis Abschluss), Verkaufsanalyse inkl. Händlerstatistik und Excel.
Freigabe wird korrekt **blockiert**, wenn ein Artikel ohne Stammdaten ist (Demo-Artikel „Zero“).

## 6. End-to-End-Szenarien (7.9)
| Szenario | Ergebnis |
|---|---|
| A Privatkunde inkl. Stripe-Testzahlung | **nicht ausgeführt** – lokal kein Stripe-Testschlüssel. Warenkorb, Rabatt, Pfand ok; Checkout korrekt gesperrt. Braucht Testkauf auf Vercel (Testmodus) |
| B Händler | **bestanden**: Anfrage → Freigabe → Aktivierung → Bestellung H-2026-0001 → im Büro (Filter Händler) und in der Händlerstatistik (99,86 €, 1 Bestellung) |
| C Büro | **bestanden**: 2FA → Filter → Excel → Lieferschein → Freigabe → Logistik-Markierung → Versendet mit Sendungsnummer |
| D Kundenservice | **bestanden**: Reklamation zu Bestellung → Notiz (Status automatisch „In Bearbeitung“) → „Wartet auf Kunde“ → Fall geschlossen; Fall an der Bestellung sichtbar |
| E Geschäftsführung | **bestanden**: Analyse Jahr (Umsatz, Vergleich, Gruppen, Sorten, Händler, Rabatte) → Excel |
| F Lesezugriff | **bestanden**: Berichte, Analysen, Kundenservice, Tagesberichte, Bestellung ansehen; keine Bearbeitungsknöpfe; Schreiben/Export → 403 |

Beobachtung D: Ein Fall mit Status „Gelöst“ gilt als abgeschlossen; „Fall schließen“ erscheint dann nicht mehr (erst nach „Wiedereröffnen“). Kein Fehler, aber im Büro erklären.

## 7. Datenintegrität (7.6)
- Keine Warenwirtschaft: keine Bestände, keine Buchungen, Mengen = Bestellmengen. Retouren ohne Lagerbuchung.
- Nummern (Lieferschein, Kundenfall) atomar, lückenlos, parallel getestet (Redis).
- Ausgestellte Lieferscheine/Rechnungen sind festgeschrieben (Firmendaten-Momentaufnahme); Firmendaten-Änderung wirkt nur auf neue Dokumente.
- Neue Redis-Schlüssel nur zusätzlich: `tt:office-auto:*`, `tt:office-reports:JJJJ-MM`, `tt:office-tickets`, `tt:office-ticket:<nr>`; Steuernummer-Feld in Rechnungsdaten. Keine Migration, kein Umschreiben alter Daten. Sicherung enthält Fälle, Berichte, Automatik-Einstellungen.
- Bekannt: Stripe verteilt Mix-/Code-Rabatt auch auf das Pfand (Zahlung korrekt, Pfand-Posten auf Stripe-Beleg zu niedrig) – siehe Stripe-Pfand-Prüfung.

## 8. Leistung (7.7) – nur gemessene Werte
| Messung | Wert |
|---|---|
| Öffentliche Seiten (lokal, Produktions-Build, ohne CDN) | 130–450 ms bis „load“; Startseite erster Aufruf 3,0 s (kalt, Bilder), danach 210–450 ms |
| Büro-Seiten | 85–350 ms (Demo-Daten, 8 Bestellungen) |
| Händler-Preisliste | 347 ms |
| 10 000 Bestellungen (Skript `scripts/perf-office.mts`) | Excel 1,6 s, Tages-PDF 1,3 s, Versandliste 1,5 s, Kennzahlen 18 ms; Analysen 63 ms |
| Nicht gemessen | Stripe-Ladezeit mit echten Daten, Vercel-Kaltstart, Ladezeit über das Internet |

## 9. Recht/Geschäftsangaben (7.8) – keine Rechtsberatung
| Punkt | Stand | Offen |
|---|---|---|
| Impressum | § 5 DDG: Firma, Anschrift, GF Christopher Walich + Orhan Yilmaz, Tel/Fax/E-Mail, AG Düsseldorf HRB 90042, USt-ID DE311899184 | **Registerangaben amtlich prüfen** (Sitz Straelen, Register Düsseldorf – bitte im Handelsregister bestätigen) |
| Gespeicherte Firmendaten | Shop zeigt im Live-Betrieb die in Redis gespeicherten Daten | Nach Deployment „Betreiberangaben übernehmen“ klicken (vorher „Jetzt sichern“) |
| Datenschutz | Vercel, Upstash (Frankfurt), Stripe genannt | **Cloudflare R2 (Sicherungen, EU)** fehlt in der Datenschutzerklärung; Kundenservice-Fälle (Speicherdauer) ergänzen |
| AGB | Pfand 0,25 €, Versand 5,90 €/ab 69 €, Mix-Rabatt „auf den Warenwert (ohne Pfand und Versand)“ | Stripe-Beleg zeigt Rabatt teils auf Pfand → widerspricht dem AGB-Wortlaut auf dem Beleg (Korrektur vorbereitet) |
| Widerruf | Belehrung + Muster-Formular mit neuer Anschrift | Pfand-Erstattung bei Widerruf/Retoure festlegen |
| Preisangaben | „inkl. MwSt., zzgl. Pfand und Versand“ | USt-Satz Eiskaffee (evtl. 7 %) steuerlich prüfen |
| Versandinfos | 5,90 €, ab 69 € frei | AGB sagt „Warenwert“, Versandseite „Bestellwert“ – vereinheitlichen |

## 10. Livegang-Checkliste (7.10)
| Punkt | Stand |
|---|---|
| GitHub | Branch gesichert; PR/Merge **brauchen Freigabe** |
| Vercel | Deployment **braucht Freigabe**; Build lokal ok. Bei Google-Fonts-Fehler: Redeploy |
| Umgebungsvariablen | Keine neuen Pflichtvariablen. Optional: `OFFICE_REPORT_EMAILS=1` (Freigabe). `CHECKOUT_DEPOSIT_FIX` nicht setzen. `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_2FA_KEY` prüfen |
| Redis | nur neue Schlüssel, keine Migration; vor Deployment „Jetzt sichern“ |
| Stripe | bleibt **Testmodus**; Checkout/Webhook unverändert |
| Auth | Pflicht-2FA aktiv; Büro-Zugänge anlegen |
| Domain/HTTPS | über Vercel (nicht geändert) |
| Firmendaten/Impressum | Code fertig; nach Deployment übernehmen (Klick) |
| Benachrichtigungen | Büroberichte standardmäßig aus; E-Mails aus |
| Cron | `/api/cron/office` täglich 4 Uhr UTC – aktiv erst nach Deployment, tut nichts, solange keine Berichte geplant sind |
| Rückwärtskompatibel | ja (zusätzliche Felder/Schlüssel; alter Code ignoriert sie) |
| Rollback | Vercel „Promote“ auf vorheriges Deployment bzw. Revert des Merges; neue Redis-Schlüssel stören alten Code nicht |
| Überwachung | bestehende Sicherungs-/Fehlerüberwachung (Phase 2B) |
| Kritische offene Fehler | **keine** gefunden |

## 11. Bewertung (7.11)
**B – bereit für Veröffentlichung nach Freigaben.** Keine kritischen Fehler, alle Tests und Szenarien B–F bestanden,
Sicherheit ohne Befund. Nicht A, weil: Stripe-Testkauf (Szenario A) fehlt, Pfand-Rabatt auf Stripe-Belegen offen,
Registerangaben und Datenschutzerklärung (Cloudflare R2) noch zu klären.
