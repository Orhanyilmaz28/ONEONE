# EXSTASE Energy – Online-Shop für Energy Drinks

Eigenständiger Online-Shop mit Dashboard auf Basis von **Next.js 16** (App Router, React 19), **Tailwind CSS 4**, **Motion** und **Stripe Checkout**.
Betreiberin: exstase Großhandel GmbH, Straelen. Keine monatlichen Shop-Gebühren, keine Theme-Grenzen – der komplette Code gehört dir.

Live-Adresse (Vercel): https://exstaseshop.vercel.app

## Anleitungen (für Einsteiger:innen)

| Anleitung | Für wen / wofür |
| --- | --- |
| **[docs/ONLINE-STELLEN.md](docs/ONLINE-STELLEN.md)** | Den Shop in 6 Schritten online stellen: GitHub → Vercel → Datenspeicher → Stripe → Domain → Rechtliches. Ohne Vorkenntnisse. |
| **[docs/DASHBOARD.md](docs/DASHBOARD.md)** | Tägliche Arbeit im Dashboard (`/admin`): Bestellungen versenden, Preise ändern, Bewertungen freigeben, Newsletter, Einstellungen. |

---

## Lokal starten (Entwicklung)

Voraussetzung: **Node.js 20.9 oder neuer**.

```bash
cd shop
npm install
cp .env.example .env.local   # dann ADMIN_PASSWORD eintragen (mind. 8 Zeichen)
npm run dev                  # http://localhost:3000  ·  Dashboard: http://localhost:3000/admin
```

- **Ohne Stripe-Schlüssel** läuft der Shop im Demo-Modus: Die Kasse zeigt einen Hinweis statt zu bezahlen.
- **Beispiel-Bestellungen im Dashboard:** in `.env.local` zusätzlich `ADMIN_DEMO=1` setzen (nur lokal, nie online). Sie sind deutlich als „Beispieldaten“ markiert.
- **Testzahlungen:** `STRIPE_SECRET_KEY=sk_test_…` setzen, Testkarte `4242 4242 4242 4242`.
- Lokale Dashboard-Daten liegen in `.data/store.json` (nicht in Git). Löschen = alles auf Standardwerte.

| Befehl | Was er macht |
| --- | --- |
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` / `npm start` | Produktions-Build bauen / starten |
| `npm run typecheck` | TypeScript prüfen |
| `npm run import:shopify -- https://mein-shop.de` | Katalog, Bilder & Rechtstexte aus einem Shopify-Shop übernehmen (siehe unten) |
| `npm run import:reviews` | Bewertungen importieren (`scripts/import-reviews.ts`) |

**Logo neu erzeugen:** Das Logo (Herz aus zwei gespiegelten Tropfen + Schriftzug in runder Linienschrift) entsteht per Skript aus einer Quelle (`scripts/build-logo.mjs`, ohne Schriftdatei – alles aus Linien und Kreisbögen).
`npm run logo` schreibt `components/logo-paths.ts`, `public/marke/*.svg` (Querformat, kompakt, gestapelt, Zeichen, App-Symbol – jeweils schwarz und weiß), `app/icon.svg` und die `--drop`-Zeile in `app/globals.css` – nur Dateien, die sich wirklich ändern.
Danach `npm run icons` für die PNG-Symbole (Apple-Icon, App-Icons in `public/icons/`) und `npm run logo:paket` für das PNG-Logo-Paket (`public/marke/png/`: Druck, Social Media, Profilbilder). Nur prüfen, ohne zu schreiben: `npm run logo -- --check`.

---

## Umgebungsvariablen

Alle Variablen mit Erklärung stehen in **[.env.example](.env.example)**. Kurzfassung:

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `ADMIN_PASSWORD` | ja | Passwort fürs Dashboard (mind. 8 Zeichen) |
| `NEXT_PUBLIC_SITE_URL` | online ja | Öffentliche Adresse, z. B. `https://exstase-energy.de` (Stripe-Rücksprung, Sitemap, Open Graph). Wird beim Build eingesetzt → nach Änderung neu bauen. |
| `STRIPE_SECRET_KEY` | zum Verkaufen | `sk_test_…` oder `sk_live_…`. Fehlt er → Demo-Modus. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` (oder `UPSTASH_REDIS_REST_URL` + `_TOKEN`) | online ja | Upstash Redis. Setzt Vercel automatisch beim Verbinden unter *Storage*. Lokal nicht nötig. |
| `NEWSLETTER_WEBHOOK_URL` | nein | Jede Newsletter-Anmeldung zusätzlich per POST weiterleiten |
| `REVIEW_WEBHOOK_URL` | nein | Jede neue Bewertung zusätzlich per POST weiterleiten |
| `ADMIN_SECRET` | nein | Eigener Signatur-Schlüssel fürs Login-Cookie (sonst aus dem Passwort abgeleitet) |
| `ADMIN_DEMO` | **nur lokal** | `1` = Beispiel-Bestellungen ohne Stripe |

---

## Aufbau

```
shop/
├── app/                    Seiten (App Router)
│   ├── admin/              Dashboard: login/ und (panel)/ mit Übersicht, Bestellungen,
│   │                       Produkte, Bewertungen, Newsletter, Einstellungen
│   ├── api/                checkout (Stripe), newsletter, reviews, sales-today
│   ├── products/ …         Shop-Seiten, Rechtstexte (impressum, agb, widerruf, …)
│   └── globals.css         Design-Tokens (@theme): Farben, Schrift, Abstände
├── components/             UI des Shops · components/admin/ = Bausteine des Dashboards
├── lib/
│   ├── catalog.ts          Katalog (Basis aus data/products.json) + Änderungen aus dem Dashboard
│   ├── store.ts            Datenspeicher: Upstash Redis online, .data/store.json lokal
│   ├── admin-auth.ts       Passwort-Login, signiertes Cookie, requireAdmin()/assertAdmin()
│   ├── orders.ts           Bestellungen = bezahlte Stripe-Checkout-Sessions + Versandstatus
│   ├── settings.ts         Firmendaten, Versandkosten, Aktions-Hinweis
│   └── stripe.ts, format.ts, reviews.ts, review-store.ts, newsletter-store.ts …
├── data/                   products.json, pages.json, reviews.json, size-guides.json
├── public/                 Produktfotos, Videos, Marke (Logo-SVGs)
├── scripts/                Import- und Hilfsskripte
└── docs/                   Anleitungen
```

**Woher kommen die Daten?**

- **Fest im Code** (`data/*.json`, `public/`): Produkte, Varianten, Texte, Fotos, Rechtstext-Vorlagen.
- **Im Datenspeicher** (über das Dashboard änderbar): Preis-/Verfügbarkeits-Anpassungen, Sichtbarkeit, Bestseller (`tt:products`), Einstellungen (`tt:settings`), Bewertungen (`tt:reviews`), Newsletter (`tt:newsletter`), Versandstatus (`tt:orders`).
- **Bei Stripe:** Bestellungen und Zahlungen. Preise werden an der Kasse immer serverseitig aus dem Katalog gelesen.

Nach Änderungen im Dashboard wird der Shop per `revalidatePath` sofort neu erzeugt. Jede Server Action prüft zuerst `assertAdmin()`.

---

## Anpassen

| Was | Wo |
| --- | --- |
| Preise, Verfügbarkeit, Bestseller, Sichtbarkeit | Dashboard → **Produkte** |
| Versandkosten, Gratis-Grenze, Express | Dashboard → **Einstellungen → Versand** |
| Firmendaten (Impressum, AGB, Datenschutz) | Dashboard → **Einstellungen → Firmendaten** (Standardwerte: `lib/company.ts`) |
| Aktions-Hinweis oben im Shop | Dashboard → **Einstellungen → Aktions-Hinweis** |
| Shop nur mit Passwort zeigen (z. B. vor dem Start) | Dashboard → **Einstellungen → Shop mit Passwort schützen** (Code: `proxy.ts`, `lib/site-lock.ts`, Seite `/zugang`) |
| KI-Kennzeichnung von Bildern & Videos | Dashboard → **KI-Kennzeichnung** (alle Medien, ein Klick je Medium; gespeichert unter `tt:ai-media`) · Produktbilder auch im Produkt-Editor · Standardwerte im Code: `lib/ai-media.ts` · Bausteine: `components/ai-media.tsx` (`AiMediaLabel`, `AiImage`, `AiVideo`) |
| Kundenkonten (Registrierung, „Mein Konto“) | Dashboard → **Kunden** (vorbereitet, standardmäßig aus; Code: `app/konto/`, `lib/customers.ts`, `lib/customer-auth.ts`) |
| Neue Produkte, Texte, Fotos, Varianten, Löschen | Dashboard → **Produkte** (gespeichert in Upstash: `tt:custom`, Fotos unter `tt:media:*`; Grundsortiment: `data/products.json`, `public/produkte/`) |
| Farben & Schriften | `app/globals.css` (`@theme`) und `app/layout.tsx` |
| Startseiten-Texte | `app/page.tsx`, `components/home/` |
| Lieferländer | `app/api/checkout/route.ts` (`allowed_countries`) |
| Rechtstext-Vorlagen | `app/agb`, `app/widerruf`, `app/datenschutz`, `app/versand` |

---

## Zahlungen (Stripe)

Der Checkout nutzt Stripe Checkout ohne fest eingestellte Zahlungsarten: Alles, was im Stripe-Dashboard unter
*Einstellungen → Zahlungen → Zahlungsmethoden* aktiviert ist (Karte, PayPal, Klarna, Apple Pay, Google Pay …), erscheint automatisch.
Rabatt-Codes (`allow_promotion_codes`) werden in Stripe angelegt. Einzelheiten: [docs/ONLINE-STELLEN.md, Schritt 5](docs/ONLINE-STELLEN.md#schritt-5--stripe-einrichten-bezahlen).

---

## Online stellen (Kurzfassung)

[Vercel](https://vercel.com): Repo `Orhanyilmaz28/chatbot` importieren, **Root Directory = `shop`** (im Repo-Hauptordner liegt eine andere App),
unter *Storage* Upstash Redis verbinden, Umgebungsvariablen setzen, Domain verbinden.
Vercel „Hobby“ ist laut Vercel nur für nicht-kommerzielle Projekte – für den Shop „Pro“ verwenden.
Ausführlich und für Einsteiger:innen: **[docs/ONLINE-STELLEN.md](docs/ONLINE-STELLEN.md)**.

---

## Aus Shopify übernehmen (optional)

```bash
npm run import:shopify -- https://mein-shop.de
```

Holt Produkte, Varianten/Größen, Preise, Beschreibungen, Kollektionen, alle Produktfotos, Logo, Favicon, Ankündigungsleiste und die Rechtstexte.

- Bilder landen in `public/imported/` (unabhängig vom Shopify-CDN). Mit `--no-images` bleiben sie auf dem Shopify-CDN.
- Ergebnis: `data/products.json` (Katalog & Marke), `data/pages.json` (Rechtstexte), `data/imported/` (Roh-HTML zum Nachschlagen).
- Importierte Rechtstexte ersetzen die Vorlagen (dann greifen die Firmendaten aus dem Dashboard dort nicht mehr).
- Start-Katalog neu erzeugen: `node scripts/seed-data.mjs`.

---

## Vorschau ohne Installation

`docs/vorschau.html` herunterladen und im Browser öffnen (statische Vorschau, älterer Stand ohne Dashboard).

---

## Katalog, Dosen-Bilder & Pfand

- **Katalog:** `data/products.json` wird von `scripts/seed-data.mjs` erzeugt (`node scripts/seed-data.mjs`). Aktuell: Classic, Tropical, Kiwi & Lemon, Watermelon, White Peach, Ice Bonbon, Lime, Blueberry Coconut, Zero und X-Tea Ice Tea (Watermelon, Peach, Lemon), je 6er/12er/24er Pack, dazu der Probier-Mix. Das Skript überschreibt die Datei – Änderungen am Katalog entweder im Skript oder (besser) im Dashboard machen.
- **Dosen-Bilder:** Echte Fotos (freigestellte PNGs) in `public/produkte/original/<produkt-handle>.png` ablegen (z. B. `classic.png`, `watermelon.png`, `xtea-peach.png`), dann `node scripts/make-dosen-scenes.mjs` und `node scripts/seed-data.mjs` ausführen. Ohne Foto zeigt der Shop eine gezeichnete Platzhalter-Dose aus `public/dosen/`. Die drei X-Tea-Dosen sind bereits echte Fotos.
- **Pfand:** 0,25 € je Dose, an der Kasse separat berechnet (`lib/format.ts` → `DEPOSIT_PER_CAN`, `components/cart-drawer.tsx`, `app/api/checkout/route.ts`). Die Dosenzahl steht je Variante im Feld `cans`; fehlt sie, liest der Shop sie aus dem Namen („12er Pack“).
- **Pflichtangaben:** Zutaten, Allergene, Nährwerte und Koffeingehalt je Produkt im Dashboard unter *Produkte → Zutaten & Nährwerte* eintragen – sie erscheinen auf der Produktseite.
