# EXSTASE – AP1 Firmenstammdaten, Impressum, Geschäftsdokumente (Bericht für ChatGPT)

Stand 21.10.2026 · Branch `claude/project-thread-blovdv` · nicht live (kein PR, kein Merge, kein Deployment).

## Ergebnis
**Abgeschlossen (Code + Tests). Veröffentlichung BENÖTIGT FREIGABE** – Registerangaben (Geschäftsführer, HRB) sind Betreiberangaben und konnten online nicht amtlich geprüft werden (Websuche ohne Treffer; Handelsregister.de nicht automatisiert abrufbar).

## Wichtigste Erkenntnis
Live gelten die **im Dashboard gespeicherten** Firmendaten (Redis `tt:settings.company`), nicht die Standardwerte im Code. Deshalb reicht eine Code-Änderung allein nicht: Das Dashboard zeigt jetzt unter **Einstellungen → Firmendaten-Abgleich** jede Abweichung und übernimmt die Betreiberangaben erst nach Klick + Bestätigung („geprüft und gesichert“). Protokolliert im Sicherheitsprotokoll („Firmendaten übernommen“).

## Umgesetzt
| Bereich | Änderung |
|---|---|
| Zentrale Daten | `lib/company.ts`: Exstase Großhandel GmbH, Carl-Kühne-Str. 4, 47638 Straelen, Deutschland, Tel. 0211 157 759-0, Fax 0211 157 759-29, hello@exstase.com, https://exstase.com, `MANAGING_DIRECTORS = [Christopher Walich, Orhan Yilmaz]`, AG Düsseldorf HRB 90042, DE311899184. Harun Dündar kommt nirgends vor. |
| Neue Felder | `fax`, `website` (freiwillig, gelten nicht als „fehlt“), im Einstellungsformular mit Prüfung (Fax wie Telefon, Website nur `https://…`, Register muss HRA/HRB + Nummer enthalten). |
| Geschäftsführer | `managersOf()` liest die Reihenfolge aus „Vertreten durch“ (Komma/„und“/„;“, Anrede entfällt). Impressum listet sie untereinander in gespeicherter Reihenfolge. |
| Impressum (§ 5 DDG) | Name, Anschrift, Vertretungsberechtigte, Telefon, Fax, E-Mail, Website, Registergericht und Registernummer getrennt, USt-IdNr. (§ 27a UStG), Verbraucherstreitbeilegung. Layout/Design unverändert (gleiche Komponente `LegalPage`). |
| Interne Daten | Repository ist **öffentlich** → Steuernummer und Bankverbindung **nicht im Code**. Neues Feld „Steuernummer (nur intern)“ unter Händler → Rechnungsdaten (Redis), wird nirgends gedruckt. IBAN/BIC/Bank dort wie bisher. |
| Footer/Kontakt/Datenschutz/AGB/E-Mails | nutzen bereits die zentralen Einstellungen → zeigen nach Übernahme automatisch die neuen Daten. Keine Designänderung. |
| Lieferscheine | Absender wird jetzt **je Lieferschein-Version festgeschrieben** (`basis.seller`). Archivkopien drucken den damaligen Absender. Firmendaten geändert → gleiche Nummer, neue Version (alte bleibt). Ältere Lieferscheine ohne Momentaufnahme: Archivkopie druckt aktuelle Daten mit Hinweis. Fax im Briefkopf. |
| Händlerrechnungen | hatten schon eine Verkäufer-Momentaufnahme (`invoice.seller`) → ausgestellte Rechnungen ändern sich nicht; neue Rechnungen nehmen die aktuellen Daten. |
| B2C-Rechnungen | kommen (falls eingeschaltet) von **Stripe** → Firmendaten dort im Stripe-Dashboard pflegen (Einstellungen → Unternehmensdaten / Rechnungsvorlage). Nicht vom Shop steuerbar. |
| Doku | README/ONLINE-STELLEN: Firmenname „Exstase“ groß. |

## Geänderte / neue Dateien
lib/company.ts, lib/settings-defaults.ts, components/legal-page.tsx, app/impressum/page.tsx, app/admin/(panel)/einstellungen/{validate.ts, settings-form.tsx, page.tsx, company-actions.ts (neu), company-sync-card.tsx (neu)}, app/admin/(panel)/haendler/rechnungsdaten/{actions.ts, bank-form.tsx}, lib/dealer-orders.ts, lib/office/{delivery-notes.ts, documents.ts, documents-service.ts}, lib/admin-security/audit.ts, app/admin/(panel)/{page.tsx, sicherheit/page.tsx}, tests/company.test.mts (neu), tests/office-docs.test.mts.

## Tests (ausgeführt 21.10.2026)
- `npm test` (mit lokalen Test-Redis): **273 Tests, 273 bestanden, 0 fehlgeschlagen, 0 übersprungen** (+12 neu: 8 Firmendaten, 4 Lieferschein-Absender).
- `npm run typecheck`: ohne Fehler. `npm run build`: erfolgreich.
- Impressum lokal per `next start` abgerufen: zeigt die neuen Daten, Geschäftsführer in richtiger Reihenfolge.

## Freigabepflichtig / für Orhan
1. Handelsregisterauszug prüfen (Geschäftsführer, HRB 90042) – erst dann veröffentlichen.
2. Nach Deployment: Dashboard → Einstellungen → „Betreiberangaben übernehmen“ (vorher „Jetzt sichern“).
3. Steuernummer und Bankverbindung selbst unter Händler → Rechnungsdaten eintragen.
4. Stripe-Dashboard: Firmenname/Adresse/Telefon aktualisieren (für Stripe-Belege/Rechnungen).

## Rechtlich zu prüfen (keine Rechtsberatung)
- „Verantwortlich für den Inhalt“ (§ 18 Abs. 2 MStV) ist nur bei journalistisch-redaktionellen Inhalten Pflicht – heute stehen beide Geschäftsführer.
- Wirtschafts-Identifikationsnummer (§ 5 DDG Nr. 6) – falls schon zugeteilt, ergänzen.
- Hinweis zur Verbraucherstreitbeilegung: Pflichtumfang abhängig von Mitarbeiterzahl (§ 36 VSBG).
