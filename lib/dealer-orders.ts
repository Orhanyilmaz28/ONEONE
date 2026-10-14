import { randomBytes } from "node:crypto";
import { type DealerOrder, type DealerOrderLine, type DealerOrderStatus, sumLines } from "./dealer-order-pricing";
import type { Dealer } from "./dealer-store";
import { KEYS, getJSON, updateJSON } from "./store";

export * from "./dealer-order-pricing";

/**
 * Händler-Bestellungen aus dem Händlerbereich (/haendler/portal/bestellen).
 * Kein Online-Bezahlen: Die Bestellung geht an den Shop, der sie bestätigt und eine Rechnung schickt.
 * Preise werden immer auf dem Server aus der Händler-Preisliste berechnet – nie vom Browser übernommen.
 */

/** Höchstens so viele Bestellungen je Händler und Tag (Schutz gegen versehentliches Mehrfachsenden) */
const MAX_PER_DAY = 10;
/** Obergrenze im Speicher */
const MAX_ORDERS = 3000;

export class DealerOrderError extends Error {}

export async function getDealerOrders(): Promise<DealerOrder[]> {
  const list = await getJSON<DealerOrder[]>(KEYS.dealerOrders, []);
  return Array.isArray(list) ? list : [];
}

export async function getOrdersOfDealer(dealerId: string): Promise<DealerOrder[]> {
  return (await getDealerOrders()).filter((o) => o.dealer.id === dealerId);
}

export async function addDealerOrder(dealer: Dealer, lines: DealerOrderLine[], note: string): Promise<DealerOrder> {
  if (!lines.length) throw new DealerOrderError("Bitte gib bei mindestens einem Artikel eine Menge an.");
  const { net, deposit } = sumLines(lines);
  const id = randomBytes(8).toString("hex");
  const order: DealerOrder = {
    id,
    number: `H-${id.slice(-6).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "neu",
    dealer: { id: dealer.id, company: dealer.company, contact: dealer.contact, email: dealer.email, phone: dealer.phone, street: dealer.street, zip: dealer.zip, city: dealer.city, vatId: dealer.vatId },
    lines,
    net,
    deposit,
    note,
  };
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (current) => {
    const list = Array.isArray(current) ? current : [];
    const dayAgo = Date.now() - 86_400_000;
    if (list.filter((o) => o.dealer.id === dealer.id && Date.parse(o.createdAt) > dayAgo).length >= MAX_PER_DAY) {
      throw new DealerOrderError("Du hast heute schon viele Bestellungen geschickt. Bitte melde dich bei Änderungen direkt bei uns.");
    }
    return [order, ...list].slice(0, MAX_ORDERS);
  });
  return order;
}

export async function setDealerOrderStatus(id: string, status: DealerOrderStatus): Promise<DealerOrder | null> {
  let changed: DealerOrder | null = null;
  await updateJSON<DealerOrder[]>(KEYS.dealerOrders, [], (list) =>
    (Array.isArray(list) ? list : []).map((o) => {
      if (o.id !== id) return o;
      changed = { ...o, status, updatedAt: new Date().toISOString() };
      return changed;
    })
  );
  return changed;
}
