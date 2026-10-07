import type { MetadataRoute } from "next";
import { catalog, getProducts } from "@/lib/catalog";
import { SITE_URL } from "@/lib/format";

/** Sitemap für Google & Co. – ausgeblendete Produkte erscheinen nicht */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const abs = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path}`);
  const shopPages = ["", "/products", "/palette", "/haendler", "/kontakt", "/versand"];
  const legalPages = ["/widerruf", "/impressum", "/datenschutz", "/agb"];
  return [
    ...shopPages.map((p) => ({ url: abs(p), changeFrequency: "weekly" as const, priority: p ? 0.6 : 1 })),
    ...catalog.collections.map((c) => ({
      url: abs(`/collections/${c.handle}`),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: c.image ? [abs(c.image)] : undefined,
    })),
    ...(await getProducts()).map((p) => ({
      url: abs(`/products/${p.handle}`),
      changeFrequency: "weekly" as const,
      priority: 0.9,
      images: p.images.slice(0, 3).map((i) => abs(i.src)),
    })),
    ...legalPages.map((p) => ({ url: abs(p), changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
