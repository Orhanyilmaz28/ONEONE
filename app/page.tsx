import { Hero } from "@/components/home/hero";
import { DropDivider } from "@/components/logo";
import { Bestsellers, Faq, HomeReviews, MixTeaser, NewsletterCta, Promises } from "@/components/home/sections";
import { TrustStrip } from "@/components/trust";
import { getProducts } from "@/lib/catalog";
import { isRequestOnly } from "@/lib/format";

export default async function Home() {
  const products = await getProducts();
  // Einzelne Sorten (Paletten gibt es nur auf Anfrage); danach der Weg zum Mix-Konfigurator
  const singles = products.filter((p) => !isRequestOnly(p));

  return (
    <>
      <Hero products={products} />
      <TrustStrip />
      <Bestsellers products={singles} />
      <MixTeaser />
      <DropDivider className="pt-4" />
      <Promises />
      <HomeReviews />
      <DropDivider className="pt-6" />
      <Faq />
      <NewsletterCta />
    </>
  );
}
