import { Hero } from "@/components/home/hero";
import { DropDivider } from "@/components/logo";
import { Bestsellers, Faq, MixPakete, HomeReviews, NewsletterCta, Promises } from "@/components/home/sections";
import { TrustStrip } from "@/components/trust";
import { getProducts } from "@/lib/catalog";
import { isMixProduct } from "@/lib/format";

export default async function Home() {
  const products = await getProducts();
  // Erst alle einzelnen Produkte, danach die Mixpakete in eigenem Abschnitt
  const singles = products.filter((p) => !isMixProduct(p));
  const mixes = products.filter(isMixProduct);

  return (
    <>
      <Hero products={products} />
      <TrustStrip />
      <Bestsellers products={singles} />
      <MixPakete products={mixes} />
      <DropDivider className="pt-4" />
      <Promises />
      <HomeReviews />
      <DropDivider className="pt-6" />
      <Faq />
      <NewsletterCta />
    </>
  );
}
