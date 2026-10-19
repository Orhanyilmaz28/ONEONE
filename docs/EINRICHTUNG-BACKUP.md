# Datensicherung einrichten (Phase 2B) – Schritt für Schritt

Gilt erst, **nachdem** PR #6 und der Phase-2B-PR gemergt sind. Alle Zugangsdaten kommen **nur** in Vercel
(Settings → Environment Variables, Umgebung „Production“, Häkchen „Sensitive“) – nie in GitHub, nie in den Chat.
Alles ist standardmäßig aus; bis zum letzten Schritt läuft keine automatische Sicherung.

## A. Cloudflare R2 (Speicher für die Sicherungen)

Kosten: bis 10 GB 0 €. Cloudflare verlangt beim ersten Aktivieren von R2 meist eine Zahlungsmethode (Karte/PayPal) – es wird nichts abgebucht, solange die Gratisgrenzen nicht überschritten werden.

1. https://dash.cloudflare.com → kostenlos registrieren/anmelden → links **R2 Object Storage** → aktivieren.
2. **Create bucket** → Name `exstase-backups` → Location: *Automatic* (Hinweis „Western Europe“ wählen) → *Create*.
3. Zurück zu **R2 Object Storage** → **API Tokens / Manage API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket(s): **Apply to specific buckets only** → `exstase-backups`
   - TTL: Forever → *Create*.
4. Die Seite zeigt **einmalig**: *Access Key ID*, *Secret Access Key* und den *Endpoint* (`https://<konto-id>.r2.cloudflarestorage.com`). Direkt in Vercel eintragen (Abschnitt C), nicht abspeichern.
5. **Keine** eigenen Lifecycle-/Löschregeln und keinen „Bucket Lock“ im Bucket anlegen – das Aufräumen (30 Tage + 12 Wochen) macht der Shop selbst.

## B. Zweite Upstash-Datenbank (nur für Wiederherstellungstests)

Wichtig: Upstash erlaubt **eine** kostenlose Datenbank pro Konto. Ist die Shop-Datenbank schon die kostenlose:
- **Variante 1 (0 €):** neues, separates Upstash-Konto (andere E-Mail) → dort die kostenlose Testdatenbank.
- **Variante 2:** im selben Konto „Pay as you go“ (nur nach Freigabe; ein Test kostet Bruchteile eines Cents, 0,20 $ je 100.000 Befehle).

1. https://console.upstash.com → **Create Database**.
2. Name `exstase-restore-test`, Typ Regional, Region **eu-central-1 (Frankfurt)**, Plan **Free** → *Create*. Eviction aus lassen.
3. In der Datenbank → Abschnitt **REST API** → `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` kopieren.
4. In Vercel als **`BACKUP_RESTORE_TEST_URL`** und **`BACKUP_RESTORE_TEST_TOKEN`** eintragen (nicht die Shop-Variablen überschreiben!).
5. Die Datenbank leer lassen. Der Shop verweigert jede Datenbank mit gleicher Adresse/gleichem Token wie der Shop und jede nicht leere, nicht markierte Datenbank.

## C. Vercel-Einstellungen

1. **Fluid Compute prüfen:** Projekt → Settings → **Functions** → *Fluid Compute* = **Enabled** (bei neuen Projekten Standard). Ohne Fluid Compute gilt im Hobby-Tarif ein Limit von 60 s statt 300 s.
2. **Variablen** (Settings → Environment Variables, nur *Production*, *Sensitive*):

| Variable | Inhalt |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | mind. 32 zufällige Zeichen (Passwort-Manager, 48 Zeichen). **Zusätzlich im Passwort-Manager sichern** – ohne ihn sind alle Sicherungen unbrauchbar. |
| `BACKUP_S3_ENDPOINT` | Endpoint aus A4 |
| `BACKUP_S3_BUCKET` | `exstase-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | aus A4 |
| `BACKUP_S3_SECRET_ACCESS_KEY` | aus A4 |
| `BACKUP_RESTORE_TEST_URL` / `_TOKEN` | aus B3 |
| `CRON_SECRET` | mind. 16 (besser 40) zufällige Zeichen – erst für Abschnitt E |
| `BACKUP_CRON_ENABLED` | `1` – **erst** in Abschnitt E |

   Optional: `BACKUP_S3_REGION=auto`, `BACKUP_S3_PREFIX`, `BACKUP_RETENTION_DAYS=30`, `BACKUP_WEEKLY_WEEKS=12`, `BACKUP_HEARTBEAT_URL`, `ALERT_EMAILS_ENABLED`, `ADMIN_ALERT_EMAIL`.
3. Nach dem Eintragen: Deployments → neuestes → **Redeploy** (Variablen gelten erst danach).

## D. Erste Sicherung + Testwiederherstellung (manuell, ohne Risiko für den Shop)

Die Sicherung liest die Shop-Datenbank nur; geschrieben wird dort nur das Sicherungsprotokoll (`tt:backup:*`).

1. Dashboard → **Datensicherung**: oben darf kein Hinweis „Es fehlt …“ mehr stehen.
2. **Jetzt sichern** → warten (Sekunden bis ca. 1 Min.) → neue Zeile „vollständig“.
3. Prüfen: **keine** rote Meldung „keine Geschäftsdaten“; unter „Inhalt“ stehen Bestellungen, Produkte, Kunden usw. Bei roter Meldung: Vercel ist mit der falschen/leeren Datenbank verbunden → nicht weitermachen.
4. In Cloudflare → R2 → `exstase-backups`: zwei Dateien (`….exb` und `….meta.json`).
5. Sicherung aufklappen → **Integrität prüfen** → alle Schritte grün.
6. **In Testdatenbank wiederherstellen** (Admin-Passwort + 2FA-Code) → alle Schritte grün, „identisch“, Testdatenbank danach geleert.
7. In Upstash (Testdatenbank → Data Browser) liegt nur noch `tt:restore-test:marker`.

## E. Tägliche Sicherung einschalten (erst nach D)

1. `CRON_SECRET` in Vercel eintragen (Vercel schickt ihn beim Cron-Aufruf automatisch mit).
2. `vercel.json` mit dem Inhalt von `docs/vercel-cron.example.json` ins Projekt (per PR; täglich 03:00 UTC). Hobby-Tarif: 1×/Tag erlaubt, Startzeit schwankt innerhalb der Stunde, keine automatische Wiederholung.
3. `BACKUP_CRON_ENABLED=1` → Redeploy.
4. Am nächsten Tag im Dashboard: neue Sicherung mit Auslöser „automatisch“. Ab dann: 30 Tage täglich + 12 Wochensicherungen, älteres wird automatisch gelöscht (die neueste und die neueste mit Geschäftsdaten nie).

## F. Ausfälle zuverlässig melden (optional)

- **Dashboard/Protokoll:** immer aktiv (fehlgeschlagen, überfällig > 26 Std., leere Sicherung, Fehlerhäufung).
- **E-Mail vom Shop:** `ALERT_EMAILS_ENABLED=1` + `ADMIN_ALERT_EMAIL` (braucht `BREVO_API_KEY` oder `RESEND_API_KEY` wie die Bestellmails). Gleiche Warnung höchstens alle 6 Std.
- **Lebenszeichen (empfohlen, 0 €):** https://healthchecks.io → Check „exstase-backup“, Period 1 day, Grace 3 hours → Ping-URL als `BACKUP_HEARTBEAT_URL`. Meldet auch Ausfälle, bei denen der Shop selbst nichts mehr senden kann (Cron lief nicht, Absturz).
