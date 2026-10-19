import { randomBytes } from "node:crypto";
import { type DealerInvoice, invoiceContent, invoiceTotals } from "./dealer-invoice";
import type { OrderCalc } from "./dealer-order-calc";
import { KEYS, getJSON, updateJSON } from "./store";

/** Händler-Bestellungen (auf Rechnung) – nur auf dem Server verwenden. Bearbeitung im Dashboard unter „Händler → Bestellungen“. */
export const DEALER_ORDER_STATUS = ["eingegangen", "bestätigt", "versendet", "storniert"] as const;
export type DealerOrderStatus = (typeof DEALER_ORDER_STATUS)[number];

export type DealerOrderAddress = { company: string; contact: string; street: string; zip: string; city: string };

export type DealerOrder = {
  id: string;
  /** z. B. „H-2026-0007“ */
  number: string;
  createdAt: string;
  dealerId: string;
  dealerEmail: string;
  tierName: string;
  status: DealerOrderStatus;
  history: { status: DealerOrderStatus; at: string }[];
  calc: OrderCalc;
  delivery: DealerOrderAddress;
  /** Wunschliefertermin (JJJJ-MM-TT) */
  wishDate?: string;
  /** Eigene Bestellnummer des Händlers */
  reference?: string;
  note?: string;
  /** Rechnung zur Bestellung (Dashboard → Händler → Bestellungen → Rechnung) */
  invoice?: DealerInvoice;
};

/** Obergrenze, damit der Speicher nicht vollläuft */
const MAX_ORDERS = 5000;
/** Schutz vor versehentlichem Mehrfach-Absenden bzw. Missbrauch */
const MAX_PER_HOUR = 10;

export class DealerOrderLimitError extends Error {}

export const getDealerOrders = async (): Promise<DealerOrder[]> => {
  const list = await getJSON<DealerOrder[]>(KEYS.dealerOrders, []);
  return Array.isArray(list) ? list : [];
};

export const getDealerOrdersOf = async (dealerId: string) => (await getDealerOrders()).filter((o) => o.dealerId === dealerId);

export const getDealerOrder = async (id: string) => (await getDealerOrders()).find((o) => o.id === id);

export async function createDealerOrder(input: Omit<DealerOrder, "id" | "number" | "createdAt" | "status" | "history">): Promise<DealerOrder> {
  const now = new Date();
  const year = now.getFullYear();
  let created: DealerOrder | undefined;
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (all) => {
    const list = Array.isArray(all) ? all : [];
    const hourAgo = now.getTime() - 3_600_000;
    if (list.filter((o) => o.dealerId === input.dealerId && new Date(o.createdAt).getTime() > hourAgo).length >= MAX_PER_HOUR) {
      throw new DealerOrderLimitError("Zu viele Bestellungen in kurzer Zeit – bitte melde dich kurz bei uns.");
    }
    // Laufende Nummer je Jahr: höchste vergebene + 1 (innerhalb der atomaren Änderung – keine doppelten Nummern)
    const prefix = `H-${year}-`;
    const seq = list.reduce((m, o) => (o.number.startsWith(prefix) ? Math.max(m, Number(o.number.slice(prefix.length)) || 0) : m), 0) + 1;
    created = {
      ...input,
      id: randomBytes(8).toString("hex"),
      number: `H-${year}-${String(seq).padStart(4, "0")}`,
      createdAt: now.toISOString(),
      status: "eingegangen",
      history: [{ status: "eingegangen", at: now.toISOString() }],
    };
    return [created, ...list].slice(0, MAX_ORDERS);
  });
  if (!created) throw new Error("Bestellung konnte nicht gespeichert werden.");
  return created;
}

export async function setDealerOrderStatus(id: string, status: DealerOrderStatus): Promise<DealerOrder | undefined> {
  let changed: DealerOrder | undefined;
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (all) => {
    changed = undefined; // bei Wiederholung nach Konflikt neu bestimmen
    return (Array.isArray(all) ? all : []).map((o) => {
      if (o.id !== id || o.status === status) return o;
      changed = { ...o, status, history: [...o.history, { status, at: new Date().toISOString() }] };
      return changed;
    });
  });
  return changed;
}

/* ───────── Rechnungen ───────── */

export type InvoiceSettings = { iban: string; bic: string; bank: string; dueDays: number; note: string };
export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = { iban: "", bic: "", bank: "", dueDays: 14, note: "" };

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const s = await getJSON<Partial<InvoiceSettings>>(KEYS.dealerInvoiceSettings, {});
  return { ...DEFAULT_INVOICE_SETTINGS, ...Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v !== undefined && v !== null)) } as InvoiceSettings;
}

export async function saveInvoiceSettings(next: InvoiceSettings) {
  await updateJSON<unknown>(KEYS.dealerInvoiceSettings, {}, () => next);
}

/** Nächste freie Rechnungsnummer im Jahr (über alle Rechnungen inkl. ersetzter) */
function nextInvoiceNumber(list: DealerOrder[], year: string) {
  const prefix = `RE-${year}-`;
  const used = list.flatMap((o) => [o.invoice?.number, ...(o.invoice?.replaced ?? []).map((r) => r.number)]).filter((n): n is string => Boolean(n?.startsWith(prefix)));
  const max = used.reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export type InvoiceChange = { kind: "neu" | "gespeichert" | "korrigiert"; previous?: string };

/**
 * Rechnung speichern. Neue Rechnung → nächste Nummer. Wird eine schon freigegebene Rechnung inhaltlich geändert,
 * entsteht eine Korrektur mit neuer Nummer; die alte wird als ersetzt vermerkt (statt sie still zu überschreiben).
 */
export async function saveInvoice(orderId: string, draft: Omit<DealerInvoice, "number" | "createdAt" | "updatedAt" | "released" | "paid" | "replaced" | "releasedAt" | "paidAt">, flags: { release?: boolean; paid?: boolean }): Promise<{ order: DealerOrder; change: InvoiceChange } | undefined> {
  let result: { order: DealerOrder; change: InvoiceChange } | undefined;
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (all) => {
    result = undefined; // bei Wiederholung nach Konflikt neu bestimmen
    const list = Array.isArray(all) ? all : [];
    return list.map((o) => {
      if (o.id !== orderId) return o;
      const now = new Date().toISOString();
      const old = o.invoice;
      let inv: DealerInvoice;
      let change: InvoiceChange;
      if (!old) {
        inv = { ...draft, number: nextInvoiceNumber(list, draft.date.slice(0, 4)), createdAt: now, updatedAt: now, released: false, paid: false };
        change = { kind: "neu" };
      } else {
        inv = { ...old, ...draft, updatedAt: now };
        change = { kind: "gespeichert" };
        if (old.released && invoiceContent(old) !== invoiceContent(inv)) {
          inv.number = nextInvoiceNumber(list, inv.date.slice(0, 4));
          inv.replaced = [...(old.replaced ?? []), { number: old.number, gross: invoiceTotals(old).gross, at: now }];
          change = { kind: "korrigiert", previous: old.number };
        }
      }
      if (flags.release && !inv.released) Object.assign(inv, { released: true, releasedAt: now });
      if (flags.paid !== undefined) Object.assign(inv, flags.paid ? { paid: true, paidAt: inv.paidAt ?? now, released: true, releasedAt: inv.releasedAt ?? now } : { paid: false, paidAt: undefined });
      const next = { ...o, invoice: inv };
      result = { order: next, change };
      return next;
    });
  });
  return result;
}
