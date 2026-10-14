import { randomBytes } from "node:crypto";
import type { Dealer } from "./dealer-store";
import { KEYS, getJSON, updateJSON } from "./store";

/**
 * Nachrichten an Händler (Händlerbereich → Nachrichten) – nur auf dem Server verwenden.
 * „alle“ = Rundschreiben an alle freigegebenen Händler. Bestell- und Rechnungsnachrichten entstehen automatisch.
 */
export const MESSAGE_TYPES = ["nachricht", "angebot", "bestellung", "rechnung"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
export const MESSAGE_LABELS: Record<MessageType, string> = { nachricht: "Nachricht", angebot: "Angebot", bestellung: "Bestellung", rechnung: "Rechnung" };

export type DealerMessage = {
  id: string;
  /** Händler-ID oder „alle“ */
  to: string;
  type: MessageType;
  title: string;
  body: string;
  /** interner Link im Händlerbereich, z. B. /haendler/portal/bestellungen */
  link?: string;
  linkLabel?: string;
  createdAt: string;
  /** Händler-IDs, die die Nachricht gelesen haben */
  readBy: string[];
};

const MAX_MESSAGES = 3000;

export const getMessages = async (): Promise<DealerMessage[]> => {
  const list = await getJSON<DealerMessage[]>(KEYS.dealerMessages, []);
  return Array.isArray(list) ? list : [];
};

/** Nachrichten eines Händlers: an ihn persönlich oder Rundschreiben seit seiner Registrierung */
export const messagesFor = (all: DealerMessage[], dealer: Pick<Dealer, "id" | "createdAt">) =>
  all.filter((m) => m.to === dealer.id || (m.to === "alle" && m.createdAt >= dealer.createdAt));

export const unreadCount = (all: DealerMessage[], dealer: Pick<Dealer, "id" | "createdAt">) => messagesFor(all, dealer).filter((m) => !m.readBy.includes(dealer.id)).length;

export async function addMessage(input: Omit<DealerMessage, "id" | "createdAt" | "readBy">): Promise<DealerMessage> {
  const msg: DealerMessage = { ...input, id: randomBytes(8).toString("hex"), createdAt: new Date().toISOString(), readBy: [] };
  await updateJSON<DealerMessage[]>(KEYS.dealerMessages, [], (all) => [msg, ...(Array.isArray(all) ? all : [])].slice(0, MAX_MESSAGES));
  return msg;
}

/** Automatische Nachricht – Fehler beim Speichern dürfen den eigentlichen Vorgang nie stoppen */
export async function notifyDealer(input: Omit<DealerMessage, "id" | "createdAt" | "readBy">) {
  await addMessage(input).catch((e) => console.error("[haendler-nachricht]", e));
}

export async function markRead(dealerId: string, ids: string[]) {
  const wanted = new Set(ids);
  await updateJSON<DealerMessage[]>(KEYS.dealerMessages, [], (all) =>
    (Array.isArray(all) ? all : []).map((m) => (wanted.has(m.id) && (m.to === dealerId || m.to === "alle") && !m.readBy.includes(dealerId) ? { ...m, readBy: [...m.readBy, dealerId] } : m)),
  );
}

export async function deleteMessage(id: string) {
  await updateJSON<DealerMessage[]>(KEYS.dealerMessages, [], (all) => (Array.isArray(all) ? all : []).filter((m) => m.id !== id));
}
