import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(import.meta.dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },

  poweredByHeader: false,

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
