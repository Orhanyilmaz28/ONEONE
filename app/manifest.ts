import type { MetadataRoute } from "next";
import { catalog } from "@/lib/catalog";

/**
 * Web-App-Manifest: Name, Farben und Symbol, wenn jemand den Shop
 * auf dem Handy „Zum Startbildschirm hinzufügen“ wählt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EXSTASE Energy – Energy Drinks",
    short_name: "EXSTASE",
    description: catalog.brand.description ?? catalog.brand.tagline,
    lang: "de",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030303",
    theme_color: "#030303",
    categories: ["shopping", "food", "lifestyle"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Alle Produkte", short_name: "Shop", url: "/products" },
      { name: "Energy Drinks", url: "/collections/energy" },
      { name: "Zero", url: "/collections/zero" },
      { name: "Kontakt & Hilfe", short_name: "Hilfe", url: "/kontakt" },
    ],
  };
}
