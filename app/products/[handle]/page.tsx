import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accordion } from "@/components/accordion";
import { DropDivider, DropIcon } from "@/components/logo";
import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";
import { PackShowcase } from "@/components/pack-showcase";
import { PaletteRequest } from "@/components/palette-request";
import { ProductGallery } from "@/components/product-gallery";
import { catalog, getCollection, getProduct, getRelated, isAvailable, priceRange } from "@/lib/catalog";
import { SITE_URL, formatPrice } from "@/lib/format";
import { getSold, summarize } from "@/lib/reviews";
import { getPublicReviews } from "@/lib/review-store";
import { ProductReviews } from "@/components/reviews";
import { SalesToday } from "@/components/sales-today";
import { StickyBuy } from "@/components/sticky-buy";
import { Faq } from "@/components/home/sections";
import { formatAverage, Stars } from "@/components/stars";
import { formatPriceShort, shippingRules } from "@/components/trust";
import { getSettings } from "@/lib/settings";

type Props = { params: Promise<{ handle: string }> };

export function generateStaticParams() {
  return catalog.products.map((p) => ({ handle: p.handle }));
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).handle);
  if (!product) {
    return {};
  }
  const description = product.subtitle ?? plain(product.descriptionHtml).slice(0, 160);
  return {
    title: product.title,
    description,
    alternates: { canonical: `/products/${product.handle}` },
    // Vorschaubild kommt aus opengraph-image.tsx in diesem Ordner
    openGraph: { type: "website", locale: "de_DE", siteName: catalog.brand.name, title: product.title, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { handle } = await params;
  const product = await getProduct(handle);
  if (!product) {
    notFound();
  }
  const collection = product.collections[0] ? getCollection(product.collections[0]) : undefined;
  const related = await getRelated(product);
  const { min, max } = priceRange(product);
  const reviews = await getPublicReviews(product.handle);
  const rating = summarize(reviews);
  const sold = getSold(product.handle);
  // Versand- und Rücksendekosten aus dem Dashboard (Einstellungen)
  const settings = await getSettings();
  const shipping = shippingRules(settings.shipping);
  const returnNote =
    settings.returns.paidBy === "haendler" ? "Die Rücksendung ist für dich kostenlos." : "Die Kosten für die Rücksendung trägst du selbst.";
  const shippingNote = shipping.alwaysFree
    ? "Der Versand ist kostenlos."
    : shipping.freeFrom
      ? `Kostenlos ab ${formatPriceShort(shipping.freeFrom)}.`
      : `Versandkosten: ${formatPrice(shipping.cost)}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: plain(product.descriptionHtml),
    image: product.images.map((i) => i.src),
    brand: { "@type": "Brand", name: product.vendor || catalog.brand.name },
    ...(rating.count
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: rating.average.toFixed(1), reviewCount: rating.count },
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.name },
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
            reviewBody: r.text,
          })),
        }
      : {}),
    // Paletten gibt es nur auf Anfrage – ohne Preisangabe in den strukturierten Daten
    ...(product.onRequest
      ? {}
      : {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "EUR",
            lowPrice: (min / 100).toFixed(2),
            highPrice: (max / 100).toFixed(2),
            availability: isAvailable(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: `${SITE_URL}/products/${product.handle}`,
          },
        }),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <script
        // „<“ maskieren, damit Texte aus Bewertungen oder dem Dashboard den <script>-Block nie beenden können
        // biome-ignore lint/security/noDangerouslySetInnerHtml: strukturierte Daten für Google
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <nav aria-label="Brotkrümel" className="py-6 text-muted text-sm">
        <Link className="hover:text-ink" href="/">
          Start
        </Link>
        <span className="mx-2">/</span>
        {collection ? (
          <>
            <Link className="hover:text-ink" href={`/collections/${collection.handle}`}>
              {collection.title}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-ink">{product.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        {/* min-w-0: sonst macht die Vorschaubild-Leiste die Galerie auf dem Handy breiter als den Bildschirm */}
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <ProductGallery product={product} />
        </div>
        <div>
          <p className="anim-rise flex flex-wrap items-center gap-2" style={{ animationDelay: "0.05s" }}>
            <span className="rounded-full bg-accent px-3 py-1 font-medium text-black text-xs">{product.productType}</span>
            <span className="rounded-full bg-cream px-3 py-1 text-xs">Versand aus Deutschland</span>
          </p>
          <h1 className="anim-rise t-h1 mt-4" style={{ animationDelay: "0.12s" }}>{product.title}</h1>
          {product.subtitle ? <p className="anim-rise mt-3 text-lg text-muted" style={{ animationDelay: "0.2s" }}>{product.subtitle}</p> : null}
          {rating.count || sold ? (
            <a className="mt-3 flex w-fit flex-wrap items-center gap-2 text-sm hover:underline" href="#bewertungen">
              {rating.count ? (
                <>
                  <Stars value={rating.average} />
                  <span className="font-medium">{formatAverage(rating.average)}</span>
                  <span className="text-muted">
                    ({rating.count} {rating.count === 1 ? "Bewertung" : "Bewertungen"})
                  </span>
                </>
              ) : null}
              {sold ? <span className="text-muted">· über {sold.toLocaleString("de-DE")}× verkauft</span> : null}
            </a>
          ) : null}
          {product.highlights?.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {product.highlights.map((h) => (
                <li className="flex items-center gap-1.5 rounded-full bg-cream px-3.5 py-1.5 text-sm" key={h}>
                  <DropIcon className="h-3 w-auto text-ink/50" />
                  {h}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <SalesToday handle={product.handle} />
          </div>
          <div className="anim-rise mt-8 scroll-mt-28" id="kaufen" style={{ animationDelay: "0.3s" }}>
            {product.onRequest ? <PaletteRequest product={product} /> : <AddToCart product={product} />}
          </div>
          <div className="mt-10">
            <Accordion
              items={[
                {
                  title: "Beschreibung",
                  content: (
                    <div
                      className="prose-shop"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: Produktbeschreibung aus eigenem Katalog
                      dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                    />
                  ),
                },
                ...(product.material
                  ? [{ title: "Zutaten & Nährwerte", content: <p className="whitespace-pre-line">{product.material}</p> }]
                  : []),
                {
                  title: "Versand & Lieferung",
                  content: (
                    <p>
                      Versand aus Deutschland innerhalb von 1–3 Werktagen. {shippingNote} Pfand: 0,25 € je Dose, wird an der Kasse separat berechnet.{" "}
                      <Link className="underline" href="/versand">
                        Mehr erfahren
                      </Link>
                    </p>
                  ),
                },
                {
                  title: "Rückgabe",
                  content: (
                    <p>
                      14 Tage gesetzliches Widerrufsrecht ab Erhalt der Ware. {returnNote}{" "}
                      <Link className="underline" href="/widerruf">
                        Widerrufsbelehrung
                      </Link>
                    </p>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <PackShowcase product={product} />
      <DropDivider className="pt-6" />
      <ProductReviews handle={product.handle} reviews={reviews} sold={sold} title={product.title} />
      <div className="-mx-4 sm:-mx-6">
        <Faq />
      </div>
      {product.onRequest ? null : <StickyBuy product={product} />}

      {related.length > 0 ? (
        <section className="mt-16 lg:mt-20">
          <h2 className="t-h2 mb-10">Mehr Sorten für dich</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {related.map((p, i) => (
              <ProductCard index={i} key={p.handle} product={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
