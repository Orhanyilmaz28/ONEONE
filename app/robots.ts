import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";

/** Suchmaschinen: Shop-Seiten ja – Dashboard, Schnittstellen und Kasse nein */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/checkout/", "/konto"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
