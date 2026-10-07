import { sendMail } from "./mail";
import { getMailSettings } from "./mail-settings";
import { adminNewOrderMail, orderConfirmationMail } from "./mail-templates";
import { getOrder } from "./orders";
import { getSettings } from "./settings";
import { claimOnce, releaseOnce } from "./store";

const isPlaceholder = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim());

/**
 * Bestellbestätigung an die Kund:in und Info an den Shop – genau einmal pro Bestellung,
 * egal ob die Erfolgsseite oder der Stripe-Webhook zuerst kommt.
 */
export async function sendOrderMails(sessionId: string): Promise<{ customer: boolean; admin: boolean }> {
  const result = { customer: false, admin: false };
  const order = await getOrder(sessionId).catch(() => null);
  if (!order || (order.paymentStatus !== "paid" && order.paymentStatus !== "no_payment_required")) return result;
  const [settings, mail] = await Promise.all([getSettings(), getMailSettings()]);

  if (mail.orderConfirmation && order.customer.email && (await claimOnce(`order-mail:customer:${order.id}`))) {
    const m = orderConfirmationMail(order, settings);
    const res = await sendMail({ to: { email: order.customer.email, name: order.customer.name }, ...m, replyTo: replyTo(settings.company.email), tag: "bestellung" });
    if (res.ok) result.customer = true;
    else {
      console.error("[order-mails] Bestellbestätigung fehlgeschlagen", order.number, res.error);
      // beim nächsten Versuch (z. B. Stripe wiederholt den Webhook) erneut probieren
      await releaseOnce(`order-mail:customer:${order.id}`);
    }
  }

  const adminTo = mail.adminEmail.trim() || (isPlaceholder(settings.company.email) ? "" : settings.company.email.trim());
  if (mail.adminNotify && adminTo && (await claimOnce(`order-mail:admin:${order.id}`))) {
    const m = adminNewOrderMail(order, settings);
    const res = await sendMail({ to: { email: adminTo }, ...m, tag: "neue-bestellung" });
    if (res.ok) result.admin = true;
    else {
      console.error("[order-mails] Shop-Benachrichtigung fehlgeschlagen", order.number, res.error);
      await releaseOnce(`order-mail:admin:${order.id}`);
    }
  }
  return result;
}

function replyTo(companyEmail: string) {
  return isPlaceholder(companyEmail) ? undefined : companyEmail.trim();
}
