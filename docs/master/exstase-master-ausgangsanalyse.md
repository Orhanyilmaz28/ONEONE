# EXSTASE – Ausgangsanalyse Master-Auftrag (21.10.2026)

Stand vor Beginn von Arbeitspaket 1. Alles hier wurde tatsächlich geprüft (Befehle in dieser Sitzung ausgeführt).

## 1. Git
| Punkt | Ergebnis |
|---|---|
| Geklonter Branch | `claude/laughing-wozniak-rj2shz` (alter Standardbranch des Repos, nur 4 Commits, veraltet) |
| `main` | `e33d093` = Merge PR #14 (Phase 3B + 3C) |
| Arbeitsbranch | `claude/project-thread-blovdv`, neu von `origin/main` (e33d093) abgezweigt |
| Lokale Änderungen | keine (sauberer Stand) |
| Phase 3A | in main (PR #13, Merge `b1b95c0`, Commit `4768b3e`) |
| Phase 3B | in main (`0ec4a3a`, über PR #14) – die Angabe „nur lokal committet“ aus dem 3B-Bericht ist überholt |
| Phase 3C | in main (`f9c35ca`, `4688694`, `c4ead30`, über PR #14) |
| Repository-Sichtbarkeit | **öffentlich** → interne Firmendaten (Steuernummer, Bankverbindung) dürfen nicht in den Code |
| Push | Sicherungs-Push auf den Arbeitsbranch von Orhan erlaubt (21.10.2026). Kein PR, kein Merge, kein Deployment. |

## 2. Pakete (tatsächlich installiert, `npm ls`)
next 16.4.2 · react / react-dom 19.2.7 · typescript 5.9.3 · tailwindcss 4.3.3 · stripe 19.3.0 · motion 12.43.0 · sharp 0.35.5 · qrcode-generator 2.0.4 · tsx 4.23.15. Node 22.22. `npm audit --omit=dev`: 0 Schwachstellen.
Kein PDF-/XLSX-Paket: PDF (`lib/office/pdf.ts`) und XLSX (`lib/office/xlsx.ts`) sind selbst geschrieben.

## 3. Tests, TypeScript, Build (Ausgangslage)
- `npm test` mit lokalen Test-Redis (redis-server 6390/6392/6393 + `tests/helpers/upstash-bridge.mjs`): **261 Tests, 261 bestanden, 0 fehlgeschlagen, 0 übersprungen** (52 Suiten).
- `npm run typecheck`: ohne Fehler.
- `npm run build`: erfolgreich (Meldungen „Sitzung konnte nicht geprüft werden“ beim Vorrendern sind erwartbar – kein Redis im Build).

## 4. Datenmodelle (Kurzfassung)
- **Privatbestellungen (B2C):** Quelle ist Stripe (Checkout-Sessions). Redis `tt:orders` hält nur Versandstatus/Tracking/Notiz je Session.
- **Händlerbestellungen (B2B):** Redis `tt:dealer-orders` (Liste), Rechnungen eingebettet (`invoice`, mit Verkäufer-Momentaufnahme `seller` → historische Rechnungen ändern sich nicht).
- **Büro:** `lib/office/*` – gemeinsame Sicht `OfficeOrder` (nur lesend), Bürostatus je Bestellung `tt:office-wf:<key>`, Lieferscheine je Bestellung `tt:office-ls:<key>` + Jahreszähler `tt:office-ls-seq`, Exporthistorie `tt:office-log:JJJJ-MM`, Exportmarken `tt:office-exported`, Büro-Zugänge `tt:office-users`.
- **Firmendaten:** Standardwerte in `lib/company.ts`, im Dashboard änderbar (`tt:settings` → `company`). Live gilt der gespeicherte Wert, nicht der Code-Standard.
- **Bankdaten für Händlerrechnungen:** `tt:dealer-invoice-settings` (Dashboard → Händler → Rechnungsdaten).
- **Mix-Rabatt:** `lib/mix.ts`; Influencer-Codes `lib/influencers.ts`; Provisionen `tt:commissions`.

## 5. Sicherheitsmechanismen (vorhanden)
Serverseitige Admin-Sitzungen in Redis, TOTP-2FA (Admin + Pflicht für Büro-Zugänge), Rate-Limits über atomare Redis-Zähler, Sicherheitsprotokoll `tt:adm:audit`, Rollen admin/buero/lesen mit Rechteprüfung auf dem Server (`lib/office/roles.ts`), CAS-Schreiben mit Versionszähler `tt:ver:*` (Phase 2A), Vorgangs-IDs gegen Doppelklick, Fail-Closed bei Speicherausfall, Stripe-Webhook mit Signaturprüfung, tägliche verschlüsselte Sicherung (R2) um 03:00 UTC.

## 6. Redis-Schlüssel (Verwendung)
| Schlüssel | Zweck |
|---|---|
| tt:products, tt:custom | Produkt-Anpassungen |
| tt:settings | Firmendaten, Versand, Widerruf, Hinweis |
| tt:orders | Versandstatus B2C |
| tt:dealers, tt:dealer-* | Händler, Preise, Stufen, Pässe, Bestellungen+Rechnungen, Nachrichten, Rechnungsdaten |
| tt:customers, tt:accounts | Kundenkonten |
| tt:influencers, tt:commissions, tt:influencer-statements | Influencer |
| tt:reviews, tt:newsletter, tt:mail, tt:site-lock, tt:ai-media, tt:storage-* | Inhalte/Einstellungen |
| tt:office-users, -exported, -wf:*, -ls:*, -ls-seq, -log:*, -log-start, -bulk:* (1 h), -delivery-notes (alt, nur lesen) | Büroverwaltung |
| tt:adm:* | Sitzungen, 2FA, Rate-Limits, Audit |
| tt:backup:*, tt:monitor:*, tt:ver:*, tt:once:*, tt:media:* | Betrieb, Versionen, Einmal-Marker, Medien |
Die Datensicherung sichert unbekannte `tt:`-Schlüssel automatisch mit → neue Schlüssel aus den Arbeitspaketen sind ohne Zusatzarbeit gesichert.

## 7. Abhängigkeiten zwischen den Arbeitspaketen
- AP1 (Firmendaten) → wirkt auf Lieferscheine/Berichte aus AP2–AP5 (Briefkopf).
- AP2 (3C) ist bereits umgesetzt → nur prüfen und Lücken schließen; AP3–AP5 bauen auf Bürostatus und Exporthistorie auf.
- AP3 (Berichte) nutzt Kennzahlen aus `lib/office/kpis.ts`; AP5 (Analysen) dieselben Berechnungen.
- AP4 (Kundenservice) verknüpft Tickets mit `OfficeOrder`-Schlüsseln.
- AP6 (Stripe/Pfand) betrifft Checkout → nur Analyse + vorbereitete, abgeschaltete Lösung; Ergebnis fließt in AP5 (Pfand/Rabatt-Kennzahlen) und AP7 ein.
- Vercel-Plan unbekannt: Cron-Häufigkeit (Hobby = 1× täglich) bestimmt, wie AP3-Zeitpläne ausgelöst werden können.

## 8. Bekannte offene Punkte aus früheren Phasen
Stripe verteilt Rabatte anteilig aufs Einwegpfand (Coupon ohne `applies_to`) · Mixpaket-Inhalt erst bei Freigabe/Lieferschein festgehalten, nicht beim Kauf · Artikelnummer D31102 doppelt (Caramel/Vanille) · Wasser ohne Artikelnummer · Stripe im Testmodus.
