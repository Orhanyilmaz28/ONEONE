import { type CanPrices, STEPS, STEP_LABELS, type StepKey } from "./dealer-pricing";
import { DEPOSIT_PER_CAN } from "./format";

/**
 * Händler-Bestellung berechnen – ohne Server-Abhängigkeiten: die Bestellleiste rechnet live im Browser,
 * der Server rechnet beim Absenden mit den aktuellen Preisen noch einmal selbst (Browser-Werte zählen nie).
 *
 * Regeln (Händler-Konditionen):
 * - Dosenpreis nach Menge pro Sorte: ab 1, 2, 4, 8, 10 Trays (fehlt eine Stufe, gilt die nächstkleinere).
 * - Ab 120 Trays gesamt (Mischpalette) gilt für jede Sorte ihr Palettenpreis.
 * - Sorten nur mit Palettenpreis (z. B. Ice Coffee) sind erst ab 120 Trays gesamt bestellbar.
 * - Tray-Preis = Dosenpreis × Dosen je Tray (auf Cent gerundet).
 * - Versand wie im Shop (Kosten und „kostenlos ab“ aus den Einstellungen, bezogen auf den Warenwert brutto);
 *   ab Palette Lieferung per Spedition, Kosten nach Absprache.
 * - Alle Preise netto; 0,25 € Pfand je Dose bzw. Flasche; MwSt. auf Ware, Pfand und Versand.
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
  /** Dosenpreise je Mengenstufe (Cent, netto, bereits nach Stufe/individuell) */
  can: CanPrices;
  /** bestellbar: verfügbar, kein LKW-Artikel und mindestens ein Preis */
  orderable: boolean;
};

export type OrderLine = {
  handle: string;
  title: string;
  trays: number;
  units: number;
  /** Mengenstufe, deren Preis gilt (ältere Bestellungen: „t1“/„t2“) */
  tier: StepKey | "t1" | "t2";
  /** Dosenpreis in Cent */
  canPrice?: number;
  /** Preis je Tray in Cent */
  perTray: number;
  total: number;
};

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
  /** Sorten, die bei dieser Menge noch keinen Preis haben (z. B. Ice Coffee nur ab Palette) */
  blocked: string[];
};

/** Bezeichnung der geltenden Preisstufe */
export const TIER_LABELS = STEP_LABELS;

const STAIR = STEPS.filter((s) => s.key !== "pal");
const net = (grossCents: number) => Math.round(grossCents / (1 + DEALER_VAT / 100));

/** Ganze Trays 0…999; alles andere zählt als 0 */
export function cleanQty(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_TRAYS_PER_LINE) : 0;
}

/** Geltender Dosenpreis für eine Sorte bei dieser Menge */
export function priceFor(can: CanPrices, trays: number, totalTrays: number): { tier: StepKey; canPrice: number } | null {
  if (totalTrays >= PALLET_MIN_TRAYS && can.pal) return { tier: "pal", canPrice: can.pal };
  for (const s of [...STAIR].reverse()) {
    const v = can[s.key];
    if (trays >= s.min && v) return { tier: s.key, canPrice: v };
  }
  return null;
}

/** Nächste günstigere Stufe für eine Sorte (für den Hinweis „noch 2 Trays → 0,36 €“) */
export function nextCheaper(can: CanPrices, trays: number, totalTrays: number): { missing: number; canPrice: number } | null {
  const now = priceFor(can, trays, totalTrays);
  if (now?.tier === "pal") return null;
  for (const s of STAIR) {
    const v = can[s.key];
    if (s.min > trays && v && (!now || v < now.canPrice)) return { missing: s.min - trays, canPrice: v };
  }
  return null;
}

export function calcDealerOrder(rows: OrderRow[], qty: Record<string, number>, shipping: { cost: number; freeFrom: number }): OrderCalc {
  const chosen = rows.filter((r) => r.orderable && cleanQty(qty[r.handle]) > 0);
  const trays = chosen.reduce((n, r) => n + cleanQty(qty[r.handle]), 0);
  const pallet = trays >= PALLET_MIN_TRAYS;
  const blocked: string[] = [];
  const lines: OrderLine[] = chosen.flatMap((r) => {
    const t = cleanQty(qty[r.handle]);
    const price = priceFor(r.can, t, trays);
    if (!price) {
      blocked.push(r.title);
      return [];
    }
    const perTray = Math.round(price.canPrice * r.perTray);
    return [{ handle: r.handle, title: r.title, trays: t, units: t * r.perTray, tier: price.tier, canPrice: price.canPrice, perTray, total: perTray * t }];
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
    blocked,
  };
}
