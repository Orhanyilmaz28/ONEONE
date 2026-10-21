// Reine Typen und Standardwerte – darf auch im Browser geladen werden
import { company as defaultCompany } from "./company";

/** Im Dashboard änderbare Shop-Einstellungen */
export type Settings = {
  company: {
    name: string;
    brand: string;
    owner: string;
    street: string;
    city: string;
    country: string;
    email: string;
    phone: string;
    /** Telefax (freiwillige Angabe) */
    fax: string;
    /** Unternehmenswebsite (freiwillige Angabe) */
    website: string;
    vatId: string;
    register: string;
  };
  shipping: {
    /** Versandkosten Standard in Cent (inkl. MwSt.) – 0 = Versand immer kostenlos */
    cost: number;
    /** Kostenloser Standardversand ab diesem Warenwert in Cent – 0 = keine Grenze (es gilt immer `cost`) */
    freeFrom: number;
    /** Express-Versand in Cent – 0 = Express wird nicht angeboten */
    express: number;
  };
  /** Widerruf: Rücksendung der Ware */
  returns: {
    /**
     * Wer trägt die unmittelbaren Kosten der Rücksendung, wenn Kund:innen widerrufen?
     * „kunde“ = Kund:innen zahlen das Porto (nur wirksam, weil es so in der Widerrufsbelehrung steht),
     * „haendler“ = der Shop übernimmt die Kosten.
     */
    paidBy: ReturnCostPayer;
  };
  /** Optionaler Hinweis-Text für Aktionen (leer = aus) */
  announcement: string;
};

/** Wer zahlt die Rücksendung bei einem Widerruf? */
export type ReturnCostPayer = "kunde" | "haendler";

export function isReturnCostPayer(value: unknown): value is ReturnCostPayer {
  return value === "kunde" || value === "haendler";
}

/**
 * Amtlicher Satz für die Widerrufsbelehrung (Muster nach Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB, Gestaltungshinweis 5).
 * Steht im Shop unter /widerruf und auf Seite 2 des Lieferscheins.
 */
export const RETURN_COST_SENTENCE: Record<ReturnCostPayer, string> = {
  kunde: "Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.",
  haendler: "Wir tragen die Kosten der Rücksendung der Waren.",
};

export const DEFAULT_SETTINGS: Settings = {
  company: {
    name: defaultCompany.name,
    brand: defaultCompany.brand,
    owner: defaultCompany.owner,
    street: defaultCompany.street,
    city: defaultCompany.city,
    country: defaultCompany.country,
    email: defaultCompany.email,
    phone: defaultCompany.phone,
    fax: defaultCompany.fax,
    website: defaultCompany.website,
    vatId: defaultCompany.vatId,
    register: defaultCompany.register,
  },
  shipping: { cost: 590, freeFrom: 6900, express: 0 },
  returns: { paidBy: "kunde" },
  announcement: "",
};

/** Freiwillige Firmenangaben – dürfen leer bleiben, ohne als „fehlt“ zu gelten */
export const OPTIONAL_COMPANY_FIELDS: readonly (keyof Settings["company"])[] = ["fax", "website"];

/** Felder, die noch Platzhalter wie „[Telefonnummer]“ enthalten */
export function missingCompanyFields(settings: Settings): (keyof Settings["company"])[] {
  return (Object.keys(settings.company) as (keyof Settings["company"])[]).filter((k) => {
    if (OPTIONAL_COMPANY_FIELDS.includes(k)) return false;
    const v = settings.company[k];
    return !v || /^\[.*\]$/.test(v.trim());
  });
}

/** Teil der Einstellungen, der im Browser gebraucht wird */
export type PublicSettings = Pick<Settings, "shipping" | "announcement">;

/* ───────────── Geschäftsführer ───────────── */

/**
 * „Geschäftsführer: Christopher Walich, Orhan Yilmaz“ → ["Christopher Walich", "Orhan Yilmaz"]
 * Reihenfolge bleibt erhalten. Trennzeichen: Komma, Semikolon, „und“, „&“. Anrede „Herr/Frau“ wird entfernt.
 */
export function managersOf(owner: string): string[] {
  const body = (owner ?? "").trim().replace(/^[^:]*:\s*/, "");
  if (!body || /^\[.*\]$/.test(body)) return [];
  return body
    .split(/\s*(?:,|;|\bund\b|&)\s*/)
    .map((n) => n.replace(/^(Herr|Frau)\s+/i, "").trim())
    .filter(Boolean);
}

/* ───────────── Abgleich mit den Betreiberangaben ───────────── */

export type CompanyDiff = { key: keyof Settings["company"]; stored: string; expected: string };

/** Welche gespeicherten Firmenangaben weichen von den Betreiberangaben (Standardwerte) ab? Markenname ausgenommen. */
export function companyDiff(stored: Settings["company"], expected: Settings["company"] = DEFAULT_SETTINGS.company): CompanyDiff[] {
  const norm = (k: keyof Settings["company"], v: string) => {
    const t = String(v ?? "").replace(/\s+/g, " ").trim();
    return k === "vatId" ? t.toUpperCase().replace(/[\s.\-/]/g, "") : t;
  };
  return (Object.keys(expected) as (keyof Settings["company"])[])
    .filter((k) => k !== "brand")
    .filter((k) => norm(k, stored[k]) !== norm(k, expected[k]))
    .map((k) => ({ key: k, stored: String(stored[k] ?? ""), expected: expected[k] }));
}
