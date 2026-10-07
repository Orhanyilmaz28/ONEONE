import { randomBytes } from "node:crypto";
import { KEYS, getJSON, updateJSON } from "./store";

/** Händler-Anfragen von /haendler (nur auf dem Server verwenden). Die Freigabe erfolgt im Dashboard unter „Händler“. */
export type DealerStatus = "neu" | "freigegeben" | "abgelehnt";

export type Dealer = {
  id: string;
  createdAt: string;
  status: DealerStatus;
  company: string;
  contact: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  vatId: string;
  branch: string;
  volume: string;
  message: string;
};

export const BRANCHES = ["Einzelhandel", "Getränkemarkt / Großhandel", "Gastronomie", "Kiosk / Späti", "Tankstelle", "Event / Verein", "Online-Händler", "Sonstiges"] as const;
export const VOLUMES = ["bis 10 Trays pro Monat", "10–50 Trays pro Monat", "ab 1 Palette pro Monat", "mehrere Paletten pro Monat", "noch unklar"] as const;

/** Obergrenze, damit der Speicher nicht vollläuft */
const MAX_DEALERS = 1000;

export async function getDealers(): Promise<Dealer[]> {
  const list = await getJSON<Dealer[]>(KEYS.dealers, []);
  return Array.isArray(list) ? list : [];
}

export class DealerLimitError extends Error {}

/** Neue Anfrage speichern; dieselbe E-Mail innerhalb von 10 Minuten wird nicht doppelt eingetragen */
export async function addDealer(input: Omit<Dealer, "id" | "createdAt" | "status">): Promise<{ dealer: Dealer; duplicate: boolean }> {
  let result: { dealer: Dealer; duplicate: boolean } | undefined;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (current) => {
    const list = Array.isArray(current) ? current : [];
    const now = Date.now();
    const same = list.find((d) => d.email === input.email && now - Date.parse(d.createdAt) < 10 * 60_000);
    if (same) {
      result = { dealer: same, duplicate: true };
      return list;
    }
    if (list.length >= MAX_DEALERS) throw new DealerLimitError("Zu viele Händler-Anfragen gespeichert.");
    const dealer: Dealer = { ...input, id: randomBytes(8).toString("hex"), createdAt: new Date(now).toISOString(), status: "neu" };
    result = { dealer, duplicate: false };
    return [dealer, ...list];
  });
  if (!result) throw new Error("Speichern fehlgeschlagen");
  return result;
}

export async function setDealerStatus(id: string, status: DealerStatus): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).map((d) => {
      if (d.id !== id) return d;
      found = true;
      return { ...d, status };
    }),
  );
  return found;
}

export async function deleteDealer(id: string): Promise<boolean> {
  let found = false;
  await updateJSON<Dealer[]>(KEYS.dealers, [], (list) =>
    (Array.isArray(list) ? list : []).filter((d) => {
      if (d.id === id) found = true;
      return d.id !== id;
    }),
  );
  return found;
}
