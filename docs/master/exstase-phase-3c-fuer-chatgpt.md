# EXSTASE – AP2 Phase 3C: Auftragskontrolle, Versandfreigabe, Exporthistorie (Bericht für ChatGPT, Master-Auftrag)

Stand 21.10.2026 · Branch `claude/project-thread-blovdv` · nicht live.
Phase 3C war bereits umgesetzt und über PR #14 in main (Merge `e33d093`). AP2 = **Abgleich mit dem Master-Auftrag + Lückenschluss**, kein Neubau.

## Abgleich Anforderung → Stand
| Nr. | Anforderung | Stand | Wo |
|---|---|---|---|
| 2.2 | Bürostatus Neu, In Prüfung, Zurückgestellt, Freigegeben, An Logistik weitergegeben, Versendet, Abgeschlossen, Storniert; getrennt vom Zahlungsstatus; serverseitige Zustandsmaschine | VORHANDEN, GETESTET | `lib/office/workflow.ts` (`applyAction`, `availableActions`); Storniert kommt nur aus der Originalbestellung |
| 2.3 | „Für Versand freigeben“ mit Prüfung (vorhanden, nicht storniert, Adresse, Positionen, Mengen, Zahlung, unverändert); B2C nur bezahlt, B2B auf Rechnung; speichert Benutzer, Zeit, Version, Fingerabdruck, Bemerkung | VORHANDEN, GETESTET | `releaseCheck`, `Release {id, version, at, by, fp, parts, remark}` |
| 2.4 | Sammelfreigabe mit Vorprüfung, getrennte Anzeige, Ausführung erst nach Bestätigung | VORHANDEN, GETESTET | `/admin/buero/sammelaktion`, `runBulk` (max. 50) |
| 2.5 | Logistik-Weitergabe nur als Vermerk; Mitarbeiter, Zeit, Bestellnr., Bemerkung, Vorgangs-ID; Doppelte erkennbar, erneut nur mit Begründung | VORHANDEN, GETESTET | `Handover`, kein Netzwerkcode (Test 44) |
| 2.6 | Versand: Dienstleister, Tracking, Datum, Bemerkung; bestehende Versandstatus berücksichtigt, keine widersprüchlichen Systeme | VORHANDEN, GETESTET | `Shipment`; Abgleich in die Originalbestellung ohne E-Mail; Dashboard-Versand → Büro „Versendet“ |
| 2.7 | Exporthistorie (Zeit, Mitarbeiter, Typ, Zeitraum, Filter, Anzahl, Ergebnis, Export-ID), Altdaten nur aus vorhandenen Protokollen | VORHANDEN, GETESTET | `/admin/buero/exporthistorie`, `tt:office-log:JJJJ-MM`; ältere Einträge aus `tt:adm:audit` als „eingeschränkt“ |
| 2.8 | Änderungsprotokoll (Status, Freigaben, Zurückstellungen, Weitergaben, Versand, Korrekturen) mit Benutzer, Zeit, Vorgang | VORHANDEN, GETESTET | `WfRecord.events` (letzte 200) + Sicherheitsprotokoll |
| 2.9 | Doppelklick, gleichzeitige Mitarbeiter, Wiederholung, veraltete Daten, Netzwerkfehler | VORHANDEN, GETESTET | Vorgangs-ID (`ops`), Stand `rev`, Fingerabdruck `fp`, atomares CAS (`updateJSON`); Test gegen echte lokale Redis |
| 2.10 | Änderung nach Freigabe (Adresse, Erstattung, Storno, Artikel, Zahlung) → neue Prüfung | VORHANDEN, GETESTET | `releaseParts` (adresse/artikel/zahlung/storno), sperrt Weitergabe und Versand |
| 2.11 | Stammdaten-Prüfung (SKU fehlt/doppelt, Einheit, Sorte, Mixpakete) ohne Datenänderung | VORHANDEN, GETESTET | `/admin/buero/stammdaten`, `lib/office/master-data.ts` |
| 2.12 | Historische Mixpakete / Snapshot-Strategie | **ERGÄNZT** (Lesen umgesetzt, Schreiben vorbereitet) | siehe unten |
| 2.13 | Skalierung Lieferscheine | VORHANDEN (3C), hier analysiert | siehe unten |

## Neu in AP2
**Mixpaket-Zusammensetzung zum Kaufzeitpunkt** (`lib/mix-snapshot.ts`):
- Ursache des Risikos: Privatbestellungen speichern nur `handle:menge`. Ändert sich später ein Mixpaket in den Produktdaten, zeigten Büro-Ansichten/Sammellisten/Analysen alte Bestellungen mit dem neuen Inhalt. (Freigabe und Lieferschein halten den Inhalt bereits fest.)
- **Umgesetzt (Lesen):** Steht in den Stripe-Metadaten `mix` (Format `mix-handle=classic*1+tropical*1`), gilt dieser Inhalt in `fromStripe` → `OfficeLine.mixSnapshot`; `unitsBySort`, Sammelliste, Lieferschein, Fingerabdruck und Freigabehinweis nutzen ihn. Ungültige Werte werden ignoriert, nie geraten.
- **Vorbereitet, NICHT aktiv (BENÖTIGT FREIGABE):** Der Checkout müsste `metadata.mix = encodeMixSnapshot({...})` schreiben (eine Zeile in `app/api/checkout/route.ts`). Ohne Freigabe unverändert – alle bisherigen Bestellungen verhalten sich wie vorher (Test).
- Grenze: Stripe-Metadatenwert max. 500 Zeichen → bei sehr vielen Mixpaketen in einer Bestellung wird nichts gespeichert (lieber nichts als abgeschnitten). Ca. 12 Mixpakete pro Bestellung passen.
- Bereits ausgestellte Lieferscheine bleiben unverändert (eigene Datenbasis je Version).

## 2.13 Skalierung Lieferscheine (Analyse)
- Seit 3C: je Bestellung ein Schlüssel `tt:office-ls:<Bestellung>` (typisch 2–30 KB mit bis zu 30 Versionen) + kleiner Jahreszähler `tt:office-ls-seq`. Kein Schlüssel wächst mit der Gesamtzahl.
- Lesen über `MGET` in 100er-Blöcken; Sammeldruck max. 100 Lieferscheine je PDF.
- Upstash (Free): 256 MB Speicher, 10 MB je Anfrage, 100 MB je Wert → bei 10.000 Lieferscheinen/Jahr ca. 50–150 MB über mehrere Jahre. **Empfehlung:** Speicher-Seite im Dashboard beobachten; ab ~150 MB Tarif erhöhen oder alte Versionen (>2 Jahre) archivieren. Keine Migration nötig, keine automatisch ausgeführt.
- Exporthistorie: Monatsliste `tt:office-log:JJJJ-MM` max. 20.000 Einträge (~1 KB) → bei Vollauslastung ~20 MB je Monat; realistisch wenige hundert Einträge.
- Eine Jahrgangs-Struktur (`tt:office-ls:JJJJ:<key>`) ist nicht nötig, weil die Schlüssel je Bestellung schon klein sind.

## Tests (ausgeführt 21.10.2026)
- `npm test`: **277 Tests, 277 bestanden, 0 fehlgeschlagen, 0 übersprungen** (+4 neu in `tests/master-ap2.test.mts`).
- Vorhandene 3C-Tests (75 in `tests/office-workflow.test.mts`) decken Statuswechsel, Freigaben, Sammelaktionen, Rechte, Idempotenz, Parallelität (auch gegen lokale Redis), Änderungsprüfung, Exporthistorie und 3A/3B-Regression ab – alle bestanden.
- `npm run typecheck` ohne Fehler, `npm run build` erfolgreich.

## Offene Punkte
- Checkout-Schreiben der Mix-Zusammensetzung (Freigabe).
- Artikelnummer D31102 doppelt (Caramel/Vanille), Wasser ohne Artikelnummer – Herstellerangaben nötig.
- Änderungsprotokoll je Bestellung: letzte 200 Ereignisse; ältere nur im Sicherheitsprotokoll (500 Einträge gesamt).
