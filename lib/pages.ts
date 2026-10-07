import pages from "@/data/pages.json";
import type { ImportedPage } from "./types";

/** Aus Shopify importierte Rechtstexte (Impressum, Datenschutz, AGB, Widerruf, Versand). */
export function getImportedPage(slug: string): ImportedPage | undefined {
  return (pages as Record<string, ImportedPage>)[slug];
}
