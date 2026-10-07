/**
 * Kleine Helfer rund um Versand & Bestellungen.
 * Reine Funktionen ohne Server-Abhängigkeiten – dürfen auch im Browser (Client-Komponenten) laufen.
 */
import type { Address, Order, OrderItem, OrderStatus } from "@/lib/orders";

// ── Versanddienstleister & Sendungsverfolgung ──

export const CARRIERS = [
  { id: "DHL", label: "DHL Paket", url: (nr: string) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${nr}` },
  { id: "DHL Express", label: "DHL Express", url: (nr: string) => `https://www.dhl.com/de-de/home/tracking/tracking-express.html?submit=1&tracking-id=${nr}` },
  { id: "DPD", label: "DPD", url: (nr: string) => `https://tracking.dpd.de/status/de_DE/parcel/${nr}` },
  { id: "Hermes", label: "Hermes", url: (nr: string) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${nr}` },
  { id: "GLS", label: "GLS", url: (nr: string) => `https://gls-group.com/DE/de/paketverfolgung?match=${nr}` },
  { id: "UPS", label: "UPS", url: (nr: string) => `https://www.ups.com/track?loc=de_DE&tracknum=${nr}` },
] as const;

export type CarrierId = (typeof CARRIERS)[number]["id"];
export const DEFAULT_CARRIER: CarrierId = "DHL";

export function isCarrier(value: unknown): value is CarrierId {
  return CARRIERS.some((c) => c.id === value);
}

export function carrierLabel(carrier?: string) {
  return CARRIERS.find((c) => c.id === carrier)?.label ?? carrier ?? CARRIERS[0].label;
}

/** Leerzeichen entfernen, Großbuchstaben – so wie Paketdienste die Nummer erwarten */
export function normalizeTracking(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** 6–40 Zeichen, nur Buchstaben, Ziffern und Bindestrich */
export function isValidTracking(nr: string) {
  return /^[A-Z0-9-]{6,40}$/.test(nr);
}

/** Link zur Sendungsverfolgung (Standard: DHL) – oder null, wenn keine gültige Nummer da ist */
export function trackingUrl(tracking?: string, carrier?: string): string | null {
  const nr = normalizeTracking(tracking ?? "");
  if (!isValidTracking(nr)) return null;
  const c = CARRIERS.find((x) => x.id === carrier) ?? CARRIERS[0];
  return c.url(encodeURIComponent(nr));
}

// ── Status ──

export const STATUS_ORDER: OrderStatus[] = ["offen", "versendet", "erledigt", "storniert"];

/** Gleich wie ORDER_STATUS_LABEL aus lib/orders.ts – das lässt sich im Browser nicht laden (Stripe/Dateizugriff) */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  offen: "Offen",
  versendet: "Versendet",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

export const STATUS_TONE: Record<OrderStatus, "amber" | "blue" | "green" | "red"> = {
  offen: "amber",
  versendet: "blue",
  erledigt: "green",
  storniert: "red",
};

/** Kurze Erklärung je Status – für Anfänger:innen */
export const STATUS_HINT: Record<OrderStatus, string> = {
  offen: "Bezahlt, wartet auf Versand",
  versendet: "Paket ist unterwegs",
  erledigt: "Angekommen, alles fertig",
  storniert: "Abgebrochen bzw. erstattet",
};

export function isStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (STATUS_ORDER as string[]).includes(value);
}

export function paymentLabel(status: string): { label: string; tone: "green" | "amber" | "neutral" } {
  if (status === "paid") return { label: "Bezahlt", tone: "green" };
  if (status === "no_payment_required") return { label: "Keine Zahlung nötig", tone: "neutral" };
  return { label: "Noch nicht bezahlt", tone: "amber" };
}

// ── Adressen ──

let regionNames: Intl.DisplayNames | null = null;

/** Ländercode → deutscher Ländername, z. B. „NL“ → „Niederlande“ */
export function countryName(code?: string | null) {
  if (!code) return "";
  try {
    regionNames ??= new Intl.DisplayNames(["de"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Anschrift als Zeilen (Land nur, wenn nicht Deutschland – wie auf einem Paketaufkleber) */
export function addressLines(address: Address | null | undefined, { alwaysCountry = false } = {}): string[] {
  if (!address) return [];
  const city = [address.postal_code, address.city].filter(Boolean).join(" ");
  const country = address.country && (alwaysCountry || address.country.toUpperCase() !== "DE") ? countryName(address.country) : "";
  return [address.line1, address.line2, city, country].filter((l): l is string => Boolean(l?.trim()));
}

// ── Artikel ──

/** „2× Classic + 1 weiterer Artikel“ */
export function itemSummary(items: Pick<OrderItem, "name" | "quantity">[]) {
  if (items.length === 0) return "—";
  const [first, ...rest] = items;
  const head = `${first.quantity}× ${first.name}`;
  if (rest.length === 0) return head;
  return `${head} + ${rest.length} ${rest.length === 1 ? "weiterer Artikel" : "weitere Artikel"}`;
}

export function itemCount(items: Pick<OrderItem, "quantity">[]) {
  return items.reduce((n, it) => n + it.quantity, 0);
}

// ── Versand-E-Mail (mailto, kein E-Mail-Dienst nötig) ──

/** Vorname für die Anrede („Anna Beispiel“ → „Anna“) */
function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "—" ? first : "";
}

export function shippingMail({
  order,
  tracking,
  carrier,
  brand,
  companyName,
}: {
  order: Pick<Order, "number" | "customer">;
  tracking?: string;
  carrier?: string;
  brand: string;
  companyName: string;
}) {
  const link = trackingUrl(tracking, carrier);
  const greeting = firstName(order.customer.name) ? `Hallo ${firstName(order.customer.name)},` : "Hallo,";
  const lines = [
    greeting,
    "",
    `gute Nachrichten: Deine Bestellung ${order.number} ist auf dem Weg zu dir!`,
    "",
    ...(link
      ? [`Versand mit: ${carrierLabel(carrier)}`, `Sendungsnummer: ${normalizeTracking(tracking ?? "")}`, "", "Hier kannst du dein Paket verfolgen:", link, ""]
      : ["Das Paket ist in den nächsten Tagen bei dir.", ""]),
    "Lass es dir schmecken!",
    "",
    "Hast du Fragen? Antworte einfach auf diese E-Mail.",
    "",
    "Herzliche Grüße",
    `Dein ${brand}-Team`,
    companyName,
  ];
  const subject = `Deine ${brand}-Bestellung ${order.number} ist unterwegs`;
  return { subject, body: lines.join("\r\n") };
}

/** mailto-Link mit vorausgefülltem Betreff und Text */
export function mailtoHref(email: string, subject?: string, body?: string) {
  // Adresse nur kodieren, wenn ungewöhnliche Zeichen drin sind – manche Mail-Programme mögen „%40“ nicht
  const to = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(email) ? email : encodeURIComponent(email);
  const params = [subject ? `subject=${encodeURIComponent(subject)}` : "", body ? `body=${encodeURIComponent(body)}` : ""].filter(Boolean).join("&");
  return `mailto:${to}${params ? `?${params}` : ""}`;
}
