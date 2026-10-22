import { carrierLabel, normalizeTracking, trackingUrl } from "@/app/admin/(panel)/bestellungen/shipping";
import { formatPrice, SITE_URL } from "./format";
import { type DealerInvoice, dueDate, formatDate, invoiceTotals } from "./dealer-invoice";
import type { DealerOrder } from "./dealer-orders";
import { TIER_LABELS } from "./dealer-order-calc";
import { formatCan } from "./dealer-pricing";
import type { Order } from "./orders";
import { publicDomain } from "./company";
import { MAIL_IMAGE_HANDLES } from "./mail-images";
import { RETURN_COST_SENTENCE, type Settings } from "./settings-defaults";

/**
 * E-Mail-Vorlagen im EXSTASE-Stil: schlichtes HTML mit festen Farben (funktioniert in allen Mail-Programmen)
 * plus reine Text-Fassung. Alle Werte von außen werden maskiert.
 */

const C = {
  ink: "#141414",
  muted: "#6b6b66",
  soft: "#8a8a84",
  line: "#ecece6",
  paper: "#efefea",
  panel: "#f5f5f0",
  white: "#ffffff",
  accent: "#a8e652",
  accentText: "#4f7d14",
  footText: "#b5b5ad",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());
const firstName = (name: string) => {
  const n = name.trim().split(/\s+/)[0] ?? "";
  return n && n !== "—" ? n : "";
};

type Company = Settings["company"];


/** Schwarzer Fuß: Marke, Anschrift, Kontakt, Rechtliches */
function footer(c: Company) {
  const address = [c.name, c.street, c.city].filter((p) => !isPlaceholder(p));
  const contact = [c.email, c.phone ? `Tel. ${c.phone}` : ""].filter((p) => p && !isPlaceholder(p));
  const link = (href: string, label: string) => `<a href="${SITE_URL}${href}" style="color:${C.footText}">${label}</a>`;
  return `
    <p style="margin:0 0 8px;color:${C.white};font-weight:700">${esc(c.brand || "EXSTASE")} · <a href="${SITE_URL}" style="color:${C.accent};text-decoration:none">${esc(publicDomain())}</a></p>
    ${address.length ? `<p style="margin:0 0 4px">${address.map(esc).join(" · ")}</p>` : ""}
    ${contact.length ? `<p style="margin:0 0 10px">${contact.map(esc).join(" · ")}</p>` : ""}
    <p style="margin:0">${link("/impressum", "Impressum")} · ${link("/datenschutz", "Datenschutz")} · ${link("/agb", "AGB")} · ${link("/widerruf", "Widerruf")}</p>`;
}

/**
 * Grundgerüst jeder E-Mail: schwarzer Kopf mit Logo, grüner Streifen, weißer Inhalt, schwarzer Fuß.
 * Nur Tabellen und Inline-Styles – so sieht die Mail auch in Outlook und Gmail ordentlich aus.
 */
export function layout({ preheader, body, company, after = "" }: { preheader: string; body: string; company: Company; after?: string }) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(company.brand || "EXSTASE")}</title></head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.white};border-radius:22px;overflow:hidden">
    <tr><td align="center" style="background:${C.ink};padding:24px 24px 20px">
      <a href="${SITE_URL}" style="text-decoration:none"><img src="${SITE_URL}/mail/logo.png" width="120" alt="${esc(company.brand || "EXSTASE")}" style="display:block;width:120px;height:auto;border:0;color:${C.white};font-family:${FONT};font-size:22px;font-weight:800"></a>
    </td></tr>
    <tr><td style="background:${C.accent};height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:30px 28px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink}">
      ${body}
    </td></tr>
    <tr><td style="background:${C.ink};padding:24px 28px;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.footText}">
      ${footer(company)}
    </td></tr>
  </table>
  ${after ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:20px 8px 0;font-family:${FONT}">${after}</td></tr></table>` : ""}
</td></tr></table>
</body></html>`;
}

const eyebrow = (t: string) => `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.accentText}">${t}</p>`;
const h1 = (t: string) => `<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;color:${C.ink}">${t}</h1>`;
const p = (t: string, extra = "") => `<p style="margin:0 0 14px;${extra}">${t}</p>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${C.accent};border-radius:999px"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:800;color:${C.ink};text-decoration:none">${esc(label)} →</a></td></tr></table>`;
const small = (t: string) => `<p style="margin:16px 0 0;font-size:13px;color:${C.muted}">${t}</p>`;
const label = (t: string) => `<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.soft}">${t}</p>`;

function signature(c: Company) {
  return p(`Herzliche Grüße<br>Dein ${esc(c.brand || "EXSTASE")}-Team`, "margin-top:22px");
}

/** Kasten „Fragen?“ mit Telefonnummer (falls hinterlegt) */
function helpBox(c: Company) {
  const phone = c.phone && !isPlaceholder(c.phone) ? ` oder ruf uns an: <b>${esc(c.phone)}</b>` : "";
  const town = c.city && !isPlaceholder(c.city) ? ` aus ${esc(c.city.replace(/^\d{4,5}\s*/, ""))}` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border:1px solid ${C.line};border-radius:14px;font-size:14px">
    <tr><td style="padding:14px 16px;line-height:1.55"><b>Fragen?</b> Antworte einfach auf diese E-Mail${phone}.<br><span style="color:${C.soft}">Dein ${esc(c.brand || "EXSTASE")}-Team${town}</span></td></tr>
  </table>`;
}

/** Fortschritt in vier Schritten; `done` = Anzahl erledigter Schritte (1 = erster Schritt erledigt) */
export function steps(labels: readonly string[], done: number) {
  const cell = (l: string, i: number) => {
    const ok = i < done;
    const circle = ok
      ? `background:${C.accent};color:${C.ink};font-weight:800`
      : `background:#e6e6e0;color:${C.soft}`;
    return `<td width="${Math.floor(100 / labels.length)}%" align="center" style="padding:0 2px">
      <div style="margin:0 auto;width:26px;height:26px;line-height:26px;border-radius:50%;font-size:13px;${circle}">${ok ? "✓" : i + 1}</div>
      <div style="margin-top:6px;font-size:12px;${ok ? `font-weight:700;color:${C.ink}` : `color:${C.soft}`}">${esc(l)}</div>
    </td>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;text-align:center"><tr>${labels.map(cell).join("")}</tr></table>`;
}

const SHOP_STEPS = ["Bestellt", "Gepackt", "Unterwegs", "Zugestellt"] as const;
const DEALER_STEPS = ["Eingegangen", "Bestätigt", "Unterwegs", "Geliefert"] as const;

/** Grauer Kasten mit Eckdaten nebeneinander */
function infoBox(cells: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;background:${C.panel};border-radius:14px;font-size:13px">
    <tr>${cells.map(([k, v]) => `<td style="padding:13px 14px;vertical-align:top"><span style="color:${C.soft}">${esc(k)}</span><br><b style="font-size:15px">${esc(v)}</b></td>`).join("")}</tr>
  </table>`;
}

const dateDE = (d: number | string) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** Produktbild (120×120 JPG) oder ein neutrales Feld, wenn es für das Produkt keins gibt */
function thumb(handle: string | undefined, name: string) {
  if (handle && MAIL_IMAGE_HANDLES.has(handle)) {
    return `<img src="${SITE_URL}/mail/p/${encodeURIComponent(handle)}.jpg" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border-radius:12px;border:0">`;
  }
  return `<div style="width:52px;height:52px;line-height:52px;border-radius:12px;background:${C.ink};color:${C.accent};text-align:center;font-weight:800;font-size:20px">${esc((name.trim()[0] ?? "E").toUpperCase())}</div>`;
}

function itemRow(handle: string | undefined, name: string, detail: string, amount: string) {
  return `<tr>
    <td width="64" style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:middle">${thumb(handle, name)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid ${C.line};vertical-align:middle"><b>${esc(name)}</b>${detail ? `<br><span style="color:${C.soft};font-size:13px">${detail}</span>` : ""}</td>
    <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};white-space:nowrap;vertical-align:middle;font-weight:600">${amount}</td>
  </tr>`;
}

function sumRow(l: string, v: string) {
  return `<tr><td style="padding:3px 0;color:${C.muted}">${l}</td><td align="right" style="padding:3px 0;white-space:nowrap">${v}</td></tr>`;
}

function totalRow(l: string, v: string, note = "") {
  return `<tr><td style="padding:12px 0 0;font-size:17px;font-weight:800;border-top:2px solid ${C.ink}">${l}${note ? ` <span style="font-size:12px;font-weight:400;color:${C.soft}">${note}</span>` : ""}</td><td align="right" style="padding:12px 0 0;font-size:17px;font-weight:800;border-top:2px solid ${C.ink};white-space:nowrap">${v}</td></tr>`;
}

function addressBlock(o: Order) {
  const a = o.shipping?.address;
  if (!o.shipping || !a) return "";
  const lines = [o.shipping.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`.trim(), a.country && a.country !== "DE" ? a.country : ""].filter(Boolean) as string[];
  return lines.map(esc).join("<br>");
}

const isDeposit = (it: Order["items"][number]) => it.handle === "pfand" || /^einwegpfand$/i.test(it.name.trim());

/** Ware, Pfand, Versand, Rabatt und Gesamtbetrag einer Shop-Bestellung */
function orderSums(o: Order) {
  const goods = o.items.filter((it) => !isDeposit(it));
  const deposit = o.items.filter(isDeposit);
  const depositCans = deposit.reduce((n, it) => n + it.quantity, 0);
  const depositTotal = deposit.reduce((n, it) => n + it.amountTotal, 0);
  const discount = o.amountSubtotal + o.amountShipping - o.amountTotal;
  return { goods, depositCans, depositTotal, goodsTotal: o.amountSubtotal - depositTotal, discount };
}

function itemsTable(o: Order) {
  const s = orderSums(o);
  const rows = s.goods
    .map((it) => itemRow(it.handle, it.name, [it.description ? esc(it.description) : "", `Menge ${it.quantity}`].filter(Boolean).join(" · "), it.amountTotal ? formatPrice(it.amountTotal) : ""))
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;font-size:14px">${rows}</table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;font-size:14px">
    ${sumRow("Artikel", formatPrice(s.goodsTotal))}
    ${s.depositCans ? sumRow(`Einwegpfand (${s.depositCans} × 0,25 €)`, formatPrice(s.depositTotal)) : ""}
    ${sumRow(esc(o.shippingMethod ?? "Versand"), o.amountShipping ? formatPrice(o.amountShipping) : "kostenlos")}
    ${s.discount > 0 ? sumRow("Rabatt", `−${formatPrice(s.discount)}`) : ""}
    ${totalRow("Gesamt", formatPrice(o.amountTotal), "inkl. MwSt.")}
  </table>`;
}

function itemsText(o: Order) {
  const s = orderSums(o);
  return [
    ...s.goods.map((it) => `${it.quantity} × ${it.name}${it.description ? ` (${it.description})` : ""}${it.amountTotal ? ` – ${formatPrice(it.amountTotal)}` : ""}`),
    "",
    `Artikel: ${formatPrice(s.goodsTotal)}`,
    ...(s.depositCans ? [`Einwegpfand (${s.depositCans} × 0,25 €): ${formatPrice(s.depositTotal)}`] : []),
    `${o.shippingMethod ?? "Versand"}: ${o.amountShipping ? formatPrice(o.amountShipping) : "kostenlos"}`,
    ...(s.discount > 0 ? [`Rabatt: −${formatPrice(s.discount)}`] : []),
    `Gesamt (inkl. MwSt.): ${formatPrice(o.amountTotal)}`,
  ].join("\n");
}

/* ───────── Widerrufsbelehrung (gleicher Wortlaut wie components/legal-page.tsx – bei Änderungen beides anpassen) ───────── */

function withdrawalParagraphs(c: Company, paidBy: Settings["returns"]["paidBy"]) {
  const reach = [c.name, c.street, c.city, c.country, c.email && !isPlaceholder(c.email) ? `E-Mail: ${c.email}` : "", c.phone && !isPlaceholder(c.phone) ? `Telefon: ${c.phone}` : ""]
    .filter((x) => x && !isPlaceholder(x))
    .join(", ");
  return [
    ["Widerrufsrecht", ""],
    ["", "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen."],
    ["", "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat."],
    ["", `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${reach}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`],
    ["", "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden."],
    ["Folgen des Widerrufs", ""],
    ["", "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet. Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist."],
    ["", `Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden. ${RETURN_COST_SENTENCE[paidBy]}`],
    ["", "Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist."],
    ["Muster-Widerrufsformular", ""],
    ["", "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)"],
    ["", `An: ${reach}`],
    ["", "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)"],
    ["", "Bestellt am (*)/erhalten am (*) · Name des/der Verbraucher(s) · Anschrift des/der Verbraucher(s) · Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier) · Datum"],
    ["", "(*) Unzutreffendes streichen."],
  ] as const;
}

function withdrawalHtml(c: Company, paidBy: Settings["returns"]["paidBy"]) {
  return `<div style="margin-top:28px;padding-top:20px;border-top:1px solid ${C.line};font-size:12.5px;line-height:1.55;color:${C.muted}">
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${C.ink}">Widerrufsbelehrung</p>
    ${withdrawalParagraphs(c, paidBy)
      .map(([head, text]) => (head ? `<p style="margin:12px 0 6px;font-weight:600;color:${C.ink}">${esc(head)}</p>` : `<p style="margin:0 0 8px">${esc(text)}</p>`))
      .join("")}
    <p style="margin:12px 0 0">Unsere <a href="${SITE_URL}/agb" style="color:${C.muted}">Allgemeinen Geschäftsbedingungen</a> kannst du jederzeit unter ${esc(SITE_URL.replace(/^https?:\/\//, ""))}/agb ansehen, speichern und ausdrucken.</p>
  </div>`;
}

function withdrawalText(c: Company, paidBy: Settings["returns"]["paidBy"]) {
  return [
    "",
    "———",
    "WIDERRUFSBELEHRUNG",
    ...withdrawalParagraphs(c, paidBy).map(([head, text]) => (head ? `\n${head.toUpperCase()}` : text)),
    "",
    `AGB: ${SITE_URL}/agb`,
  ].join("\n");
}

/* ───────── Vorlagen ───────── */

export type Rendered = { subject: string; html: string; text: string };

const team = (c: Company) => `Herzliche Grüße\nDein ${c.brand || "EXSTASE"}-Team`;

export function orderConfirmationMail(o: Order, settings: Settings, invoiceNumber?: string): Rendered {
  const c = settings.company;
  const name = firstName(o.customer.name);
  const subject = `Deine Bestellung ${o.number} bei ${c.brand || "EXSTASE"}`;
  const address = addressBlock(o);
  const html = layout({
    preheader: `Danke! Wir haben deine Bestellung ${o.number} erhalten und schicken sie in 1–3 Werktagen los.`,
    company: c,
    body: `
      ${eyebrow("Bestellung bestätigt")}
      ${h1(`Danke${name ? `, ${esc(name)}` : ""}! Deine Bestellung ist bald unterwegs.`)}
      ${p("Die Zahlung ist eingegangen. Wir packen deine Bestellung sorgfältig und schicken sie in der Regel innerhalb von 1–3 Werktagen los. Sobald das Paket unterwegs ist, bekommst du eine E-Mail mit der Sendungsnummer.", `color:${C.muted}`)}
      ${steps(SHOP_STEPS, 1)}
      ${infoBox([
        ["Bestellnummer", o.number],
        ["Datum", dateDE(o.createdAt)],
        ["Lieferung", "1–3 Werktage"],
      ])}
      ${itemsTable(o)}
      ${address ? `${label("Lieferung an")}<p style="margin:0 0 6px;font-size:14px;line-height:1.55">${address}</p>` : ""}
      ${invoiceNumber ? p(`📎 Deine Rechnung <b>${esc(invoiceNumber)}</b> findest du als PDF im Anhang.`, "margin-top:14px;font-size:14px") : ""}
      ${helpBox(c)}
      ${withdrawalHtml(c, settings.returns.paidBy)}`,
  });
  const text = [
    `Danke für deine Bestellung${name ? `, ${name}` : ""}!`,
    "",
    `Wir haben deine Bestellung ${o.number} erhalten und die Zahlung ist eingegangen. Wir packen sie sorgfältig und schicken sie in der Regel innerhalb von 1–3 Werktagen los.`,
    "",
    itemsText(o),
    "",
    o.shipping?.address ? `Lieferadresse:\n${addressBlock(o).replace(/<br>/g, "\n").replace(/&amp;/g, "&")}` : "",
    "",
    ...(invoiceNumber ? [`Deine Rechnung ${invoiceNumber} findest du als PDF im Anhang.`, ""] : []),
    "Fragen? Antworte einfach auf diese E-Mail.",
    "",
    team(c),
    withdrawalText(c, settings.returns.paidBy),
  ].join("\n");
  return { subject, html, text };
}

export function shippingNoticeMail(o: Order, settings: Settings, tracking?: string, carrier?: string): Rendered {
  const c = settings.company;
  const name = firstName(o.customer.name);
  const link = trackingUrl(tracking, carrier);
  const subject = `Deine Bestellung ${o.number} ist unterwegs`;
  const html = layout({
    preheader: "Dein Paket ist auf dem Weg zu dir.",
    company: c,
    body: `
      ${eyebrow("Versendet")}
      ${h1(`${name ? `${esc(name)}, dein` : "Dein"} Paket ist unterwegs!`)}
      ${p(`Gute Nachrichten: Deine Bestellung <b>${esc(o.number)}</b> ist auf dem Weg zu dir. Lass es dir schmecken!`, `color:${C.muted}`)}
      ${steps(SHOP_STEPS, 3)}
      ${
        link
          ? `${infoBox([
              ["Versand mit", carrierLabel(carrier)],
              ["Sendungsnummer", normalizeTracking(tracking ?? "")],
            ])}${button(link, "Sendung verfolgen")}`
          : p("Das Paket ist in den nächsten Tagen bei dir.")
      }
      ${helpBox(c)}`,
  });
  const text = [
    `${name ? `Hallo ${name},` : "Hallo,"}`,
    "",
    `gute Nachrichten: Deine Bestellung ${o.number} ist auf dem Weg zu dir.`,
    "",
    ...(link ? [`Versand mit: ${carrierLabel(carrier)}`, `Sendungsnummer: ${normalizeTracking(tracking ?? "")}`, `Sendung verfolgen: ${link}`, ""] : []),
    "Fragen? Antworte einfach auf diese E-Mail.",
    "",
    team(c),
  ].join("\n");
  return { subject, html, text };
}

export function adminNewOrderMail(o: Order, settings: Settings): Rendered {
  const c = settings.company;
  const url = `${SITE_URL}/admin/bestellungen/${encodeURIComponent(o.id)}`;
  const subject = `Neue Bestellung ${o.number} · ${formatPrice(o.amountTotal)}`;
  const address = addressBlock(o);
  const html = layout({
    preheader: `${o.customer.name} hat für ${formatPrice(o.amountTotal)} bestellt.`,
    company: c,
    body: `
      ${eyebrow("Nur für dich")}
      ${h1("Neue Bestellung 🎉")}
      ${p(`<b>${esc(o.customer.name)}</b> (${esc(o.customer.email)}) hat gerade bestellt.`)}
      ${infoBox([
        ["Bestellnummer", o.number],
        ["Summe", formatPrice(o.amountTotal)],
      ])}
      ${itemsTable(o)}
      ${address ? `${label("Lieferung an")}<p style="margin:0 0 6px;font-size:14px;line-height:1.55">${address}</p>` : ""}
      ${button(url, "Im Dashboard öffnen")}
      ${small("Diese E-Mail bekommst nur du. Abschalten: Dashboard → E-Mails.")}`,
  });
  const text = [`Neue Bestellung ${o.number}`, "", `${o.customer.name} (${o.customer.email})`, "", itemsText(o), "", `Im Dashboard: ${url}`].join("\n");
  return { subject, html, text };
}

export function newsletterConfirmMail(confirmUrl: string, settings: Settings): Rendered {
  const c = settings.company;
  const subject = "Bitte bestätige deine Newsletter-Anmeldung";
  const html = layout({
    preheader: "Nur noch ein Klick – dann bist du dabei.",
    company: c,
    body: `
      ${eyebrow("Newsletter")}
      ${h1("Fast geschafft!")}
      ${p(`Bitte bestätige mit einem Klick, dass du den Newsletter von ${esc(c.brand || "EXSTASE")} bekommen möchtest: neue Sorten und Aktionen, ein- bis zweimal im Monat.`)}
      ${button(confirmUrl, "Anmeldung bestätigen")}
      ${small("Du hast dich nicht angemeldet? Dann ignoriere diese E-Mail einfach – ohne Bestätigung schicken wir dir nichts. Der Link ist 7 Tage gültig.")}`,
  });
  const text = [
    "Fast geschafft!",
    "",
    `Bitte bestätige, dass du den Newsletter von ${c.brand || "EXSTASE"} bekommen möchtest:`,
    confirmUrl,
    "",
    "Du hast dich nicht angemeldet? Dann ignoriere diese E-Mail einfach.",
  ].join("\n");
  return { subject, html, text };
}

export function passwordResetMail(name: string, resetUrl: string, settings: Settings): Rendered {
  const c = settings.company;
  const first = firstName(name);
  const subject = "Neues Passwort für dein Kundenkonto";
  const html = layout({
    preheader: "Hier kannst du ein neues Passwort festlegen.",
    company: c,
    body: `
      ${eyebrow("Kundenkonto")}
      ${h1(`${first ? `Hallo ${esc(first)}` : "Hallo"},`)}
      ${p("du hast ein neues Passwort für dein Kundenkonto angefordert. Klick auf den Knopf und leg ein neues fest:")}
      ${button(resetUrl, "Neues Passwort festlegen")}
      ${small("Der Link ist 60 Minuten gültig und funktioniert nur einmal. Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein Passwort bleibt unverändert.")}`,
  });
  const text = [
    `${first ? `Hallo ${first},` : "Hallo,"}`,
    "",
    "du hast ein neues Passwort für dein Kundenkonto angefordert. Hier kannst du es festlegen (60 Minuten gültig):",
    resetUrl,
    "",
    "Du hast das nicht angefordert? Dann ignoriere diese E-Mail.",
  ].join("\n");
  return { subject, html, text };
}

export function testMail(settings: Settings): Rendered {
  const c = settings.company;
  const html = layout({
    preheader: "Der E-Mail-Versand funktioniert.",
    company: c,
    body: `${eyebrow("Test")}${h1("Es funktioniert ✓")}${p("Diese Test-E-Mail kommt direkt aus deinem Shop. Bestellbestätigungen, Versand-E-Mails und alle anderen Mails sehen genauso aus. Alle Vorlagen findest du im Dashboard unter „E-Mails“.")}${signature(c)}`,
  });
  return { subject: `Test-E-Mail von ${c.brand || "EXSTASE"}`, html, text: "Es funktioniert! Diese Test-E-Mail kommt direkt aus deinem Shop." };
}

/* ───────── Händler-Bestellungen (auf Rechnung, Preise netto) ───────── */

const STATUS_TEXT: Record<DealerOrder["status"], string> = {
  eingegangen: "ist bei uns eingegangen",
  bestätigt: "ist bestätigt – wir bereiten sie vor",
  versendet: "ist unterwegs zu dir",
  storniert: "wurde storniert",
};

const DEALER_STEP: Record<DealerOrder["status"], number> = { eingegangen: 1, bestätigt: 2, versendet: 3, storniert: 0 };

function dealerAddress(o: DealerOrder) {
  const a = o.delivery;
  return [a.company, a.contact, a.street, `${a.zip} ${a.city}`.trim()].filter(Boolean).map(esc).join("<br>");
}

function dealerTable(o: DealerOrder) {
  const c = o.calc;
  const lines = c.lines
    .map((l) =>
      itemRow(
        l.handle,
        `${l.trays} × ${l.title}`,
        `${l.units.toLocaleString("de-DE")} Stück · ${l.canPrice ? `${formatCan(l.canPrice)}/Dose · ` : ""}${formatPrice(l.perTray)} je Tray (${esc(TIER_LABELS[l.tier] ?? "")})`,
        formatPrice(l.total),
      ),
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;font-size:14px">${lines}</table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;font-size:14px">
    ${sumRow("Warenwert netto", formatPrice(c.goodsNet))}
    ${sumRow(`Pfand (${c.units.toLocaleString("de-DE")} × 0,25 €)`, formatPrice(c.depositNet))}
    ${sumRow(esc(c.shippingLabel), c.shippingNet === null ? "nach Absprache" : c.shippingNet ? formatPrice(c.shippingNet) : "kostenlos")}
    ${sumRow("Summe netto", formatPrice(c.net))}
    ${sumRow("zzgl. 19 % MwSt.", formatPrice(c.vat))}
    ${totalRow("Gesamt", formatPrice(c.gross), "voraussichtlich")}
  </table>`;
}

function dealerText(o: DealerOrder) {
  const c = o.calc;
  return [
    ...c.lines.map((l) => `${l.trays} × ${l.title} (${l.units} Stück, ${l.canPrice ? `${formatCan(l.canPrice)}/Dose, ` : ""}${formatPrice(l.perTray)} je Tray, ${TIER_LABELS[l.tier]}) – ${formatPrice(l.total)}`),
    "",
    `Warenwert netto: ${formatPrice(c.goodsNet)}`,
    `Pfand: ${formatPrice(c.depositNet)}`,
    `${c.shippingLabel}: ${c.shippingNet === null ? "nach Absprache" : c.shippingNet ? formatPrice(c.shippingNet) : "kostenlos"}`,
    `Summe netto: ${formatPrice(c.net)}`,
    `zzgl. 19 % MwSt.: ${formatPrice(c.vat)}`,
    `Gesamt (voraussichtlich): ${formatPrice(c.gross)}`,
  ].join("\n");
}

function dealerExtras(o: DealerOrder) {
  return [o.reference ? `Deine Bestellnummer: ${o.reference}` : "", o.wishDate ? `Wunschliefertermin: ${new Date(`${o.wishDate}T12:00:00`).toLocaleDateString("de-DE")}` : "", o.note ? `Bemerkung: ${o.note}` : ""].filter(Boolean);
}

export function dealerOrderConfirmationMail(o: DealerOrder, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(o.delivery.contact);
  const url = `${SITE_URL}/haendler/portal/bestellungen`;
  const subject = `Deine Händler-Bestellung ${o.number} bei ${c.brand || "EXSTASE"}`;
  const extras = dealerExtras(o);
  const html = layout({
    preheader: `Danke! Wir haben deine Bestellung ${o.number} erhalten.`,
    company: c,
    body: `
      ${eyebrow("Händler-Bestellung")}
      ${h1(`Danke für deine Bestellung${name ? `, ${esc(name)}` : ""}!`)}
      ${p(`Wir haben die Bestellung für <b>${esc(o.delivery.company)}</b> erhalten. Wir prüfen sie und melden uns mit der Bestätigung. Bezahlt wird <b>auf Rechnung</b> – die Rechnung bekommst du von uns.`, `color:${C.muted}`)}
      ${steps(DEALER_STEPS, 1)}
      ${infoBox([
        ["Bestellnummer", o.number],
        ["Trays", String(o.calc.trays)],
        ["Zahlung", "Auf Rechnung"],
      ])}
      ${dealerTable(o)}
      ${label("Lieferung an")}<p style="margin:0 0 14px;font-size:14px;line-height:1.55">${dealerAddress(o)}</p>
      ${extras.length ? p(extras.map(esc).join("<br>"), "font-size:14px") : ""}
      ${button(url, "Meine Bestellungen")}
      ${small("Alle Preise netto zzgl. MwSt.; Pfand 0,25 € je Dose bzw. Flasche. Maßgeblich ist unsere Rechnung.")}
      ${helpBox(c)}`,
  });
  const text = [
    `Danke für deine Bestellung${name ? `, ${name}` : ""}!`,
    "",
    `Wir haben die Bestellung ${o.number} für ${o.delivery.company} erhalten. Bezahlt wird auf Rechnung.`,
    "",
    dealerText(o),
    "",
    `Lieferadresse:\n${[o.delivery.company, o.delivery.contact, o.delivery.street, `${o.delivery.zip} ${o.delivery.city}`].join("\n")}`,
    ...(extras.length ? ["", ...extras] : []),
    "",
    `Meine Bestellungen: ${url}`,
    "",
    team(c),
  ].join("\n");
  return { subject, html, text };
}

export function adminNewDealerOrderMail(o: DealerOrder, settings: Settings): Rendered {
  const c = settings.company;
  const url = `${SITE_URL}/admin/haendler/bestellungen#${o.id}`;
  const subject = `Neue Händler-Bestellung ${o.number} · ${o.delivery.company} · ${o.calc.trays} Trays`;
  const extras = dealerExtras(o);
  const html = layout({
    preheader: `${o.delivery.company} hat ${o.calc.trays} Trays bestellt (auf Rechnung).`,
    company: c,
    body: `
      ${eyebrow("Nur für dich")}
      ${h1("Neue Händler-Bestellung 📦")}
      ${p(`<b>${esc(o.delivery.company)}</b> (${esc(o.dealerEmail)}, Stufe ${esc(o.tierName)}) hat auf Rechnung bestellt.`)}
      ${dealerTable(o)}
      ${label("Lieferung an")}<p style="margin:0 0 14px;font-size:14px;line-height:1.55">${dealerAddress(o)}</p>
      ${extras.length ? p(extras.map(esc).join("<br>"), "font-size:14px") : ""}
      ${button(url, "Im Dashboard öffnen")}
      ${small("Bestätigen, versenden oder stornieren: Dashboard → Händler → Bestellungen.")}`,
  });
  const text = [`Neue Händler-Bestellung ${o.number}`, "", `${o.delivery.company} (${o.dealerEmail})`, "", dealerText(o), ...(extras.length ? ["", ...extras] : []), "", `Im Dashboard: ${url}`].join("\n");
  return { subject, html, text };
}

export function dealerOrderStatusMail(o: DealerOrder, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(o.delivery.contact);
  const url = `${SITE_URL}/haendler/portal/bestellungen`;
  const subject = `Bestellung ${o.number}: ${o.status === "bestätigt" ? "bestätigt" : o.status === "versendet" ? "versendet" : o.status === "storniert" ? "storniert" : "eingegangen"}`;
  const html = layout({
    preheader: `Deine Bestellung ${o.number} ${STATUS_TEXT[o.status]}.`,
    company: c,
    body: `
      ${eyebrow("Händler-Bestellung")}
      ${h1(`${name ? `Hallo ${esc(name)}, d` : "D"}eine Bestellung ${STATUS_TEXT[o.status]}`)}
      ${DEALER_STEP[o.status] ? steps(DEALER_STEPS, DEALER_STEP[o.status]) : ""}
      ${infoBox([
        ["Bestellnummer", o.number],
        ["Trays", String(o.calc.trays)],
        ["Summe", formatPrice(o.calc.gross)],
      ])}
      ${small("Summe voraussichtlich, inkl. MwSt. und Pfand. Maßgeblich ist unsere Rechnung.")}
      ${button(url, "Meine Bestellungen")}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `deine Bestellung ${o.number} ${STATUS_TEXT[o.status]}.`, `${o.calc.trays} Trays · ${formatPrice(o.calc.gross)} (voraussichtlich, inkl. MwSt.)`, "", `Meine Bestellungen: ${url}`, "", team(c)].join("\n");
  return { subject, html, text };
}

/** Neue Nachricht / neues Angebot im Händlerbereich */
export function dealerMessageMail(m: { title: string; body: string; type: string; link?: string; linkLabel?: string }, contact: string, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(contact);
  const url = `${SITE_URL}${m.link ?? "/haendler/portal/nachrichten"}`;
  const subject = `${m.type === "angebot" ? "Angebot: " : ""}${m.title}`;
  const html = layout({
    preheader: m.title,
    company: c,
    body: `
      ${eyebrow(m.type === "angebot" ? "Angebot" : "Nachricht")}
      ${h1(esc(m.title))}
      ${name ? p(`Hallo ${esc(name)},`) : ""}
      ${m.body ? p(esc(m.body).replace(/\n/g, "<br>")) : ""}
      ${button(url, m.linkLabel ?? "Im Händlerbereich ansehen")}
      ${m.type === "angebot" ? small("Du bekommst diese E-Mail, weil du in Angebote per E-Mail eingewilligt hast. Abbestellen: Händlerbereich → Konto & Dokumente.") : ""}
      ${signature(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", m.title, "", m.body, "", `Ansehen: ${url}`, ...(m.type === "angebot" ? ["", "Abbestellen: Händlerbereich → Konto & Dokumente."] : []), "", team(c)].join("\n");
  return { subject, html, text };
}

/** Rechnung im Händlerbereich verfügbar (freigegeben oder korrigiert) */
export function dealerInvoiceMail(o: DealerOrder, inv: DealerInvoice, settings: Settings, corrected?: string): Rendered {
  const c = settings.company;
  const name = firstName(o.delivery.contact);
  const t = invoiceTotals(inv);
  const url = `${SITE_URL}/haendler/portal/rechnung/${o.id}`;
  const subject = `${corrected ? "Korrigierte " : ""}Rechnung ${inv.number} zu Bestellung ${o.number}`;
  const info = inv.paid ? "Der Betrag ist bereits beglichen – danke!" : `Bitte überweise ${formatPrice(t.gross)} bis zum ${formatDate(dueDate(inv))}${inv.seller.iban ? ` (IBAN ${inv.seller.iban})` : ""}, Verwendungszweck ${inv.number}.`;
  const html = layout({
    preheader: `Rechnung ${inv.number} über ${formatPrice(t.gross)}`,
    company: c,
    body: `
      ${eyebrow(corrected ? "Rechnung korrigiert" : "Rechnung")}
      ${h1(`${name ? `Hallo ${esc(name)}, d` : "D"}eine Rechnung ist da`)}
      ${p(`${corrected ? `Die Rechnung ${esc(corrected)} wurde korrigiert und durch <b>${esc(inv.number)}</b> ersetzt. ` : `Zu deiner Bestellung <b>${esc(o.number)}</b> steht die Rechnung bereit. `}Der Betrag enthält ${inv.vatRate} % USt. und Pfand.`, `color:${C.muted}`)}
      ${infoBox([
        ["Rechnung", inv.number],
        ["Betrag", formatPrice(t.gross)],
        [inv.paid ? "Status" : "Fällig am", inv.paid ? "Bezahlt" : formatDate(dueDate(inv))],
      ])}
      ${p(esc(info), "font-size:14px")}
      ${button(url, "Rechnung ansehen / als PDF speichern")}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", corrected ? `die Rechnung ${corrected} wurde korrigiert und durch ${inv.number} ersetzt.` : `zu deiner Bestellung ${o.number} steht die Rechnung ${inv.number} bereit.`, `Gesamtbetrag: ${formatPrice(t.gross)}`, "", info, "", `Rechnung ansehen: ${url}`, "", team(c)].join("\n");
  return { subject, html, text };
}

/* ───────── Händler- und Influencer-Anfragen ───────── */

/** Tabelle mit Feldern einer Anfrage (für Mails an dich) */
function fieldTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 6px;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 12px 7px 0;border-bottom:1px solid ${C.line};color:${C.soft};white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${C.line};vertical-align:top">${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Bestätigung an den Händler: Anfrage ist eingegangen */
export function dealerApplicationReceivedMail(d: { contact: string; company: string }, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(d.contact);
  const html = layout({
    preheader: "Danke für deine Anfrage – wir melden uns.",
    company: c,
    body: `
      ${eyebrow("Händler werden")}
      ${h1(`Danke${name ? `, ${esc(name)}` : ""}!`)}
      ${p(`Deine Anfrage für <b>${esc(d.company)}</b> ist bei uns angekommen. Wir prüfen sie und melden uns mit deinem Händlerzugang und den Preisen.`)}
      ${steps(["Anfrage", "Prüfung", "Zugang", "Bestellen"], 1)}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `danke für deine Anfrage für ${d.company}. Wir prüfen sie und melden uns mit deinem Händlerzugang und den Preisen.`, "", team(c)].join("\n");
  return { subject: `Deine Händler-Anfrage bei ${c.brand || "EXSTASE"}`, html, text };
}

/** Info an dich: neue Händler-Anfrage */
export function adminDealerApplicationMail(rows: [string, string][], company: string, settings: Settings): Rendered {
  const c = settings.company;
  const url = `${SITE_URL}/admin/haendler`;
  const html = layout({
    preheader: `${company} möchte Händler werden.`,
    company: c,
    body: `
      ${eyebrow("Nur für dich")}
      ${h1("Neue Händler-Anfrage")}
      ${fieldTable(rows)}
      ${button(url, "Im Dashboard prüfen")}
      ${small("Freigeben oder ablehnen im Dashboard unter „Händler“. Antworten geht direkt per Antwort auf diese E-Mail.")}`,
  });
  const text = ["Neue Händler-Anfrage", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Im Dashboard: ${url}`].join("\n");
  return { subject: `Neue Händler-Anfrage: ${company}`, html, text };
}

/** Händlerzugang freigeschaltet – mit Link zum Passwort festlegen */
export function dealerApprovedMail(d: { contact: string; company: string }, link: string, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(d.contact);
  const html = layout({
    preheader: "Dein Händlerzugang ist freigeschaltet.",
    company: c,
    body: `
      ${eyebrow("Händlerzugang")}
      ${h1(`Willkommen${name ? `, ${esc(name)}` : ""}!`)}
      ${p(`Wir haben <b>${esc(d.company)}</b> als Händler freigeschaltet. Leg jetzt dein Passwort fest und öffne deinen Händlerbereich mit Preisliste, Artikelpässen und Bestellungen auf Rechnung.`)}
      ${steps(["Anfrage", "Prüfung", "Zugang", "Bestellen"], 3)}
      ${button(link, "Zugang einrichten")}
      ${small("Der Link ist 14 Tage gültig.")}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `wir haben ${d.company} als Händler freigeschaltet. Lege jetzt dein Passwort fest:`, link, "", "Der Link ist 14 Tage gültig.", "", team(c)].join("\n");
  return { subject: `Dein ${c.brand || "EXSTASE"}-Händlerzugang ist freigeschaltet`, html, text };
}

/** Bestätigung an Influencer: Bewerbung ist eingegangen */
export function influencerApplicationReceivedMail(d: { name: string; alias: string }, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(d.name);
  const html = layout({
    preheader: "Danke für deine Bewerbung – wir melden uns.",
    company: c,
    body: `
      ${eyebrow("Partner werden")}
      ${h1(`Danke${name ? `, ${esc(name)}` : ""}!`)}
      ${p(`Deine Bewerbung mit <b>${esc(d.alias)}</b> ist bei uns angekommen. Wir schauen uns deinen Kanal an und melden uns. Sobald du freigeschaltet bist, bekommst du den Link zu deinem Dashboard.`)}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `danke für deine Bewerbung mit ${d.alias}. Wir schauen uns deinen Kanal an und melden uns.`, "", team(c)].join("\n");
  return { subject: `Deine Bewerbung als ${c.brand || "EXSTASE"}-Partner`, html, text };
}

/** Info an dich: neue Influencer-Bewerbung */
export function adminInfluencerApplicationMail(rows: [string, string][], alias: string, settings: Settings): Rendered {
  const c = settings.company;
  const url = `${SITE_URL}/admin/influencer`;
  const html = layout({
    preheader: `${alias} möchte Partner werden.`,
    company: c,
    body: `
      ${eyebrow("Nur für dich")}
      ${h1("Neue Influencer-Bewerbung")}
      ${fieldTable(rows)}
      ${button(url, "Im Dashboard prüfen")}
      ${small("Freischalten im Dashboard unter „Influencer“.")}`,
  });
  const text = ["Neue Influencer-Bewerbung", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Im Dashboard: ${url}`].join("\n");
  return { subject: `Neue Influencer-Bewerbung: ${alias}`, html, text };
}

/** Influencer freigeschaltet – Code und Link zum Passwort festlegen */
export function influencerApprovedMail(i: { name: string; code?: string; discountPct: number; commissionPct: number }, link: string, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(i.name);
  const html = layout({
    preheader: `Dein Code ${i.code ?? ""} ist freigeschaltet.`,
    company: c,
    body: `
      ${eyebrow("Partner")}
      ${h1(`Willkommen im Team${name ? `, ${esc(name)}` : ""}!`)}
      ${p("Du bist jetzt offizieller Partner. Leg dein Passwort fest und öffne dein Dashboard mit Code, Bestellungen und Provisionen.")}
      ${infoBox([
        ["Dein Code", i.code ?? "–"],
        ["Rabatt für deine Community", `${i.discountPct} %`],
        ["Deine Provision", `${i.commissionPct} %`],
      ])}
      ${button(link, "Zugang einrichten")}
      ${small("Der Link ist 14 Tage gültig.")}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `willkommen im Team! Dein Code ist ${i.code ?? ""} – deine Community spart damit ${i.discountPct} %, du bekommst ${i.commissionPct} % Provision.`, "", `Zugang einrichten (14 Tage gültig): ${link}`, "", team(c)].join("\n");
  return { subject: `Du bist ${c.brand || "EXSTASE"}-Partner – dein Code ist freigeschaltet`, html, text };
}

/** Monatliche Provisionsgutschrift liegt im Dashboard */
export function influencerStatementMail(i: { name: string }, s: { number: string; gross: number }, link: string, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(i.name);
  const html = layout({
    preheader: `Gutschrift ${s.number} über ${formatPrice(s.gross)}`,
    company: c,
    body: `
      ${eyebrow("Provision")}
      ${h1(`${name ? `${esc(name)}, deine` : "Deine"} Gutschrift ist da`)}
      ${infoBox([
        ["Gutschrift", s.number],
        ["Betrag", formatPrice(s.gross)],
      ])}
      ${button(link, "Gutschrift ansehen")}
      ${helpBox(c)}`,
  });
  const text = [`${name ? `Hallo ${name},` : "Hallo,"}`, "", `deine Gutschrift ${s.number} über ${formatPrice(s.gross)} liegt in deinem Dashboard bereit:`, link, "", team(c)].join("\n");
  return { subject: `Deine Provisionsgutschrift ${s.number}`, html, text };
}
