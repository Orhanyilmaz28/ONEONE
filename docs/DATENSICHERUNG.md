# Datensicherung, Wiederherstellung und Überwachung (Phase 2B)

Stand: 19.10.2026. Alles hier ist **eingebaut, aber nicht eingeschaltet**. Ohne die Umgebungsvariablen unten passiert nichts.

## 1. Was liegt in der Datenbank?

Upstash Redis enthält ausschließlich Text-Schlüssel mit Präfix `tt:` (siehe `lib/store.ts → KEYS`, `lib/kv.ts`, `lib/admin-security/*`).

| Bereich | Schlüssel | Typ | Gesichert? |
|---|---|---|---|
| Produkte & Preise | `tt:products`, `tt:custom` | JSON | ja |
| Shop-Einstellungen | `tt:settings`, `tt:mail`, `tt:site-lock`, `tt:accounts`, `tt:ai-media`, `tt:storage-limit`, `tt:storage-usage` | JSON | ja |
| Bestellungen & Versand | `tt:orders` | JSON | ja |
| Kundenkonten | `tt:customers` | JSON | ja |
| Händlerkonten | `tt:dealers` | JSON | ja |
| Händlerpreise & Stufen | `tt:dealer-prices`, `tt:dealer-tiers`, `tt:dealer-passes` | JSON | ja |
| Händlerbestellungen & Rechnungen | `tt:dealer-orders`, `tt:dealer-invoice-settings` | JSON | ja |
| Nachrichten an Händler | `tt:dealer-messages` | JSON | ja |
| Influencer, Provisionen, Gutschriften | `tt:influencers`, `tt:commissions`, `tt:influencer-statements` | JSON | ja |
| Newsletter & Einwilligungen | `tt:newsletter` | JSON | ja |
| Bewertungen | `tt:reviews` | JSON | ja |
| Versionszähler (Phase 2A) | `tt:ver:<schlüssel>` | Zahl | ja |
| Produktbilder & Medien | `tt:media:<id>` | Base64 | ja |
| Gewerbenachweise | `tt:media:proof-*` | Base64 | ja (nur verschlüsselt) |
| Artikelpässe (Uploads) | `tt:media:pass-*` | Base64 | ja |
| Einmal-Marker (Schutz vor doppelten E-Mails) | `tt:once:*` | Text mit Ablauf | ja, mit Restlaufzeit |
| Sicherheitsprotokoll | `tt:adm:audit` | Liste | ja |
| Admin-Sitzungen | `tt:adm:s:*`, `tt:adm:sessions` | Text / Menge | **nein** – dürfen nie wieder gültig werden |
| Rate-Limits | `tt:adm:rl:*` | Zähler | **nein** – temporär |
| 2FA-Geheimnis, Wiederherstellungscodes | `tt:adm:2fa`, `tt:adm:2fa:last`, `tt:adm:2fa:recovery`, `tt:adm:2fa:setup:*` | | **nein** – verbrauchte Codes würden sonst wieder gültig. Nach einer echten Wiederherstellung 2FA neu einrichten. |
| Betrieb der Sicherung/Überwachung | `tt:backup:*`, `tt:monitor:*` | | nein |
| Unbekannte Schlüssel | alles andere | jeder Typ | ja (vorsorglich) |

Kundinnen-, Händler- und Influencer-Anmeldungen sind signierte Cookies (nicht in Redis) – eine Wiederherstellung meldet niemanden an.

## 2. Architektur (Empfehlung)

```
Vercel Cron (täglich 03:00 UTC) ──► /api/cron/backup (CRON_SECRET)
                                        │  Sperre tt:backup:lock (keine parallelen Läufe)
Upstash Redis ──► konsistenter Export ──► Prüfung ──► gzip ──► AES-256-GCM ──► Cloudflare R2
                                                                            ▲  zurücklesen + prüfen
                                                                            └─ erst dann .meta.json = „vollständig“
```

### Vergleich der Speicherorte

| | Upstash-eigene Backups | **Cloudflare R2** (empfohlen) | S3-kompatibel (AWS S3 u. a.) |
|---|---|---|---|
| Außerhalb von Upstash | nein (gleicher Anbieter) | ja | ja |
| Eigene Verschlüsselung mit eigenem Schlüssel | nein | ja (hier eingebaut) | ja (hier eingebaut) |
| Wiederherstellung in Testdatenbank | ja (ersetzt Zieldatenbank komplett) | ja (hier eingebaut, mit Schutzprüfungen) | ja |
| Kostenlos | manuelle Backups im Upstash-Dashboard; tägliche Backups laut CLI-Doku möglich – ob im Free-Tarif, war nicht zu bestätigen | 10 GB Speicher, 1 Mio. Schreib-, 10 Mio. Lesevorgänge pro Monat frei, keine Gebühren fürs Herunterladen | AWS: nur im ersten Jahr begrenzt frei, danach ca. 0,023 $/GB + Downloadgebühren (ungeprüft) |
| Danach | – | 0,015 $/GB-Monat | anbieterabhängig |

Empfehlung: **Cloudflare R2** als Hauptablage (außerhalb von Upstash, kostenlos bei unserer Datenmenge, mit Vercel kompatibel, keine Downloadgebühren). Zusätzlich gelegentlich ein manuelles Upstash-Backup im Upstash-Dashboard als zweite Ebene. Der eingebaute Client spricht das S3-Protokoll – jeder S3-kompatible Speicher funktioniert ohne Codeänderung.

### Kosten (geschätzt)

- Datenmenge heute: wenige MB. 30 Tages- + 12 Wochensicherungen = 42 Dateien → deutlich unter 10 GB → **0 € bei R2**.
- Pro Lauf: 2 Uploads, ~45 Lesevorgänge → ca. 60 Schreib- / 1.500 Lesevorgänge im Monat → **0 €**.
- Upstash-Befehle: ca. 4 Befehle je gespeichertem Bild + ~20 → bei 300 Bildern etwa 1.300 pro Sicherung ≈ 40.000 im Monat (Free-Tarif: 500.000).
- Vercel Cron: im Hobby-Tarif einmal täglich enthalten → **0 €**.
- Ab ca. 150 MB Bilddaten im Shop auf R2 achten (42 × Größe der Sicherung).

## 3. Verschlüsselung

- AES-256-GCM (authentifiziert), Bibliothek `node:crypto` (keine neue Abhängigkeit).
- Hauptschlüssel `BACKUP_ENCRYPTION_KEY` (≥ 32 Zeichen), getrennt von `SESSION_SECRET` und `ADMIN_2FA_KEY`.
- Je Sicherung eigener Datenschlüssel per HKDF-SHA256 mit 32 Byte Zufallssalz, dazu 12 Byte Zufalls-Nonce → Nonce-Wiederholung mit demselben Schlüssel ausgeschlossen.
- Dateikopf (Format, Salz, Nonce, Schlüssel-Kennung, Zeitpunkt) ist als AAD mitgeschützt.
- Zusätzlich: SHA-256 je Eintrag, Manifest-Prüfsumme über alle Einträge, SHA-256 der ganzen Datei in der `.meta.json`.
- `.meta.json` enthält nur Anzahlen, Größen und Kategorien – keine personenbezogenen Daten.
- Schlüsselwechsel: neuen Schlüssel als `BACKUP_ENCRYPTION_KEY`, alten als `BACKUP_ENCRYPTION_KEY_PREVIOUS`.
- **Geht der Schlüssel verloren, sind alle Sicherungen unbrauchbar.** Deshalb zusätzlich im Passwort-Manager aufbewahren.

## 4. Konsistenz (warum SCAN nicht reicht)

`lib/backup/snapshot.ts`:
1. Medien zuerst (unveränderlich, ID = Fingerabdruck).
2. Geschäftsdaten paarweise mit ihrem Versionszähler lesen (`MGET`, atomar), danach **alle** Versionszähler in einem atomaren `MGET` erneut lesen. Stimmen alle überein, galten alle Werte gleichzeitig → echter Schnappschuss. Sonst nur Geänderte neu lesen, höchstens 8 Runden, danach Abbruch (nie „erfolgreich“).
3. Zweiter Durchgang über Medien (während der Sicherung hochgeladene Bilder).

Weitere Absicherungen: Zeitlimit je Anfrage (15 s) mit Wiederholung nur für Lesebefehle, Gesamtzeitlimit (240 s), große Werte einzeln, Sperre gegen parallele Läufe (15 Min. Ablauf), Upload wird zurückgelesen, entschlüsselt und verglichen, erst danach entsteht die `.meta.json`. Abgebrochene Läufe hinterlassen keine „vollständige“ Sicherung; Reste werden beim nächsten Lauf gelöscht.

Verbleibende Einschränkungen: Einmal-Marker und Sicherheitsprotokoll haben keinen Versionszähler (werden nur angelegt/angehängt – unkritisch). Ein einzelner Wert muss in eine Antwort von Upstash passen. Die ganze Sicherung wird im Arbeitsspeicher gebaut – ausreichend bis ca. 150–200 MB Daten.

## 5. Wiederherstellung

Nur in eine **isolierte Testdatenbank** (`BACKUP_RESTORE_TEST_URL/_TOKEN`). Ablauf: auswählen → Prüfsumme → entschlüsseln → Struktur prüfen → Ziel prüfen → einspielen → zurücklesen und vergleichen → protokollieren → Testdatenbank wieder leeren.

Schutz: Ziel ≠ Produktions-Adresse und ≠ Produktions-Token; Ziel muss leer sein oder die Markierung `tt:restore-test:marker` tragen; Bestätigung mit Passwort + 2FA-Code im Dashboard. Wiederherstellung in den Live-Shop: **gesperrt** (`restoreToProduction` wirft immer).

Kommandozeile: `npm run backup -- create | list | verify <id> | restore-test <id>`.

## 6. Überwachung

`lib/monitoring/signal.ts` erfasst: Redis nicht erreichbar, Zeitüberschreitung, beschädigte Daten, Schreibkonflikte (alles direkt aus `lib/store.ts`), fehlgeschlagene Sicherung/Wiederherstellung, überfällige Sicherung (> 26 Std.), Fehlerhäufung (≥ 50 in zwei Stunden). Server-Protokoll + gedrosselt in Redis (`tt:monitor:*`), Anzeige unter Dashboard → Datensicherung. E-Mail-Warnungen werden vorbereitet, aber **nur** mit `ALERT_EMAILS_ENABLED=1` und `ADMIN_ALERT_EMAIL` verschickt (Versand über Brevo/Resend wie die Bestellmails).

Sicherung ohne Geschäftsdaten (z. B. falsche oder leere Datenbank verbunden): wird abgelegt, aber mit roter Warnung im Dashboard und Störungsmeldung; sie zählt **nicht** als erfolgreiche Sicherung (Überwachung meldet weiter „überfällig“), sendet kein Lebenszeichen und die letzte Sicherung mit Geschäftsdaten wird beim Aufräumen nie gelöscht.

Ausfälle, bei denen der Code gar nicht mehr meldet (Cron lief nicht, Absturz, Zeitlimit): optional `BACKUP_HEARTBEAT_URL` (z. B. healthchecks.io). Ohne sie fällt so ein Ausfall erst beim nächsten Lauf oder Dashboard-Besuch auf (Grenze `BACKUP_MAX_AGE_HOURS`, Standard 26 Std.).

## 7. Passwortschutz bei Redis-Ausfall (Fail-Closed)

Vorher: `getSiteLock()` lieferte bei einem Lesefehler still „aus“ → der Shop war bei einem Ausfall offen. Außerdem galt „an, aber Passwort fehlt“ als „aus“.

Jetzt (`lib/site-lock.ts → createLockResolver`, `proxy.ts`):
1. Frischer Stand (10 s zwischengespeichert) → verwenden.
2. Lesefehler → letzter bekannter Stand dieses Servers, egal wie alt (geschützt bleibt geschützt, öffentlich bleibt öffentlich).
3. Kein bekannter Stand (Server startet während des Ausfalls) → **geschlossen**: Seite „Gleich wieder da“, Schnittstellen antworten 503. Mit `SHOP_PUBLIC=1` (bewusst öffentlicher Shop) bleibt er offen.
4. „An“ ohne gültiges Passwort bleibt „an“.

## 8. Einrichtung (später, nach Freigabe)

Ausführliche Schritt-für-Schritt-Anleitung: `docs/EINRICHTUNG-BACKUP.md`.

1. Cloudflare-Konto → R2 → Bucket `exstase-backups` anlegen (kostenlos), API-Token „Object Read & Write“ nur für diesen Bucket.
2. In Vercel eintragen: `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` → Redeploy → Dashboard → Datensicherung → „Jetzt sichern“.
3. Zweite, leere Upstash-Datenbank (Free) als Testdatenbank → `BACKUP_RESTORE_TEST_URL/_TOKEN` → Testwiederherstellung im Dashboard.
4. Automatik: `CRON_SECRET` setzen, Inhalt von `docs/vercel-cron.example.json` als `vercel.json` ins Projekt, `BACKUP_CRON_ENABLED=1`.
5. Wenn der Shop öffentlich ist: `SHOP_PUBLIC=1`.

## 9. Tests

- `tests/backup.test.mts` – 45 Tests ohne Datenbank (Nachbau im Arbeitsspeicher).
- `tests/backup-redis.test.mts` – 5 Tests mit zwei echten, lokalen Redis-Testdatenbanken (Befehle im Dateikopf).
