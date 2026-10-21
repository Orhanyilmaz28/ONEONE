# EXSTASE – Phase 3F: Verkaufsanalysen (für ChatGPT)

Branch `claude/project-thread-blovdv`, Arbeitspaket 5. Kein PR, kein Merge, kein Deployment.
Ergebnis: **334/334 Tests**, `tsc` ok, `next build` ok.

## Was gebaut wurde
| Anforderung | Umsetzung |
|---|---|
| Menüpunkt | Büroverwaltung → „Verkaufsanalysen“ (`/admin/buero/analysen`) |
| Umsatzübersicht | Umsatz brutto/netto, USt (brutto − netto), Pfand, Versand, Rabatte, Erstattungen, Stornierungen, Bestellanzahl, Ø Bestellwert. Heute/Woche/Monat/Jahr über die Zeitraumwahl |
| Bestehende Logik | `countsAsRevenue`, `revenueGross/Net` aus `kpis.ts` – Test bestätigt: gleiche Zahlen wie die Büro-Übersicht |
| B2C vs. B2B | Privat = bezahlte Stripe-Bestellungen (Zahlungseingänge); Händler = Rechnungsaufträge ab Bestellung; Anteil als geteilter Balken; noch nicht umsatzwirksame (unbezahlte) separat genannt |
| Zeitvergleiche | automatisch: Tag ↔ Vortag, Woche ↔ Vorwoche, Monat ↔ Vormonat, Jahr ↔ Vorjahr, eigener Zeitraum ↔ gleich langer Zeitraum davor. Absolut + Prozent; **„keine Basis“ statt Prozent, wenn der Vorzeitraum 0 ist** |
| Produkte / Gruppen | Energy, Ice Coffee, X-Tea, Wasser, Mixpakete, Sonstige: Bestellmenge (Einheiten), Bestellanzahl, Umsatz (Position nach Rabatt, anteilig nach Erstattung, ohne Pfand/Versand), Ø je Bestellung, Anteil |
| Sorten | Rangliste nach Menge (Dosen/Flaschen), Bestellanzahl, Umsatz (nur Einzelprodukte). **Mixpakete nur mit gespeicherter Zusammensetzung zum Kaufzeitpunkt**, sonst als „ohne gesicherte Zuordnung“ ausgewiesen |
| Händler | Umsatz, Bestellungen, Ø Bestellwert, letzte Bestellung, häufigste Produkte/Sorten, wiederkehrend (2+), freigegebene Händler ohne Bestellung seit 60 Tagen (aus der gesamten Händler-Bestellliste) |
| Privatkunden | Kunden (Konto, sonst E-Mail), neu/wiederkehrend **bezogen auf den Vergleichszeitraum**, 2+ Bestellungen, Bestellungen je Kunde, Ø Bestellwert, Umsatz, nicht zuordenbare Bestellungen |
| Rabattcodes / Influencer | Code (Stripe-Metadaten `ref`), Creator, Verwendungen, Bestellnummern, Umsatz, Rabatt, **Provision nur aus dem Provisionsbuch** (je Bestellung einmal, stornierte nicht – keine doppelte Erfassung). Ohne Code: Mix-Rabatt oder Aktionscode (nicht unterscheidbar). Händlerrabatt getrennt |
| Gewinn | **nicht berechnet** – keine Einkaufspreise/Kosten im System; Hinweis auf Seite und in Exporten |
| Diagramme | Umsatzentwicklung (gestapelt Privat/Händler), Bestellentwicklung, Produktgruppen, meistbestellte Sorten, Top-Händler, B2B/B2C-Anteil, Rabattentwicklung. Reines SVG/HTML, keine neue Bibliothek; Farben auf der dunklen Dashboard-Fläche geprüft (Kontrast ≥ 3:1, farbenblind unterscheidbar); Legende, Tooltip je Balken, Tabellenansicht |
| Filter | Tag/Woche/Monat/Jahr/eigener Zeitraum, B2B/B2C, Produkt, Sorte, Gruppe, Zahlungsstatus, Bestellstatus (bestehende Filterlogik) + Rabattcode (alle/mit/ohne/bestimmter Code) |
| Excel/PDF | `/api/admin/buero/analyse` (POST): 9 Excel-Blätter bzw. PDF mit Kennzahlen, Vergleich, Gruppen, Produkten, Sorten, Händlern, Codes. Recht `office.analytics.export` (Admin + Büro), gleiche Herkunft, Rate-Limit 60/h, **Export gesperrt bei unvollständigen Daten**, Eintrag in Exporthistorie + Sicherheitsprotokoll, `no-store`. Keine Privatkunden-Namen/Adressen/E-Mails in den Dateien |
| Rechte | Ansehen: alle Büro-Rollen (`office.analytics`); Export: Admin + Büro |

Neue Dateien: `lib/office/analytics.ts` (rein), `lib/office/analytics-service.ts`, `lib/office/analytics-export.ts`,
`app/admin/buero/analysen/{page,charts}.tsx`, `app/api/admin/buero/analyse/route.ts`, `tests/master-ap5.test.mts` (18 Tests).
Geändert: `lib/office/model.ts` (liest zusätzlich `ref`, `refId`, `customerId`, Händler-ID – nur lesend), Exporthistorie-Art „Verkaufsanalyse“, Büro-Reiter, Rollen-Tabelle.

## Leistung (gemessen, lokal)
Berechnung aller Analysen für 10 000 erfundene Bestellungen: **63 ms**. Engpass bleibt das Laden aus Stripe
(Zeitraum + Vergleichszeitraum, z. B. Jahr → 2 Jahre). Nicht gemessen (kein Stripe-Netz im Test).

## Grenzen
- „Neukunde“ heißt: im Vergleichszeitraum nicht gekauft – keine Auswertung der gesamten Kaufhistorie (wäre ein Stripe-Vollabruf).
- Mix-Rabatt vs. Stripe-Aktionscode nicht unterscheidbar (Gutscheinname wird nicht geladen).
- Händler-Umsatz netto gespeichert → brutto mit 19 % umgerechnet (wie Büro-Übersicht).
