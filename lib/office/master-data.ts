import { SORT_NAMES, trayCans } from "../pack-contents";
import { PRODUCT_SPECS } from "../product-specs";
import type { Product } from "../types";

/**
 * „Artikelstammdaten prüfen“ (Phase 3C): findet Lücken und Widersprüche in den Produktdaten, die Lieferscheine,
 * Listen und Freigaben betreffen. Nur Lesen – es wird nichts geändert, nichts ergänzt und nichts erfunden.
 * Ohne Server-Abhängigkeiten (testbar).
 */
export type MasterIssueKind = "sku_fehlt" | "sku_doppelt" | "einheit_fehlt" | "sorte_fehlt" | "tray_widerspruch" | "mix_unvollstaendig";
export const MASTER_LABEL: Record<MasterIssueKind, string> = {
  sku_fehlt: "Artikelnummer fehlt",
  sku_doppelt: "Artikelnummer doppelt",
  einheit_fehlt: "Verpackungseinheit fehlt",
  sorte_fehlt: "Sorten-ID fehlt",
  tray_widerspruch: "Widersprüchliche Tray-Angaben",
  mix_unvollstaendig: "Mixpaket-Zusammensetzung unvollständig",
};
export type MasterIssue = { handle: string; product: string; kind: MasterIssueKind; field: string; detail: string; fix: string };

const isMix = (p: Product) => Boolean(p.contents?.length || p.collections?.includes("mixpakete"));

export function checkMasterData(products: Product[], specs: Record<string, { artNr?: string; units?: number }> = PRODUCT_SPECS, sortNames: Record<string, string> = SORT_NAMES): MasterIssue[] {
  const out: MasterIssue[] = [];
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const skuOwners = new Map<string, string[]>();
  for (const p of products) {
    const sku = specs[p.handle]?.artNr?.trim();
    if (sku) skuOwners.set(sku, [...(skuOwners.get(sku) ?? []), p.handle]);
  }
  for (const p of [...products].sort((a, b) => a.title.localeCompare(b.title, "de"))) {
    const add = (kind: MasterIssueKind, field: string, detail: string, fix: string) => out.push({ handle: p.handle, product: p.title, kind, field, detail, fix });
    const spec = specs[p.handle];
    const mix = isMix(p);
    if (!spec?.artNr?.trim()) add("sku_fehlt", "Artikelnummer (Artikelpass)", spec ? "Artikelpass vorhanden, aber ohne Artikelnummer." : "Kein Artikelpass hinterlegt.", "Artikelnummer vom Hersteller bzw. aus der Warenwirtschaft eintragen (lib/product-specs.ts) – nicht ausdenken.");
    else {
      const owners = skuOwners.get(spec.artNr.trim()) ?? [];
      if (owners.length > 1) add("sku_doppelt", "Artikelnummer", `${spec.artNr} ist auch bei ${owners.filter((h) => h !== p.handle).map((h) => byHandle.get(h)?.title ?? h).join(", ")} eingetragen.`, "Richtige Artikelnummer je Sorte beim Hersteller prüfen und korrigieren.");
    }
    if (!p.variants?.length || p.variants.some((v) => !v.title?.trim())) add("einheit_fehlt", "Variante / Verpackungseinheit", p.variants?.length ? "Eine Variante hat keinen Namen (z. B. „24er Tray“)." : "Keine Variante angelegt.", "Verpackungseinheit in der Produktverwaltung eintragen.");
    if (!mix && !sortNames[p.handle]) add("sorte_fehlt", "Sorten-ID (Sortenname für Listen)", "Kein Eintrag in der Sortenliste – Listen zeigen dann den Produktnamen.", "Sortennamen in lib/pack-contents.ts (SORT_NAMES) ergänzen.");
    for (const v of p.variants ?? []) {
      const titleCount = Number(/(\d+)\s*(?:er\b|dosen|flaschen|stück)/i.exec(v.title ?? "")?.[1] ?? 0);
      if (!mix) {
        const tray = trayCans(p.handle);
        if (v.cans && v.cans % tray !== 0) add("tray_widerspruch", `Variante „${v.title}“`, `${v.cans} Stück passen nicht zu ${tray} je Tray.`, "Stückzahl der Variante oder Tray-Größe prüfen.");
        if (titleCount && v.cans && titleCount !== v.cans) add("tray_widerspruch", `Variante „${v.title}“`, `Name nennt ${titleCount}, gespeichert sind ${v.cans} Stück.`, "Namen oder Stückzahl der Variante angleichen.");
        if (!v.cans && !titleCount) add("tray_widerspruch", `Variante „${v.title}“`, "Stückzahl je Einheit unbekannt.", "Stückzahl (Dosen/Flaschen je Einheit) eintragen.");
      }
    }
    if (!mix && spec?.units && spec.units % trayCans(p.handle) !== 0) add("tray_widerspruch", "Palette (Artikelpass)", `${spec.units} Stück je Palette ist kein Vielfaches von ${trayCans(p.handle)} je Tray.`, "Palettenangabe im Artikelpass prüfen.");
    if (mix) {
      if (!p.contents?.length) add("mix_unvollstaendig", "Inhalt des Mixpakets", "Keine Zusammensetzung hinterlegt – Lieferscheine und Sammellisten können den Inhalt nicht nennen.", "Zusammensetzung (Sorte und Anzahl Trays) in der Produktverwaltung eintragen.");
      else {
        const unknown = p.contents.filter(([h]) => !byHandle.has(h)).map(([h]) => h);
        if (unknown.length) add("mix_unvollstaendig", "Inhalt des Mixpakets", `Unbekannte Sorte(n): ${unknown.join(", ")}.`, "Sorten im Mixpaket auf vorhandene Produkte ändern.");
        const bad = p.contents.filter(([, n]) => !Number.isInteger(n) || n <= 0);
        if (bad.length) add("mix_unvollstaendig", "Inhalt des Mixpakets", "Anzahl Trays fehlt oder ist ungültig.", "Anzahl Trays je Sorte eintragen.");
        const sum = p.contents.reduce((n, [h, t]) => n + t * trayCans(h), 0);
        for (const v of p.variants ?? []) if (v.cans && v.cans !== sum) add("tray_widerspruch", `Variante „${v.title}“`, `Variante nennt ${v.cans} Stück, die Zusammensetzung ergibt ${sum}.`, "Zusammensetzung oder Stückzahl der Variante angleichen.");
      }
    }
  }
  return out;
}
