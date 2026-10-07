import { carrierLabel, normalizeTracking, trackingUrl } from "@/app/admin/(panel)/bestellungen/shipping";
import { formatPrice, SITE_URL } from "./format";
import type { Order } from "./orders";
import { RETURN_COST_SENTENCE, type Settings } from "./settings-defaults";

/**
 * E-Mail-Vorlagen im EXSTASE-Stil: schlichtes HTML mit festen Farben (funktioniert in allen Mail-Programmen)
 * plus reine Text-Fassung. Alle Werte von außen werden maskiert.
 */

const C = { ink: "#1d1f1a", muted: "#6b6966", line: "#e7e4de", paper: "#f6f4f0", white: "#ffffff" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());
const firstName = (name: string) => {
  const n = name.trim().split(/\s+/)[0] ?? "";
  return n && n !== "—" ? n : "";
};

type Company = Settings["company"];

function footer(c: Company) {
  const parts = [c.name, c.street, c.city].filter((p) => !isPlaceholder(p));
  return `
    <p style="margin:0 0 6px">${parts.map(esc).join(" · ")}</p>
    <p style="margin:0"><a href="${SITE_URL}/impressum" style="color:${C.muted}">Impressum</a> · <a href="${SITE_URL}/datenschutz" style="color:${C.muted}">Datenschutz</a> · <a href="${SITE_URL}/agb" style="color:${C.muted}">AGB</a> · <a href="${SITE_URL}/widerruf" style="color:${C.muted}">Widerruf</a></p>`;
}

/** Grundgerüst jeder E-Mail */
export function layout({ preheader, body, company }: { preheader: string; body: string; company: Company }) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>EXSTASE</title></head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 8px 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${C.ink};letter-spacing:-0.3px">
      <a href="${SITE_URL}" style="color:${C.ink};text-decoration:none">EXSTASE</a>
    </td></tr>
    <tr><td style="background:${C.white};border:1px solid ${C.line};border-radius:20px;padding:32px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink}">
      ${body}
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
      ${footer(company)}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const h1 = (t: string) => `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:${C.ink}">${t}</h1>`;
const p = (t: string, extra = "") => `<p style="margin:0 0 14px;${extra}">${t}</p>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${C.ink};border-radius:999px"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;
const small = (t: string) => `<p style="margin:16px 0 0;font-size:13px;color:${C.muted}">${t}</p>`;

function signature(c: Company) {
  return p(`Herzliche Grüße<br>Dein ${esc(c.brand || "EXSTASE")}-Team`, "margin-top:22px");
}

function addressBlock(o: Order) {
  const a = o.shipping?.address;
  if (!o.shipping || !a) return "";
  const lines = [o.shipping.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`.trim(), a.country && a.country !== "DE" ? a.country : ""].filter(Boolean) as string[];
  return lines.map(esc).join("<br>");
}

function itemsTable(o: Order) {
  const rows = o.items
    .map(
      (it) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top">${it.quantity} × ${esc(it.name)}${it.description ? `<br><span style="color:${C.muted};font-size:13px">${esc(it.description)}</span>` : ""}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.line};text-align:right;white-space:nowrap;vertical-align:top">${it.amountTotal ? formatPrice(it.amountTotal) : ""}</td>
      </tr>`,
    )
    .join("");
  const discount = o.amountSubtotal + o.amountShipping - o.amountTotal;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;font-size:14px">
    ${rows}
    <tr><td style="padding:10px 0 2px;color:${C.muted}">Zwischensumme</td><td style="padding:10px 0 2px;text-align:right">${formatPrice(o.amountSubtotal)}</td></tr>
    <tr><td style="padding:2px 0;color:${C.muted}">${esc(o.shippingMethod ?? "Versand")}</td><td style="padding:2px 0;text-align:right">${o.amountShipping ? formatPrice(o.amountShipping) : "kostenlos"}</td></tr>
    ${discount > 0 ? `<tr><td style="padding:2px 0;color:${C.muted}">Rabatt</td><td style="padding:2px 0;text-align:right">−${formatPrice(discount)}</td></tr>` : ""}
    <tr><td style="padding:10px 0 0;font-weight:600;border-top:1px solid ${C.line}">Gesamt <span style="font-weight:400;color:${C.muted};font-size:12px">inkl. MwSt.</span></td><td style="padding:10px 0 0;text-align:right;font-weight:600;border-top:1px solid ${C.line}">${formatPrice(o.amountTotal)}</td></tr>
  </table>`;
}

function itemsText(o: Order) {
  return [
    ...o.items.map((it) => `${it.quantity} × ${it.name}${it.description ? ` (${it.description})` : ""}${it.amountTotal ? ` – ${formatPrice(it.amountTotal)}` : ""}`),
    "",
    `Zwischensumme: ${formatPrice(o.amountSubtotal)}`,
    `${o.shippingMethod ?? "Versand"}: ${o.amountShipping ? formatPrice(o.amountShipping) : "kostenlos"}`,
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

export function orderConfirmationMail(o: Order, settings: Settings): Rendered {
  const c = settings.company;
  const name = firstName(o.customer.name);
  const subject = `Deine Bestellung ${o.number} bei ${c.brand || "EXSTASE"}`;
  const address = addressBlock(o);
  const html = layout({
    preheader: `Danke! Wir haben deine Bestellung ${o.number} erhalten und packen sie neutral ein.`,
    company: c,
    body: `
      ${h1(`Danke für deine Bestellung${name ? `, ${esc(name)}` : ""}!`)}
      ${p(`Wir haben deine Bestellung <b>${esc(o.number)}</b> erhalten und die Zahlung ist eingegangen. Wir verpacken sie sorgfältig und schicken sie in der Regel innerhalb von 1–3 Werktagen los. Sobald das Paket unterwegs ist, bekommst du eine weitere E-Mail.`)}
      ${itemsTable(o)}
      ${address ? `<p style="margin:0 0 4px;font-size:13px;color:${C.muted}">Lieferadresse</p><p style="margin:0 0 14px">${address}</p>` : ""}
      ${p("Hast du Fragen zu deiner Bestellung? Antworte einfach auf diese E-Mail – wir helfen dir persönlich.")}
      ${signature(c)}
      ${withdrawalHtml(c, settings.returns.paidBy)}`,
  });
  const text = [
    `Danke für deine Bestellung${name ? `, ${name}` : ""}!`,
    "",
    `Wir haben deine Bestellung ${o.number} erhalten und die Zahlung ist eingegangen. Wir verpacken sie neutral, ohne Hinweis auf den Inhalt, und schicken sie in der Regel innerhalb von 1–3 Werktagen los.`,
    "",
    itemsText(o),
    "",
    o.shipping?.address ? `Lieferadresse:\n${addressBlock(o).replace(/<br>/g, "\n").replace(/&amp;/g, "&")}` : "",
    "",
    "Fragen? Antworte einfach auf diese E-Mail.",
    "",
    `Herzliche Grüße\nDein ${c.brand || "EXSTASE"}-Team`,
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
      ${h1(`${name ? `Hallo ${esc(name)}, d` : "D"}ein Paket ist unterwegs!`)}
      ${p(`Gute Nachrichten: Deine Bestellung <b>${esc(o.number)}</b> ist auf dem Weg zu dir. Lass es dir schmecken!`)}
      ${
        link
          ? `${p(`Versand mit ${esc(carrierLabel(carrier))} · Sendungsnummer <b>${esc(normalizeTracking(tracking ?? ""))}</b>`)}${button(link, "Sendung verfolgen")}`
          : p("Das Paket ist in den nächsten Tagen bei dir.")
      }
      ${p("Hast du Fragen? Antworte einfach auf diese E-Mail.")}
      ${signature(c)}`,
  });
  const text = [
    `${name ? `Hallo ${name},` : "Hallo,"}`,
    "",
    `gute Nachrichten: Deine Bestellung ${o.number} ist auf dem Weg zu dir.`,
    "",
    ...(link ? [`Versand mit: ${carrierLabel(carrier)}`, `Sendungsnummer: ${normalizeTracking(tracking ?? "")}`, `Sendung verfolgen: ${link}`, ""] : []),
    "Fragen? Antworte einfach auf diese E-Mail.",
    "",
    `Herzliche Grüße\nDein ${c.brand || "EXSTASE"}-Team`,
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
      ${h1("Neue Bestellung 🎉")}
      ${p(`<b>${esc(o.customer.name)}</b> (${esc(o.customer.email)}) hat gerade bestellt.`)}
      ${itemsTable(o)}
      ${address ? `<p style="margin:0 0 4px;font-size:13px;color:${C.muted}">Lieferadresse</p><p style="margin:0 0 14px">${address}</p>` : ""}
      ${button(url, "Im Dashboard öffnen")}
      ${small("Diese E-Mail bekommst nur du. Abschalten: Dashboard → Einstellungen → E-Mails.")}`,
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
      ${h1("Fast geschafft!")}
      ${p(`Bitte bestätige mit einem Klick, dass du den Newsletter von ${esc(c.brand || "EXSTASE")} bekommen möchtest.`)}
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
    body: `${h1("Es funktioniert ✓")}${p("Diese Test-E-Mail kommt direkt aus deinem Shop. Bestellbestätigungen, Versand-E-Mails und Newsletter-Bestätigungen sehen genauso aus.")}${signature(c)}`,
  });
  return { subject: `Test-E-Mail von ${c.brand || "EXSTASE"}`, html, text: "Es funktioniert! Diese Test-E-Mail kommt direkt aus deinem Shop." };
}
