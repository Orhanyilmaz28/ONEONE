# EXSTASE – Sonderprüfung Stripe, Gutscheine und Einwegpfand

Branch `claude/project-thread-blovdv`, Arbeitspaket 6. **Checkout unverändert.** Keine echte Zahlung, keine Erstattung,
keine Rechnungsänderung. Tests: 13 neue (11 Fälle + 2 Grundtests), gesamt **347/347**.

## 1. Ursache (im Code belegt)
`app/api/checkout/route.ts`:
- Ware: je Produkt eine Position (`price_data`, `tax_behavior: inclusive`).
- Pfand: eigene Position „Einwegpfand“, 0,25 € × Dosen/Flaschen.
- Rabatt (Mix-Rabatt **oder** Influencer-Code, der höhere gilt): wird auf den **Warenwert ohne Pfand** berechnet,
  dann als einmaliger Stripe-Gutschein `coupons.create({ amount_off: discount, … })` **ohne `applies_to`** angehängt.
- Ohne Gutschein ist `allow_promotion_codes: true` → Kund:innen können Stripe-Aktionscodes eingeben; deren Wirkung legt das Stripe-Dashboard fest (in der Regel auch ohne Produktbeschränkung).

**Tatsache:** Ohne `applies_to` gilt der Gutschein für alle Positionen der Sitzung, also auch für „Einwegpfand“
(Stripe-Doku: `applies_to.products` beschränkt die rabattfähigen Produkte).
**Nicht bestätigt:** wie Stripe einen Festbetrag genau auf die Positionen verteilt (Rundung). Das ist in der Stripe-Doku nicht beschrieben.
Die Tests verteilen anteilig nach Positionswert und geben Rest-Cent nach dem größten Rest. Das ist eine **Simulation**.
→ **Bestätigung nötig:** ein Testkauf im Stripe-Testmodus mit Mix-Rabatt (z. B. 2 × Classic + 1 × Tropical), danach im Stripe-Dashboard beim Posten „Einwegpfand“ den Rabatt ansehen.

## 2. Auswirkungen
| Stelle | Wirkung heute |
|---|---|
| Zahlungsbetrag | **korrekt** (Ware − Rabatt + Pfand + Versand). Der Rabatt wird nur verteilt, nicht erhöht |
| Warenkorb ↔ Checkout | Summe gleich. Im Warenkorb steht das Pfand voll, im Stripe-Checkout ist der Pfand-Posten anteilig rabattiert |
| Stripe-Rechnung (`invoice_creation`, nur mit Schalter) | Pfand-Posten unter 0,25 € je Dose (z. B. Fall 6: 16,65 € statt 18,00 €) |
| Büro-Export / Tagesbericht / Übersicht | **korrekt:** `fromStripe` nimmt das Pfand vor Rabatt (`amount_subtotal`), den Rabatt als Gesamtbetrag. Ware − Rabatt + Pfand + Versand = Zahlung (getestet) |
| Verkaufsanalyse Produkte/Sorten | Positionsumsatz nach Positionsrabatt. Der auf das Pfand verteilte Rabattanteil fehlt dort (z. B. 0,54 € in Fall 4). Gesamtumsatz ist korrekt |
| Umsatzsteuer | Summe unverändert (19 % im Gesamtbetrag). Nur mit Stripe Tax würde die Verteilung je Position wirken |
| Provision | unberührt (Basis: Warenwert nach Rabatt ohne Pfand, ohne USt) |
| Händler (B2B) | nicht betroffen: Rabatt ist eine eigene Rechnungszeile (`discountNet`), Pfand bleibt voll |
| Erstattungen | Stripe erstattet Beträge, keine Positionen. Büro: Umsatz = brutto − erstattet, netto anteilig (getestet: Teil- und Vollerstattung) |

## 3. Testfälle (isoliert, `tests/master-ap6.test.mts`)
Versand 5,90 €, Pfand 0,25 €. „Pfand-Position heute“ ist simuliert.

| # | Fall | Ware | Rabatt | Pfand soll | Pfand-Position heute | Rabatt auf Pfand | Zahlung | USt enth. |
|---|---|---|---|---|---|---|---|---|
| 1 | Einzeldose (Testprodukt, nicht im Katalog) | 1,99 | 0,00 | 0,25 | 0,25 | 0,00 | 8,14 | 1,30 |
| 2 | 1 Tray | 18,00 | 0,00 | 6,00 | 6,00 | 0,00 | 29,90 | 4,77 |
| 3 | 4 Trays einer Sorte | 72,00 | 0,00 | 24,00 | 24,00 | 0,00 | 101,90 | 16,27 |
| 4 | Mix 3 Trays (4 %) | 54,00 | 2,16 | 18,00 | 17,46 | 0,54 | 75,74 | 12,09 |
| 5 | Mixpaket (eine Position → kein Mix-Rabatt) | 35,00 | 0,00 | 12,00 | 12,00 | 0,00 | 52,90 | 8,45 |
| 6 | Influencer 10 % | 54,00 | 5,40 | 18,00 | 16,65 | 1,35 | 72,50 | 11,58 |
| 7 | Festbetrag 5 € | 36,00 | 5,00 | 12,00 | 10,75 | 1,25 | 48,90 | 7,81 |
| 8 | Code 15 % (6 Trays) | 108,00 | 16,20 | 36,00 | 31,95 | 4,05 | 133,70 | 21,35 |
| 9 | Dosen + Flaschen, Mix | 73,80 | 4,43 | 27,00 | 25,81 | 1,19 | 102,27 | 16,33 |
| 10 | wie 4, Teilerstattung 10 € | 54,00 | 2,16 | 18,00 | 17,46 | 0,54 | 75,74 (Umsatz 65,74) | 12,09 |
| 11 | wie 4, Vollerstattung | 54,00 | 2,16 | 18,00 | 17,46 | 0,54 | 75,74 (Umsatz 0) | 12,09 |

Je Fall geprüft, heute und mit Korrektur: Zahlungsbetrag = Warenkorb, Rechnungssumme = Zahlung,
Büro-Pfand = voll, Büro-Brutto = Zahlung, USt, Versand, Erstattung, Umsatz nach Erstattung. Ergebnis: **alle bestanden**.

## 4. Korrekturvorschlag (vorbereitet, abgeschaltet)
`lib/checkout-deposit-fix.ts` (Schalter `CHECKOUT_DEPOSIT_FIX`, **vom Checkout nicht abgefragt**):
- **Empfehlung A:** Rabatt nur auf Warenpositionen verteilen (anteilig, Cent-genau) und **im Positionspreis** übergeben. Wo nötig wird eine Position geteilt, z. B. 2 × 17,10 € + 1 × 17,11 €. Pfand bleibt 0,25 €/Dose. Kein Gutschein.
  Vorteil: einfach, exakt, ohne Stripe-Produktpflege. Nachteil: Stripe zeigt keinen eigenen Rabattposten, und der Rabatthinweis muss im Positionsnamen stehen. Stripe-Aktionscodes (`allow_promotion_codes`) wären dann für Rabatt-Bestellungen weiter gesperrt, wie heute.
- **Alternative B:** Gutschein mit `applies_to.products` = Stripe-Produkt-IDs der Waren. Das setzt dauerhafte Stripe-Produkte je Artikel voraus (Abgleich und Pflege), der Aufwand ist größer.
- **Bestehende Bestellungen:** keine Änderung. Historische Stripe-Sitzungen und Rechnungen bleiben, wie sie sind; das Büro rechnet sie bereits richtig.
- **Gutscheincodes:** Influencer-Codes und Provision bleiben gleich. Stripe-Aktionscodes im Dashboard sollten zusätzlich auf Warenprodukte beschränkt werden. Das geht nur mit Alternative B.

## 5. Rechtlich/steuerlich zu prüfen (keine Rechtsberatung)
- Darf das Einwegpfand (DPG, 0,25 €) durch einen Rabatt **unter 0,25 €** ausgewiesen werden? Pfandpflicht nach VerpackG § 31 nennt mindestens 0,25 €. Ausweis nach PAngV (Pfand neben dem Preis). → Steuerberater/Anwalt.
- USt-Satz: Getränke 19 %. **Eiskaffee mit hohem Milchanteil kann 7 % sein** (Milchmischgetränk ≥ 75 % Milch). Bitte Rezepturen prüfen lassen. Der Shop rechnet überall 19 %.
- Pfand teilt das umsatzsteuerliche Schicksal der Ware. Ein Rabatt auf Pfand mindert die Bemessungsgrundlage anteilig; das ist bei gleichem Satz neutral.
- Teilerstattung: wird bei Retouren das Pfand mit erstattet? Ein Prozess dafür ist bisher nicht festgelegt.

## 6. Benötigte Freigaben
1. Ein Stripe-Testkauf zur Bestätigung der Verteilung (Testmodus, keine echte Zahlung).
2. Entscheidung A oder B und Freigabe der Checkout-Änderung (Zahlungsfluss).
3. Rechtliche/steuerliche Prüfung der Punkte in Abschnitt 5.

## 7. Umsetzung Variante A (21.10.2026, von Orhan gewählt)
- **Bestätigung vorher:** Orhans Testkauf (1 × Tropical + 1 × Classic, Mix 3 %) im alten Checkout: 36,00 − 1,08 + 12,00 + 5,90 = **52,82 €**. Zahlung korrekt.
- `app/api/checkout/route.ts`: kein Stripe-Gutschein mehr. Warenpositionen über `discountedGoodsLines` (Rabatt nur auf Waren, im Positionspreis, Cent-genau, ggf. geteilte Zeile). Einwegpfand immer 0,25 € je Dose.
- Positionsbeschreibung „inkl. Mix-Rabatt 3 %“ bzw. „inkl. Code … (10 %)“. Metadaten: `items` je Stripe-Position (z. B. `classic:2,classic:1`, alle Leser summieren je Produkt), neu `discount` (Cent) und `discountLabel`.
- Stripe-Aktionscodes nur noch ohne eigenen Rabatt und ohne Influencer-Code (wie bisher praktisch).
- Büro (`fromStripe`): ohne Stripe-Rabatt, aber mit `metadata.discount` → Ware vor Rabatt, Rabatt aus den Metadaten. Alte Bestellungen mit Gutschein bleiben unverändert.
- Danke-Seite: Zeile „Darin enthalten: Mix-Rabatt …“ (nur Hinweis, keine zweite Abbuchung).
- Provision, Versandgrenze, Zahlungsbetrag: unverändert.
- Tests: neu `tests/checkout-deposit-a.test.mts` (echter Checkout-Code, Stripe abgefangen, kein Netz), AP6-Fälle auf A umgestellt. Gesamt **354/354**.
- Nächster Schritt: zweiter Stripe-Testkauf (Testmodus) nach dem Deployment.
