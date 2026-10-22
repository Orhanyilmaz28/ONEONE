/**
 * Firmendaten für Impressum, AGB, Widerruf, Datenschutz und Geschäftsdokumente – öffentliche Angaben.
 *
 * Diese Werte sind die STANDARDWERTE. Live gilt, was im Dashboard unter „Einstellungen → Firmendaten“ gespeichert ist
 * (tt:settings). Weicht der gespeicherte Stand ab, zeigt das Dashboard einen Abgleich mit „Betreiberangaben übernehmen“.
 *
 * Interne Angaben (Steuernummer, Bankverbindung) stehen bewusst NICHT hier – das Repository ist öffentlich.
 * Sie werden im Dashboard unter „Händler → Rechnungsdaten“ gepflegt und nur dort ausgegeben, wo sie gebraucht werden.
 *
 * Sichtbare Domain (Impressum): „domain“ – außer NEXT_PUBLIC_SITE_URL zeigt schon auf eine eigene Domain.
 */

/** Geschäftsführer in verbindlicher Reihenfolge (Angabe des Betreibers vom 21.10.2026) */
export const MANAGING_DIRECTORS = ["Christopher Walich", "Orhan Yilmaz"] as const;

export const company = {
  name: "Exstase Großhandel GmbH",
  brand: "EXSTASE Energy",
  domain: "exstaseshop.com",
  owner: `Geschäftsführer: ${MANAGING_DIRECTORS.join(", ")}`,
  street: "Carl-Kühne-Str. 4",
  city: "47638 Straelen",
  country: "Deutschland",
  email: "hello@exstaseshop.com",
  phone: "0211 157 759-0",
  fax: "0211 157 759-29",
  website: "https://exstaseshop.com",
  vatId: "DE311899184",
  register: "Amtsgericht Düsseldorf, HRB 90042",
};

/**
 * Domain, die Kund:innen angezeigt wird. Technische Vercel-Adressen (*.vercel.app) und localhost werden nie genannt,
 * dann gilt die feste Angabe „exstaseshop.com“. Steht in NEXT_PUBLIC_SITE_URL eine eigene Domain, wird diese angezeigt.
 */
export function publicDomain(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  try {
    const host = new URL(siteUrl ?? "").hostname.toLowerCase().replace(/^www\./, "");
    if (host && host !== "localhost" && !host.endsWith(".vercel.app") && host.includes(".")) return host;
  } catch {
    // feste Angabe
  }
  return company.domain;
}

/**
 * Stand der Betreiberangaben. Die Registerangaben (Geschäftsführer, HRB) stammen vom Betreiber und konnten nicht
 * gegen einen amtlichen Registerauszug geprüft werden → vor Veröffentlichung mit aktuellem Handelsregisterauszug abgleichen.
 */
export const COMPANY_DATA_SOURCE = { providedAt: "2026-10-21", providedBy: "Betreiber (Orhan Yilmaz)", registerVerified: false } as const;
