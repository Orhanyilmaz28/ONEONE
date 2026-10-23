import type { DealerInvoice } from "./dealer-invoice";
import type { DealerOrder } from "./dealer-orders";
import { SITE_URL } from "./format";
import {
  type Rendered,
  adminDealerApplicationMail,
  adminInfluencerApplicationMail,
  adminNewDealerOrderMail,
  adminNewOrderMail,
  dealerApplicationReceivedMail,
  dealerApprovedMail,
  dealerInvoiceMail,
  dealerMessageMail,
  dealerOrderConfirmationMail,
  dealerOrderStatusMail,
  influencerApplicationReceivedMail,
  influencerApprovedMail,
  influencerStatementMail,
  newsletterConfirmMail,
  orderConfirmationMail,
  passwordResetMail,
  shippingNoticeMail,
  testMail,
} from "./mail-templates";
import type { Order } from "./orders";
import type { Settings } from "./settings-defaults";

/**
 * Beispieldaten für die Vorschau im Dashboard (Dashboard → E-Mails → Vorschau).
 * Alles ausgedacht – es wird nichts gelesen oder gespeichert.
 */

const now = Date.now();

const SAMPLE_ORDER: Order = {
  id: "cs_test_vorschau",
  number: "EX-VORSCHAU",
  createdAt: now,
  customer: { name: "Lena Becker", email: "lena@example.de" },
  shipping: { name: "Lena Becker", address: { line1: "Lindenstraße 12", postal_code: "40210", city: "Düsseldorf", country: "DE" } },
  items: [
    { name: "EXSTASE Classic", description: "24er Tray · 250 ml", quantity: 1, amountTotal: 3576, handle: "classic" },
    { name: "Ice Coffee Latte", description: "12er Pack · 250 ml", quantity: 1, amountTotal: 2388, handle: "ice-coffee-latte" },
    { name: "Einwegpfand", description: "0,25 € je Dose/Flasche", quantity: 36, amountTotal: 900, handle: "pfand" },
  ],
  amountSubtotal: 6864,
  amountShipping: 590,
  amountTotal: 7454,
  shippingMethod: "Standardversand (DHL)",
  paymentStatus: "paid",
  meta: { status: "offen" },
};

const SAMPLE_DEALER_ORDER: DealerOrder = {
  id: "0000000000000000",
  number: "H-2026-0042",
  createdAt: new Date(now).toISOString(),
  dealerId: "0000000000000000",
  dealerEmail: "einkauf@kiosk-beispiel.de",
  tierName: "Standard",
  status: "bestätigt",
  history: [],
  delivery: { company: "Kiosk am Markt", contact: "Murat Kaya", street: "Marktplatz 3", zip: "47638", city: "Straelen" },
  reference: "KM-118",
  calc: {
    lines: [
      { handle: "classic", title: "EXSTASE Classic", trays: 4, units: 96, tier: "s4", canPrice: 89, perTray: 2136, total: 8544 },
      { handle: "kiwi-lemon", title: "Kiwi & Lemon", trays: 2, units: 48, tier: "s4", canPrice: 89, perTray: 2136, total: 4272 },
    ],
    trays: 6,
    units: 144,
    pallet: false,
    goodsNet: 12816,
    depositNet: 3600,
    shippingNet: 0,
    shippingLabel: "Versand (kostenlos ab 4 Trays)",
    net: 16416,
    vat: 3119,
    gross: 19535,
    toPallet: 114,
    blocked: [],
  },
};

const SAMPLE_INVOICE: DealerInvoice = {
  number: "RE-2026-0042",
  date: new Date(now).toISOString().slice(0, 10),
  serviceDate: new Date(now).toISOString().slice(0, 10),
  dueDays: 14,
  lines: [
    { text: "EXSTASE Classic, Tray à 24 Dosen", qty: 4, unit: "Tray", price: 2136, deposit: 24 },
    { text: "EXSTASE Kiwi & Lemon, Tray à 24 Dosen", qty: 2, unit: "Tray", price: 2136, deposit: 24 },
  ],
  shippingNet: 0,
  shippingText: "Versand",
  discountNet: 0,
  discountText: "",
  note: "",
  vatRate: 19,
  billTo: { company: "Kiosk am Markt", contact: "Murat Kaya", street: "Marktplatz 3", zip: "47638", city: "Straelen", vatId: "" },
  seller: { name: "", owner: "", street: "", city: "", country: "", email: "", phone: "", vatId: "", register: "", iban: "DE00 0000 0000 0000 0000 00", bic: "", bank: "" },
  released: true,
  paid: false,
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
};

const APPLICATION_ROWS: [string, string][] = [
  ["Firma", "Kiosk am Markt"],
  ["Ansprechperson", "Murat Kaya"],
  ["E-Mail", "einkauf@kiosk-beispiel.de"],
  ["Telefon", "02834 12345"],
  ["Adresse", "Marktplatz 3, 47638 Straelen"],
  ["Branche", "Kiosk"],
  ["Menge", "5–20 Trays im Monat"],
];

const INFLUENCER_ROWS: [string, string][] = [
  ["Name", "Sophie Wagner"],
  ["Kanalname", "@sophie.moves"],
  ["Plattform", "Instagram"],
  ["Follower", "10.000–50.000"],
  ["Wunsch-Code", "SOPHIE10"],
];

const PREVIEWS: Record<string, (s: Settings) => Rendered> = {
  bestellung: (s) => orderConfirmationMail(SAMPLE_ORDER, s),
  versand: (s) => shippingNoticeMail(SAMPLE_ORDER, s, "00340434161094042557", "DHL"),
  passwort: (s) => passwordResetMail("Lena Becker", `${SITE_URL}/konto/passwort?vorschau`, s),
  "newsletter-bestaetigung": (s) => newsletterConfirmMail(`${SITE_URL}/newsletter/bestaetigen?vorschau`, s),
  "haendler-bestaetigung": (s) => dealerApplicationReceivedMail({ contact: "Murat Kaya", company: "Kiosk am Markt" }, s),
  "haendler-freischaltung": (s) => dealerApprovedMail({ contact: "Murat Kaya", company: "Kiosk am Markt" }, `${SITE_URL}/haendler/aktivieren?vorschau`, s),
  "haendler-bestellung": (s) => dealerOrderConfirmationMail({ ...SAMPLE_DEALER_ORDER, status: "eingegangen" }, s),
  "haendler-bestellstatus": (s) => dealerOrderStatusMail(SAMPLE_DEALER_ORDER, s),
  "haendler-rechnung": (s) => dealerInvoiceMail(SAMPLE_DEALER_ORDER, SAMPLE_INVOICE, s),
  "haendler-nachricht": (s) =>
    dealerMessageMail({ title: "Neue Sorte: Cactus", body: "Ab sofort könnt ihr unsere neue Sorte Cactus im Händlerportal bestellen.", type: "nachricht" }, "Murat Kaya", s),
  "influencer-bestaetigung": (s) => influencerApplicationReceivedMail({ name: "Sophie Wagner", alias: "@sophie.moves" }, s),
  "influencer-freischaltung": (s) => influencerApprovedMail({ name: "Sophie Wagner", code: "SOPHIE10", discountPct: 10, commissionPct: 10 }, `${SITE_URL}/influencer/aktivieren?vorschau`, s),
  "influencer-gutschrift": (s) => influencerStatementMail({ name: "Sophie Wagner" }, { number: "GS-2026-0007", gross: 12450 }, `${SITE_URL}/influencer/portal`, s),
  "neue-bestellung": (s) => adminNewOrderMail(SAMPLE_ORDER, s),
  "neue-haendler-bestellung": (s) => adminNewDealerOrderMail({ ...SAMPLE_DEALER_ORDER, status: "eingegangen" }, s),
  "haendler-anfrage": (s) => adminDealerApplicationMail(APPLICATION_ROWS, "Kiosk am Markt", s),
  "influencer-anfrage": (s) => adminInfluencerApplicationMail(INFLUENCER_ROWS, "@sophie.moves", s),
  test: (s) => testMail(s),
};

export const PREVIEW_TAGS = Object.keys(PREVIEWS);

/** Vorschau einer E-Mail mit Beispieldaten – null, wenn es für den Kurznamen keine gibt */
export function renderPreview(tag: string, settings: Settings): Rendered | null {
  const fn = PREVIEWS[tag];
  return fn ? fn(settings) : null;
}
