import { randomBytes } from "node:crypto";
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
    // Laufende Nummer je Jahr
    const seq = list.filter((o) => o.number.startsWith(`H-${year}-`)).length + 1;
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
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (all) =>
    (Array.isArray(all) ? all : []).map((o) => {
      if (o.id !== id || o.status === status) return o;
      changed = { ...o, status, history: [...o.history, { status, at: new Date().toISOString() }] };
      return changed;
    }),
  );
  return changed;
}
