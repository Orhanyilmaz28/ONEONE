import { Hero } from "@/components/home/hero";
import { DropDivider } from "@/components/logo";
import { Bestsellers, Faq, HomeReviews, MixTeaser, NewsletterCta, Promises } from "@/components/home/sections";
import { TrustStrip } from "@/components/trust";
import { getProducts } from "@/lib/catalog";

export default async function Home() {
  const products = await getProducts();

  return (
    <>
      <Hero products={products} />
      <TrustStrip />
      <Bestsellers products={products} />
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
