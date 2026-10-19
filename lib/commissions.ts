import { randomBytes } from "node:crypto";
import type { InvoiceSeller } from "./dealer-invoice";
import { getInvoiceSettings } from "./dealer-orders";
import { type Influencer, getInfluencer } from "./influencers";
import { orderNumber } from "./orders";
import { getSettings } from "./settings";
import { KEYS, getJSON, getJSONStrict, updateJSON } from "./store";

/**
 * Provisionen für Bestellungen mit Influencer-Code und monatliche Provisionsgutschriften (§ 14 Abs. 2 UStG,
 * Abrechnung durch den Leistungsempfänger). Nur auf dem Server verwenden.
 */

export type Commission = {
  orderId: string;
  orderNumber: string;
  /** Bestellzeitpunkt (ISO) */
  date: string;
  influencerId: string;
  code: string;
  /** Warenwert nach Rabatt ohne MwSt., Pfand und Versand – Basis der Provision (Cent) */
  goodsNet: number;
  pct: number;
  /** Provision netto in Cent */
  amount: number;
  status: "vorgemerkt" | "storniert";
  cancelledAt?: string;
  /** Gutschrift, in der die Provision abgerechnet wurde */
  statementId?: string;
  /** Gutschrift, in der eine nachträgliche Stornierung verrechnet wurde */
  reversedIn?: string;
  paymentIntent?: string;
};

export type StatementLine = { orderNumber: string; date: string; goodsNet: number; pct: number; amount: number; storno?: boolean };

export type StatementRecipient = Pick<Influencer, "name" | "alias" | "street" | "zip" | "city" | "taxNo" | "vatId" | "smallBusiness" | "iban" | "accountHolder" | "email" | "code">;

export type Statement = {
  id: string;
  /** z. B. „GS-2026-0001“ */
  number: string;
  /** Leistungszeitraum JJJJ-MM */
  month: string;
  influencerId: string;
  createdAt: string;
  lines: StatementLine[];
  net: number;
  vatRate: number;
  vat: number;
  gross: number;
  recipient: StatementRecipient;
  issuer: InvoiceSeller;
  paid: boolean;
  paidAt?: string;
};

const MAX_COMMISSIONS = 20000;
const asList = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

export async function getCommissions(): Promise<Commission[]> {
  return asList<Commission>(await getJSON<Commission[]>(KEYS.commissions, []));
}
export const getCommissionsOf = async (influencerId: string) => (await getCommissions()).filter((c) => c.influencerId === influencerId);

export async function getStatements(): Promise<Statement[]> {
  return asList<Statement>(await getJSON<Statement[]>(KEYS.influencerStatements, []));
}
export const getStatementsOf = async (influencerId: string) => (await getStatements()).filter((s) => s.influencerId === influencerId);
export const getStatement = async (id: string) => (await getStatements()).find((s) => s.id === id);

/** Monat (JJJJ-MM) in deutscher Zeit */
export const monthOf = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
export const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });

/** Was aus der Stripe-Session gebraucht wird */
export type PaidSession = { id: string; created: number; metadata?: Record<string, string> | null; payment_intent?: unknown; payment_status?: string | null };

/** Provision für eine bezahlte Bestellung vormerken – mehrfacher Aufruf (Webhook + Erfolgsseite) bucht nur einmal */
export async function recordCommission(session: PaidSession): Promise<Commission | null> {
  const meta = session.metadata ?? {};
  const influencerId = meta.refId;
  if (!influencerId || !/^[0-9a-f]{16}$/.test(influencerId)) return null;
  if (session.payment_status && session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return null;
  const goodsNet = Math.max(0, Math.round(Number(meta.goodsNet) || 0));
  const pct = Math.min(100, Math.max(0, Number(meta.commissionPct) || 0));
  // Doppelte Webhooks / Erfolgsseite: die Prüfung auf vorhandene orderId läuft innerhalb des atomaren Schreibvorgangs (CAS),
  // daher kann dieselbe Bestellung nie zweimal gebucht werden – auch nicht bei parallelen Aufrufen.
  const commission: Commission = {
    orderId: session.id,
    orderNumber: orderNumber(session.id),
    date: new Date(session.created * 1000).toISOString(),
    influencerId,
    code: (meta.ref ?? "").slice(0, 20),
    goodsNet,
    pct,
    amount: Math.round((goodsNet * pct) / 100),
    status: "vorgemerkt",
    paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
  };
  let added = false;
  await updateJSON<Commission[]>(KEYS.commissions, [], (current) => {
    added = false; // Callback kann bei Schreibkonflikt erneut laufen
    const all = asList<Commission>(current);
    if (all.some((c) => c.orderId === session.id)) return all;
    added = true;
    return [commission, ...all].slice(0, MAX_COMMISSIONS);
  });
  return added ? commission : null;
}

/** Provision stornieren (Bestellung storniert oder erstattet). Schon abgerechnete Provisionen werden in der nächsten Gutschrift abgezogen. */
export async function cancelCommission(match: { orderId?: string; paymentIntent?: string }): Promise<boolean> {
  let changed = false;
  await updateJSON<Commission[]>(KEYS.commissions, [], (current) => {
    changed = false;
    return asList<Commission>(current).map((c) => {
      const hit = (match.orderId && c.orderId === match.orderId) || (match.paymentIntent && c.paymentIntent === match.paymentIntent);
      if (!hit || c.status === "storniert") return c;
      changed = true;
      return { ...c, status: "storniert", cancelledAt: new Date().toISOString() };
    });
  });
  return changed;
}

/** Stornierung zurücknehmen (Bestellung wieder aktiv), solange sie noch nicht in einer Gutschrift verrechnet wurde */
export async function restoreCommission(orderId: string): Promise<boolean> {
  let changed = false;
  await updateJSON<Commission[]>(KEYS.commissions, [], (current) => {
    changed = false;
    return asList<Commission>(current).map((c) => {
      if (c.orderId !== orderId || c.status !== "storniert" || c.reversedIn) return c;
      changed = true;
      return { ...c, status: "vorgemerkt", cancelledAt: undefined };
    });
  });
  return changed;
}

/** Offene Positionen eines Monats: vorgemerkte Provisionen ohne Gutschrift + nachträgliche Stornos bereits abgerechneter Provisionen */
export function openLines(all: Commission[], influencerId: string, month: string) {
  const mine = all.filter((c) => c.influencerId === influencerId);
  const due = mine.filter((c) => c.status === "vorgemerkt" && !c.statementId && monthOf(c.date) <= month);
  const reversals = mine.filter((c) => c.status === "storniert" && c.statementId && !c.reversedIn);
  return { due, reversals };
}

/** Summen einer Gutschrift */
export function statementTotals(lines: StatementLine[], smallBusiness: boolean) {
  const net = lines.reduce((n, l) => n + l.amount, 0);
  const vatRate = smallBusiness ? 0 : 19;
  const vat = Math.round((net * vatRate) / 100);
  return { net, vatRate, vat, gross: net + vat };
}

export class StatementError extends Error {}

/** Gutschrift für einen (abgeschlossenen) Monat erstellen – nimmt auch ältere, noch offene Provisionen mit */
export async function createStatement(influencerId: string, month: string): Promise<Statement> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new StatementError("Ungültiger Monat.");
  if (month >= monthOf(new Date().toISOString())) throw new StatementError("Gutschriften gibt es erst nach Monatsende.");
  const inf = await getInfluencer(influencerId);
  if (!inf) throw new StatementError("Influencer nicht gefunden.");
  const c = (await getSettings()).company;
  const bank = await getInvoiceSettings();
  const issuer: InvoiceSeller = { name: c.name, owner: c.owner, street: c.street, city: c.city, country: c.country, email: c.email, phone: c.phone, vatId: c.vatId, register: c.register, iban: bank.iban, bic: bank.bic, bank: bank.bank };
  const recipient: StatementRecipient = { name: inf.name, alias: inf.alias, street: inf.street, zip: inf.zip, city: inf.city, taxNo: inf.taxNo, vatId: inf.vatId, smallBusiness: inf.smallBusiness, iban: inf.iban, accountHolder: inf.accountHolder, email: inf.email, code: inf.code };

  const id = randomBytes(8).toString("hex");
  let statement: Statement | undefined;
  // Erst die Provisionen der Gutschrift zuordnen (atomar), dann die Gutschrift speichern
  await updateJSON<Commission[]>(KEYS.commissions, [], (current) => {
    statement = undefined;
    const all = asList<Commission>(current);
    const { due, reversals } = openLines(all, influencerId, month);
    if (!due.length && !reversals.length) throw new StatementError("Für diesen Zeitraum gibt es keine offenen Provisionen.");
    const lines: StatementLine[] = [
      ...due.sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ orderNumber: x.orderNumber, date: x.date, goodsNet: x.goodsNet, pct: x.pct, amount: x.amount })),
      ...reversals.map((x) => ({ orderNumber: x.orderNumber, date: x.cancelledAt ?? x.date, goodsNet: -x.goodsNet, pct: x.pct, amount: -x.amount, storno: true })),
    ];
    const t = statementTotals(lines, inf.smallBusiness);
    statement = { id, number: "", month, influencerId, createdAt: new Date().toISOString(), lines, ...t, recipient, issuer, paid: false };
    const dueIds = new Set(due.map((x) => x.orderId));
    const revIds = new Set(reversals.map((x) => x.orderId));
    return all.map((x) => (dueIds.has(x.orderId) ? { ...x, statementId: id } : revIds.has(x.orderId) ? { ...x, reversedIn: id } : x));
  });
  if (!statement) throw new StatementError("Gutschrift konnte nicht erstellt werden.");
  const draft = statement as Statement;
  let saved: Statement | undefined;
  try {
    // Gutschriftnummer innerhalb des atomaren Schreibvorgangs vergeben: höchste vorhandene Nummer + 1 → nie doppelt
    await updateJSON<Statement[]>(KEYS.influencerStatements, [], (current) => {
      const all = asList<Statement>(current);
      const existing = all.find((x) => x.id === id);
      if (existing) {
        saved = existing;
        return all;
      }
      const prefix = `GS-${draft.createdAt.slice(0, 4)}-`;
      const max = all.filter((x) => x.number.startsWith(prefix)).reduce((m, x) => Math.max(m, Number(x.number.slice(prefix.length)) || 0), 0);
      saved = { ...draft, number: `${prefix}${String(max + 1).padStart(4, "0")}` };
      return [saved, ...all];
    });
  } catch (error) {
    // Bei Zeitüberschreitung kann die Gutschrift trotzdem gespeichert worden sein → erst nachsehen.
    // Nur wenn sicher feststeht, dass sie fehlt, wird die Zuordnung zurückgenommen (sonst drohte eine doppelte Abrechnung).
    let stored: Statement[] | undefined;
    try {
      stored = asList<Statement>(await getJSONStrict<Statement[]>(KEYS.influencerStatements, []));
    } catch {
      console.error("[provision] Gutschrift-Status unklar – Provisionen bleiben zugeordnet", id);
      throw error;
    }
    const existing = stored.find((x) => x.id === id);
    if (existing) return existing;
    // Ausgleich: Zuordnung der Provisionen zurücknehmen, damit sie in einer späteren Gutschrift wieder auftauchen
    await updateJSON<Commission[]>(KEYS.commissions, [], (current) =>
      asList<Commission>(current).map((x) => {
        if (x.statementId !== id && x.reversedIn !== id) return x;
        const copy = { ...x };
        if (copy.statementId === id) delete copy.statementId;
        if (copy.reversedIn === id) delete copy.reversedIn;
        return copy;
      }),
    ).catch((rollbackError) => console.error("[provision] Ausgleich nach Gutschrift-Fehler fehlgeschlagen", id, rollbackError));
    throw error;
  }
  return saved as Statement;
}

export async function setStatementPaid(id: string, paid: boolean): Promise<boolean> {
  let found = false;
  await updateJSON<Statement[]>(KEYS.influencerStatements, [], (current) => {
    found = false;
    return asList<Statement>(current).map((s) => {
      if (s.id !== id) return s;
      found = true;
      return paid ? { ...s, paid: true, paidAt: s.paidAt ?? new Date().toISOString() } : { ...s, paid: false, paidAt: undefined };
    });
  });
  return found;
}

/** Kennzahlen für Dashboard und Admin */
export function commissionStats(commissions: Commission[], statements: Statement[]) {
  const active = commissions.filter((c) => c.status === "vorgemerkt");
  const thisMonth = monthOf(new Date().toISOString());
  const paid = statements.filter((s) => s.paid);
  const unpaidStatements = statements.filter((s) => !s.paid);
  const pendingUnbilled = active.filter((c) => !c.statementId).reduce((n, c) => n + c.amount, 0);
  const reversalsOpen = commissions.filter((c) => c.status === "storniert" && c.statementId && !c.reversedIn).reduce((n, c) => n + c.amount, 0);
  // letzte 12 Monate
  const months: { month: string; amount: number; orders: number }[] = [];
  const now = new Date();
  for (let k = 11; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 15));
    const m = d.toISOString().slice(0, 7);
    const inMonth = active.filter((c) => monthOf(c.date) === m);
    months.push({ month: m, amount: inMonth.reduce((n, c) => n + c.amount, 0), orders: inMonth.length });
  }
  return {
    ordersTotal: active.length,
    ordersThisMonth: active.filter((c) => monthOf(c.date) === thisMonth).length,
    revenueNet: active.reduce((n, c) => n + c.goodsNet, 0),
    commissionTotal: active.reduce((n, c) => n + c.amount, 0),
    /** noch nicht abgerechnet (netto) */
    pendingUnbilled: pendingUnbilled - reversalsOpen,
    /** abgerechnet, aber noch nicht ausgezahlt (brutto) */
    unpaid: unpaidStatements.reduce((n, s) => n + s.gross, 0),
    paidOut: paid.reduce((n, s) => n + s.gross, 0),
    months,
  };
}
