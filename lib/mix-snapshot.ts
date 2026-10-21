/**
 * Mixpaket-Zusammensetzung zum Kaufzeitpunkt (Master-Auftrag AP2, 2.12) – rein, ohne Server-Abhängigkeiten.
 *
 * Problem: Privatbestellungen speichern bisher nur „handle:menge“. Ändert sich später die Zusammensetzung eines
 * Mixpakets in den Produktdaten, würden Büro-Ansichten, Sammellisten und Analysen eine alte Bestellung mit dem
 * NEUEN Inhalt zeigen. Lieferscheine und Freigaben halten den Inhalt bereits fest – die Bestellung selbst nicht.
 *
 * Lösung (zweistufig):
 * 1. LESEN (umgesetzt): Steht in den Stripe-Metadaten ein Feld `mix`, gilt dessen Inhalt statt der heutigen Produktdaten.
 * 2. SCHREIBEN (vorbereitet, NICHT aktiv – Checkout-Änderung braucht Orhans Freigabe): Der Checkout schreibt
 *    `metadata.mix = encodeMixSnapshot(...)`. Bis dahin haben Bestellungen kein `mix` → Verhalten unverändert.
 *
 * Format: „mix-handle=classic*1+tropical*1;mix-2=…“ (Stripe erlaubt je Metadatenwert höchstens 500 Zeichen).
 */
export type MixParts = [handle: string, trays: number][];

const HANDLE = /^[a-z0-9][a-z0-9-]{0,60}$/;
export const MIX_META_MAX = 500;

/** Zusammensetzung je Mixpaket-Handle → Metadatenwert. null, wenn nichts zu speichern ist oder es nicht passt. */
export function encodeMixSnapshot(mixes: Record<string, MixParts>): string | null {
  const parts = Object.entries(mixes)
    .filter(([h, c]) => HANDLE.test(h) && c.length && c.every(([s, n]) => HANDLE.test(s) && Number.isInteger(n) && n > 0 && n < 1000))
    .map(([h, c]) => `${h}=${c.map(([s, n]) => `${s}*${n}`).join("+")}`);
  if (!parts.length) return null;
  const out = parts.join(";");
  return out.length <= MIX_META_MAX ? out : null;
}

/** Metadatenwert → Zusammensetzung je Mixpaket. Ungültige Teile werden ignoriert (nie geraten). */
export function decodeMixSnapshot(raw: string | null | undefined): Map<string, MixParts> {
  const out = new Map<string, MixParts>();
  if (!raw || raw.length > MIX_META_MAX) return out;
  for (const part of raw.split(";")) {
    const [h, body] = part.split("=");
    if (!h || !body || !HANDLE.test(h)) continue;
    const items: MixParts = [];
    let ok = true;
    for (const x of body.split("+")) {
      const [s, n] = x.split("*");
      const trays = Number(n);
      if (!HANDLE.test(s ?? "") || !Number.isInteger(trays) || trays <= 0 || trays >= 1000) {
        ok = false;
        break;
      }
      items.push([s, trays]);
    }
    if (ok && items.length) out.set(h, items);
  }
  return out;
}
