import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS, dealerUnit } from "@/lib/dealer-catalog";
import { getCurrentDealer } from "@/lib/dealer-auth";
import { lkwOnly } from "@/lib/lkw";
import { PRODUCT_SPECS } from "@/lib/product-specs";

/** Stammdaten aller Artikel als CSV (Semikolon, UTF-8 mit BOM – öffnet sich direkt in Excel) – nur für freigegebene Händler */
export const dynamic = "force-dynamic";

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  // Formeln nie ausführen lassen (CSV-Injection) und Trennzeichen/Zeilenumbrüche sicher einschließen
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET() {
  if (!(await getCurrentDealer())) return new Response("Bitte melde dich im Händlerbereich an.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const products = await getProducts();
  const head = ["Bereich", "Artikel", "Art.-Nr.", "EAN Einzelstück", "Bezeichnung", "Einheit", "Gebinde", "Tray", "Palette", "Stück je Palette", "MHD", "Lagerung", "Vegan", "Bestellung"];
  const rows = DEALER_GROUPS.flatMap((g) =>
    products.filter(g.test).map((p) => {
      const s = PRODUCT_SPECS[p.handle];
      return [
        g.title,
        p.title,
        s?.artNr,
        s?.gtin,
        s?.bezeichnung,
        dealerUnit(p),
        s?.gebinde,
        s?.tray,
        s?.palette,
        s?.units,
        s?.mhd,
        s?.lagerung,
        s?.vegan ? "ja" : "",
        lkwOnly(p) ? "nur per LKW auf Anfrage" : "ab 1 Tray",
      ];
    }),
  );
  const csv = `﻿${[head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="exstase-stammdaten.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
