import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },

  poweredByHeader: false,

  // Mitgelieferte Artikelpässe (PDF) müssen mit in die Serverfunktion der Download-Route
  outputFileTracingIncludes: {
    "/haendler/portal/pass/[key]": ["./data/artikelpaesse/**/*"],
    // Schrift für die Vorschaubilder (Link-Vorschau bei WhatsApp & Co.)
    "/opengraph-image": ["./assets/fonts/**/*"],
  },

  // Grundschutz: kein Einbetten in fremde Seiten (Klick-Fallen), keine Typ-Raterei, sparsame Weitergabe der Herkunft
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Inhaltsschutz ohne Risiko für Skripte: keine Plugins, kein fremdes <base>, Einbetten nur auf eigenen Seiten
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
        ],
      },
    ];
  },

  images: {
    qualities: [75, 90],
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "*.myshopify.com",
      },
    ],
  },
};

export default nextConfig;
