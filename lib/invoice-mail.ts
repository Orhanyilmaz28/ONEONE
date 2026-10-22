import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { invoicePdf } from "./office/documents";
import { invoiceBlockers, issueInvoice } from "./office/invoices";
import { logoImage } from "./office/logo";
import { loadOfficeOrder } from "./office/source";
import { getSettings } from "./settings";

/**
 * Rechnung (PDF) für die Bestellbestätigung: stellt die Rechnung aus (bzw. nimmt die schon gespeicherte)
 * und gibt sie als Anhang zurück. Geht etwas nicht (Daten fehlen, Speicher nicht erreichbar), kommt null zurück –
 * die Bestellbestätigung geht dann ohne Anhang raus, die Rechnung lässt sich im Büro erstellen.
 */
export async function invoiceAttachment(sessionId: string): Promise<{ number: string; filename: string; content: Buffer } | null> {
  try {
    const products = await productLookup();
    const { order, error } = await loadOfficeOrder(`s:${sessionId}`, products);
    if (!order || error) return null;
    const company = (await getSettings()).company;
    const blockers = invoiceBlockers(order, company);
    if (blockers.length) {
      console.warn("[rechnung] keine Rechnung an die Bestellbestätigung", order.number, blockers.join(" "));
      return null;
    }
    const stored = await issueInvoice(order, products, company, "Shop (automatisch)", "per E-Mail");
    const content = invoicePdf(stored, await logoImage().catch(() => null));
    return { number: stored.number, filename: `Rechnung-${stored.number}.pdf`, content };
  } catch (e) {
    console.error("[rechnung] Rechnung für die E-Mail fehlgeschlagen", e instanceof Error ? e.message : e);
    return null;
  }
}
