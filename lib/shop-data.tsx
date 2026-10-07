"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { AiOverrides } from "./ai-media";
import { getRating, type RatingSummary } from "./reviews";
import { DEFAULT_SETTINGS, type PublicSettings } from "./settings-defaults";
import type { Product } from "./types";

/**
 * Aktuelle Produkte (mit Dashboard-Änderungen), öffentliche Einstellungen und
 * Bewertungsschnitte (feste + im Dashboard veröffentlichte Bewertungen) für Client-Komponenten.
 */
type ShopData = {
  products: Product[];
  settings: PublicSettings;
  /** Bewertungsschnitt je Produkt-Handle; fehlt ein Produkt, hat es keine Bewertungen */
  ratings?: Record<string, RatingSummary>;
  /** Kundenkonten eingeschaltet? (dann Konto-Symbol im Kopf) */
  accounts?: boolean;
  /** KI-Kennzeichnung aus dem Dashboard (Medium → Art) */
  aiMedia?: AiOverrides;
};

const ShopDataContext = createContext<ShopData>({ products: [], settings: DEFAULT_SETTINGS });

export function ShopDataProvider({ products, settings, ratings, accounts, aiMedia, children }: ShopData & { children: ReactNode }) {
  return <ShopDataContext.Provider value={{ products, settings, ratings, accounts, aiMedia }}>{children}</ShopDataContext.Provider>;
}

export function useShopData() {
  return useContext(ShopDataContext);
}

const NO_RATING: RatingSummary = { count: 0, average: 0 };

/** Bewertungsschnitt eines Produkts – inklusive freigegebener Shop-Bewertungen */
export function useRating(handle: string): RatingSummary {
  const { ratings } = useContext(ShopDataContext);
  // Ohne Provider (z. B. in Tests) nur die festen Bewertungen
  return ratings ? (ratings[handle] ?? NO_RATING) : getRating(handle);
}
