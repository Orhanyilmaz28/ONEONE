import { Hero } from "@/components/home/hero";
import { DropDivider } from "@/components/logo";
import { Bestsellers, Faq, HomeReviews, NewsletterCta, Promises } from "@/components/home/sections";
import { TrustStrip } from "@/components/trust";
import { getProducts } from "@/lib/catalog";

export default async function Home() {
  const products = await getProducts();
  const featured = products.filter((p) => p.featured);
  // Die vier Sorten zuerst, Mixpaket danach (Reihenfolge wie im Katalog)
  const shown = (featured.length ? featured : products).slice(0, 12);

  return (
    <>
      <Hero products={shown} />
      <TrustStrip />
      <Bestsellers products={shown} />
      <DropDivider className="pt-4" />
      <Promises />
      <HomeReviews />
      <DropDivider className="pt-6" />
      <Faq />
      <NewsletterCta />
    </>
  );
}
