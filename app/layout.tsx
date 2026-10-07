import type { Metadata, Viewport } from "next";
import { Exo_2 } from "next/font/google";
import Script from "next/script";
import { CartDrawer } from "@/components/cart-drawer";
import { Enhance } from "@/components/enhance";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { HelpButton } from "@/components/help-button";
import { ShopChrome } from "@/components/shop-chrome";
import { CartProvider } from "@/lib/cart";
import { catalog, getProducts } from "@/lib/catalog";
import { getAiOverrides } from "@/lib/ai-media-store";
import { getAccountsConfig } from "@/lib/customers";
import { SITE_URL } from "@/lib/format";
import { getPublicRatings } from "@/lib/review-store";
import { getSettings } from "@/lib/settings";
import { ShopDataProvider } from "@/lib/shop-data";
import "./globals.css";

const exo = Exo_2({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-exo" });

const { brand, collections } = catalog;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${brand.name} – ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description ?? brand.tagline,
  applicationName: "EXSTASE",
  keywords: ["EXSTASE Energy", "Energy Drink", "Energy Drink online kaufen", "Energy Drink Zero", "Energy Drink Dose 250 ml"],
  alternates: { canonical: "/" },
  appleWebApp: { capable: true, title: "EXSTASE", statusBarStyle: "black-translucent" },
  openGraph: { type: "website", locale: "de_DE", siteName: brand.name },
};

export const viewport: Viewport = { themeColor: "#030303" };

function organizationJsonLd(c: Awaited<ReturnType<typeof getSettings>>["company"]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organisation`,
        name: c.name,
        brand: { "@type": "Brand", name: "EXSTASE" },
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        address: { "@type": "PostalAddress", streetAddress: c.street, addressLocality: c.city.replace(/^\d+\s*/, ""), postalCode: c.city.match(/^\d+/)?.[0], addressCountry: "DE" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "EXSTASE",
        inLanguage: "de-DE",
        publisher: { "@id": `${SITE_URL}/#organisation` },
        potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/products?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [products, settings, ratings, accounts, aiMedia] = await Promise.all([getProducts(), getSettings(), getPublicRatings(), getAccountsConfig(), getAiOverrides()]);
  return (
    <html className={exo.variable} data-scroll-behavior="smooth" lang="de" suppressHydrationWarning>
      <body className="font-sans">
        {/* markiert JS-Unterstützung vor dem ersten Zeichnen (für Icon-Animationen) */}
        <Script id="tt-js" strategy="beforeInteractive">
          {"document.documentElement.classList.add('tt-js')"}
        </Script>
        <script
          // Strukturierte Daten für Google: Firma, Marke und Shop-Suche
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(settings.company)).replace(/</g, "\\u003c") }}
          type="application/ld+json"
        />
        <ShopDataProvider accounts={accounts.enabled} aiMedia={aiMedia} products={products} ratings={ratings} settings={{ shipping: settings.shipping, announcement: settings.announcement }}>
          <CartProvider>
            <ShopChrome
              extras={
                <>
                  <CartDrawer />
                  <HelpButton />
                  <Enhance />
                </>
              }
              footer={<Footer brand={brand.name} collections={collections} logo={brand.logo} />}
              header={<Header brand={brand.name} collections={collections} logo={brand.logo} />}
            >
              {children}
            </ShopChrome>
          </CartProvider>
        </ShopDataProvider>
      </body>
    </html>
  );
}
