# EXSTASE – Phase 3E: Kundenservice, Reklamationen, Retouren (für ChatGPT)

Branch `claude/project-thread-blovdv`, Arbeitspaket 4. Kein PR, kein Merge, kein Deployment.
Ergebnis: **316/316 Tests** (davon 1 gegen lokale Test-Redis), `tsc` ok, `next build` ok.

## Was gebaut wurde
| Anforderung | Umsetzung |
|---|---|
| Menüpunkt Büroverwaltung → Kundenservice | Reiter „Kundenservice“ · `/admin/buero/kundenservice` |
| Unterbereiche | Alle Kundenfälle · Neue Anfragen (Status Neu) · Reklamationen · Retouren · Stornierungsanfragen · Rückerstattungsanfragen · Abgeschlossene Fälle (je mit Anzahl), dazu Suche, Status-, Prioritäts-, B2B/B2C- und „Nur mir zugewiesen“-Filter |
| Ticketnummer atomar und eindeutig | `KS-JJJJ-NNNNN`; Nummer und Verzeichnis in **einem** atomaren Schritt (`tt:office-tickets`, CAS); je Jahr ab 1. Getestet: 20 parallel (Dateispeicher) und 25 parallel gegen echte lokale Redis → eindeutig, lückenlos |
| Erfasste Felder | Nummer, Kunde, Bestellnummer, B2B/B2C, Anliegen, Beschreibung, Priorität, Zuständig, Erstellt, Letzte Bearbeitung, Status |
| Status | Neu, In Bearbeitung, Rückfrage offen, Wartet auf Kunde, Gelöst, Geschlossen |
| Reklamationsarten | alle 7 laut Auftrag |
| Retouren | Bestellung, Produkt(e) aus den Bestellpositionen, Menge (max. bestellt), Grund, Bearbeitungsstatus, Rücksendeinfos, Büroentscheidung (Erstattung/Ersatz/Gutschrift/Kulanz/Abgelehnt). **Keine Lagerbuchung, keine Bestandskorrektur** |
| Rückerstattungsanfragen | Bestellung, Grund, angefragter Betrag (max. noch nicht erstattet), bereits erstattet (bei Anlage + aktuell aus Stripe/Bestellung), Status, Zuständig. **Keine Stripe-Rückerstattung** – Status „Manuell erstattet“ dokumentiert nur |
| Kundenhistorie | Fall aus der Bestellung heraus anlegen („Kundenfall anlegen“); Verknüpfung mit vorhandenem Kundenkonto (E-Mail) bzw. Händler (ID) – **nur lesen, kein neues Konto**. Fallseite zeigt weitere Fälle des Kunden/der Bestellung; Bestellseite zeigt ihre Fälle |
| Mitarbeiterfunktionen | Zuweisen (nur aktive Zugänge mit Bearbeitungsrecht), Priorität, Status, interne Notizen, Schließen (blockiert bei offener Erstattung/Retouren-Entscheidung), Wiedereröffnen (mit Grund) |
| Protokoll | Verlauf je Fall (wer, wann, was) + Sicherheitsprotokoll `office_ticket` (nur Fallnummer und Vorgang, keine Kundendaten) |
| Gleichzeitige Bearbeitung | jede Änderung prüft den gesehenen Stand (`rev`) und speichert atomar; ältere Stände werden mit Hinweis abgelehnt |
| Antwortvorlagen | Eingangsbestätigung, Rückfrage, Reklamation in Prüfung, Entscheidung, Abschluss – nur zum Kopieren, **kein Versand**, ohne interne Notizen |
| Rechte | `office.service` (bearbeiten) Admin + Büro; `office.service.view` (ansehen) alle Büro-Rollen; Prüfung in Seiten und Server-Aktionen; Rate-Limit 600/h |
| Datenschutz / Anhänge | keine öffentlichen Dokumente; **Anhänge bewusst nicht umgesetzt** (kein Upload) – Fotos bleiben im E-Mail-Postfach, im Fall nur ein Hinweis. Freitexte werden gesäubert |
| Datensicherung | Fälle (`tt:office-ticket*`), Berichtshistorie und Automatisierungs-Einstellungen werden gesichert; Laufsperren/Zähler nicht |

Neue Dateien: `lib/office/tickets.ts` (rein), `lib/office/tickets-service.ts`, `app/admin/buero/kundenservice/{page,actions}.tsx|ts`,
`…/neu/page.tsx`, `…/[nummer]/page.tsx`, `tests/master-ap4.test.mts` (20 Tests), `tests/master-ap4-redis.test.mts` (1 Test).
Geändert: Büro-Reiter, Bestellseite (Button + Fälle), Rollen-Texte/Tabelle, `lib/store.ts` (KEYS.officeTickets), `lib/backup/keys.ts`.

## Grenzen / offen
- Fälle ohne Bestellbezug nur mit Name (und optional E-Mail). Stripe-Bestellnummern (EX-…) lassen sich nicht rückwärts suchen; deshalb Anlage aus der Bestellung.
- Keine Anhänge, keine E-Mail-Anbindung (bewusst; bräuchte Freigabe und Speicherkonzept).
- Verzeichnis aller Fälle liegt in einem Schlüssel (bis 50 000 Fälle, ca. 15 Byte je Fall).

## Nebenbefund (für AP7)
Der bestehende Test „Parallele Erstellung gegen echte (lokale Test-)Redis“ der Lieferscheine (`tests/office-docs.test.mts`) läuft vermutlich **nicht** gegen Redis: der Speicher liest die Redis-Adresse beim ersten Import, der Test setzt sie danach. Wird in AP7 geprüft und korrigiert.
