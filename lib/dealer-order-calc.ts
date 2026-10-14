import { DEPOSIT_PER_CAN } from "./format";

/**
 * Händler-Bestellung berechnen – ohne Server-Abhängigkeiten: die Bestellleiste rechnet live im Browser,
 * der Server rechnet beim Absenden mit den aktuellen Preisen noch einmal selbst (Browser-Werte zählen nie).
 *
 * Regeln:
 * - Staffel nach der Gesamtmenge der Bestellung (Sorten gemischt): 1 Tray → Preis „1 Tray“, ab 2 Trays → „ab 2 Trays“.
 * - Ab 120 Trays gesamt (Mischpalette) gilt für jede Sorte ihr Palettenpreis je Tray (Palettenpreis ÷ Trays je Palette).
 * - Versand wie im Shop (Kosten und „kostenlos ab“ aus den Einstellungen, bezogen auf den Warenwert brutto);
 *   ab Palette Lieferung per Spedition, Kosten nach Absprache.
 * - Alle Händlerpreise netto; 0,25 € Pfand je Dose bzw. Flasche; MwSt. auf Ware, Pfand und Versand.
 */
export const PALLET_MIN_TRAYS = 120;
/** MwSt.-Satz in Prozent (gilt derzeit für alle Artikel – bei Bedarf hier je Artikel unterscheiden) */
export const DEALER_VAT = 19;
/** Obergrenze je Sorte und Bestellung (größere Mengen bitte per Anfrage) */
export const MAX_TRAYS_PER_LINE = 999;

export type OrderRow = {
  handle: string;
  title: string;
  /** Dosen bzw. Flaschen je Tray */
  perTray: number;
  /** Trays je Palette laut Artikelpass */
  palletTrays?: number;
  t1?: number;
  t2?: number;
  pal?: number;
  /** bestellbar: verfügbar, kein LKW-Artikel und ein Tray-Preis (1 Tray oder ab 2 Trays) */
  orderable: boolean;
};

export type PriceTier = "t1" | "t2" | "pal";
export type OrderLine = { handle: string; title: string; trays: number; units: number; tier: PriceTier; perTray: number; total: number };

export type OrderCalc = {
  lines: OrderLine[];
  trays: number;
  units: number;
  pallet: boolean;
  goodsNet: number;
  depositNet: number;
  /** null = Spedition, Kosten nach Absprache */
  shippingNet: number | null;
  shippingLabel: string;
  net: number;
  vat: number;
  gross: number;
  /** Trays bis zum Palettenpreis (0 = erreicht) */
  toPallet: number;
};

export const TIER_LABELS: Record<PriceTier, string> = { t1: "1 Tray", t2: "ab 2 Trays", pal: "Palettenpreis" };

const net = (grossCents: number) => Math.round(grossCents / (1 + DEALER_VAT / 100));

/** Ganze Trays 0…999; alles andere zählt als 0 */
export function cleanQty(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_TRAYS_PER_LINE) : 0;
}

function tierPrice(row: OrderRow, totalTrays: number): { tier: PriceTier; perTray: number } | null {
  if (totalTrays >= PALLET_MIN_TRAYS && row.pal && row.palletTrays) return { tier: "pal", perTray: Math.round(row.pal / row.palletTrays) };
  if (totalTrays >= 2 && row.t2) return { tier: "t2", perTray: row.t2 };
  if (row.t1) return { tier: "t1", perTray: row.t1 };
  if (row.t2) return { tier: "t2", perTray: row.t2 };
  return null;
}

export function calcDealerOrder(rows: OrderRow[], qty: Record<string, number>, shipping: { cost: number; freeFrom: number }): OrderCalc {
  const chosen = rows.filter((r) => r.orderable && cleanQty(qty[r.handle]) > 0);
  const trays = chosen.reduce((n, r) => n + cleanQty(qty[r.handle]), 0);
  const pallet = trays >= PALLET_MIN_TRAYS;
  const lines: OrderLine[] = chosen.flatMap((r) => {
    const t = cleanQty(qty[r.handle]);
    const price = tierPrice(r, trays);
    if (!price) return [];
    return [{ handle: r.handle, title: r.title, trays: t, units: t * r.perTray, tier: price.tier, perTray: price.perTray, total: price.perTray * t }];
  });
  const units = lines.reduce((n, l) => n + l.units, 0);
  const goodsNet = lines.reduce((n, l) => n + l.total, 0);
  const depositNet = units * DEPOSIT_PER_CAN;

  let shippingNet: number | null = 0;
  let shippingLabel = "Versand";
  if (pallet && lines.length) {
    shippingNet = null;
    shippingLabel = "Lieferung per Spedition – Kosten nach Absprache";
  } else if (shipping.cost > 0) {
    const goodsGross = Math.round(goodsNet * (1 + DEALER_VAT / 100));
    if (!(shipping.freeFrom > 0 && goodsGross >= shipping.freeFrom)) shippingNet = net(shipping.cost);
  }

  const sumNet = goodsNet + depositNet + (shippingNet ?? 0);
  const vat = Math.round((sumNet * DEALER_VAT) / 100);
  return {
    lines,
    trays,
    units,
    pallet,
    goodsNet,
    depositNet,
    shippingNet,
    shippingLabel,
    net: sumNet,
    vat,
    gross: sumNet + vat,
    toPallet: trays > 0 && !pallet ? PALLET_MIN_TRAYS - trays : 0,
  };
}
