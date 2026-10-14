import type { DealerRow } from "./dealer-catalog";
import type { Dealer } from "./dealer-store";
import { DEPOSIT_PER_CAN } from "./format";

/** Händler-Bestellungen: Typen und Preisberechnung – ohne Server-Abhängigkeiten, damit auch der Browser die Summe live rechnen kann */

export type DealerOrderStatus = "neu" | "bestaetigt" | "versendet" | "erledigt" | "storniert";

export const DEALER_ORDER_STATUS: Record<DealerOrderStatus, string> = {
  neu: "Neu",
  bestaetigt: "Bestätigt",
  versendet: "Versendet",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

export type DealerOrderLine = {
  handle: string;
  title: string;
  /** „Tray“ oder „Palette“ */
  kind: "tray" | "palette";
  quantity: number;
  /** Netto-Preis je Tray bzw. Palette in Cent */
  unitPrice: number;
  /** Dosen/Flaschen in dieser Position (für das Pfand) */
  cans: number;
  total: number;
};

export type DealerOrder = {
  id: string;
  /** Kurze Nummer, z. B. „H-4F7K2Q“ */
  number: string;
  createdAt: string;
  status: DealerOrderStatus;
  updatedAt?: string;
  dealer: Pick<Dealer, "id" | "company" | "contact" | "email" | "phone" | "street" | "zip" | "city" | "vatId">;
  lines: DealerOrderLine[];
  /** Warenwert netto in Cent */
  net: number;
  /** Einwegpfand netto in Cent */
  deposit: number;
  note: string;
};

/** Höchstmenge je Artikel (Trays) – darüber bitte direkt anfragen */
export const MAX_TRAYS = 999;
/**
 * Preise für eine Menge Trays eines Artikels:
 * ganze Paletten zum Palettenpreis (falls hinterlegt), der Rest je Tray – 1 Tray zum Preis „1 Tray“, ab 2 Trays zum Preis „ab 2 Trays“.
 */
export function priceLines(row: Pick<DealerRow, "handle" | "title" | "perTray" | "trays" | "t1" | "t2" | "pal">, trays: number): DealerOrderLine[] {
  const lines: DealerOrderLine[] = [];
  let rest = trays;
  if (row.trays && row.pal.value && rest >= row.trays) {
    const pallets = Math.floor(rest / row.trays);
    rest -= pallets * row.trays;
    lines.push({ handle: row.handle, title: row.title, kind: "palette", quantity: pallets, unitPrice: row.pal.value, cans: pallets * row.trays * row.perTray, total: pallets * row.pal.value });
  }
  if (rest > 0) {
    const unit = trays >= 2 ? (row.t2.value ?? row.t1.value) : row.t1.value;
    if (!unit) return [];
    lines.push({ handle: row.handle, title: row.title, kind: "tray", quantity: rest, unitPrice: unit, cans: rest * row.perTray, total: rest * unit });
  }
  return lines;
}

export function sumLines(lines: DealerOrderLine[]) {
  const net = lines.reduce((a, l) => a + l.total, 0);
  const deposit = lines.reduce((a, l) => a + l.cans, 0) * DEPOSIT_PER_CAN;
  return { net, deposit };
}
