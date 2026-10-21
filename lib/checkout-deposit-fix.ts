/**
 * Pfand-Korrektur A (aktiv seit 21.10.2026, von Orhan freigegeben): Rabatte nur auf Waren, nie auf das Einwegpfand.
 *
 * Früher (bis 21.10.2026) hat der Checkout Mix-/Code-Rabatte als Stripe-Gutschein ohne `applies_to` angehängt; Stripe
 * hat den Betrag dann auch auf die Pfandzeile verteilt. Jetzt baut app/api/checkout/route.ts die Warenpositionen mit
 * `discountedGoodsLines` (Rabatt im Positionspreis, Pfand unverändert, kein Gutschein). Rein, ohne Netz – vollständig testbar.
 */
export type GoodsLine = { handle: string; title: string; unitAmount: number; quantity: number; cansPerUnit: number };

/**
 * Rabatt (Cent) auf Warenpositionen verteilen – anteilig nach Positionswert, Rest-Cent nach dem größten Rest
 * (Summe immer exakt = Rabatt, keine Position unter 0).
 */
export function allocate(amounts: number[], discount: number): number[] {
  const total = amounts.reduce((n, a) => n + a, 0);
  const d = Math.max(0, Math.min(Math.round(discount), total));
  if (!total || !d) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a * d) / total);
  const base = raw.map(Math.floor);
  let rest = d - base.reduce((n, b) => n + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (rest <= 0) break;
    base[o.i]++;
    rest--;
  }
  return base;
}

/**
 * Nachbildung des heutigen Verhaltens (Gutschein ohne `applies_to`): Rabatt anteilig auf ALLE Positionen inkl. Pfand.
 * Hinweis: Stripes genaue Rundungsregel ist nicht dokumentiert – das ist eine Simulation (anteilig + größter Rest).
 */
export function simulateCurrent(lines: GoodsLine[], discount: number, depositPerCan = 25) {
  const goods = lines.map((l) => l.unitAmount * l.quantity);
  const cans = lines.reduce((n, l) => n + l.cansPerUnit * l.quantity, 0);
  const deposit = cans * depositPerCan;
  const parts = allocate([...goods, deposit], discount);
  return {
    lines: lines.map((l, i) => ({ title: l.title, quantity: l.quantity, subtotal: goods[i], discount: parts[i], total: goods[i] - parts[i] })),
    deposit: { cans, subtotal: deposit, discount: parts[lines.length], total: deposit - parts[lines.length] },
  };
}

export type StripeLinePlan = { title: string; quantity: number; unitAmount: number; handle: string };

/**
 * Korrigierte Positionen: Rabatt nur auf Waren, im Positionspreis enthalten. Weil Stripe nur ganze Cent je Stück kennt,
 * wird eine Position bei Bedarf in zwei Zeilen geteilt (z. B. 2 × 17,10 € und 1 × 17,11 €) – die Summe ist exakt.
 * Pfand bleibt 0,25 € je Dose. Kein Gutschein → Stripe verteilt nichts.
 */
export function discountedGoodsLines(lines: GoodsLine[], discount: number, depositPerCan = 25) {
  const goods = lines.map((l) => l.unitAmount * l.quantity);
  const parts = allocate(goods, discount);
  const out: StripeLinePlan[] = [];
  lines.forEach((l, i) => {
    const total = goods[i] - parts[i];
    const per = Math.floor(total / l.quantity);
    const extra = total - per * l.quantity; // so viele Stück bekommen 1 Cent mehr
    if (l.quantity - extra > 0) out.push({ title: l.title, quantity: l.quantity - extra, unitAmount: per, handle: l.handle });
    if (extra > 0) out.push({ title: l.title, quantity: extra, unitAmount: per + 1, handle: l.handle });
  });
  const cans = lines.reduce((n, l) => n + l.cansPerUnit * l.quantity, 0);
  return { lines: out, perLineDiscount: parts, deposit: { cans, unitAmount: depositPerCan, total: cans * depositPerCan } };
}

/** Kontrollsumme für beide Wege: Ware − Rabatt + Pfand + Versand */
export const expectedTotal = (lines: GoodsLine[], discount: number, shipping: number, depositPerCan = 25) =>
  lines.reduce((n, l) => n + l.unitAmount * l.quantity, 0) - discount + lines.reduce((n, l) => n + l.cansPerUnit * l.quantity, 0) * depositPerCan + shipping;
