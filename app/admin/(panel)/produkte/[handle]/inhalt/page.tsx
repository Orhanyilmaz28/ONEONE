import type { Metadata } from "next";
import { EmptyState, PageHeader, btnSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { aiMediaType } from "@/lib/ai-media";
import { getAiOverrides } from "@/lib/ai-media-store";
import { catalog, getBaseProducts, getOverrides } from "@/lib/catalog";
import { htmlToText } from "../../content";
import { ContentEditor } from "../../content-editor";
import { BackLink, ProductTabs } from "../../product-nav";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = (await params).handle;
  const product = (await getBaseProducts()).find((p) => p.handle === handle);
  return { title: product ? `${product.title} – Bilder & Texte` : "Produkt nicht gefunden" };
}

export default async function ProductContentPage({ params }: Props) {
  await requireAdmin();
  const { handle } = await params;
  const [all, overrides, aiOverrides] = await Promise.all([getBaseProducts(), getOverrides(), getAiOverrides()]);
  const product = all.find((p) => p.handle === handle);

  if (!product) {
    return (
      <>
        <BackLink />
        <EmptyState action={{ href: "/admin/produkte", label: "Zur Produktliste" }} title="Produkt nicht gefunden">
          Dieses Produkt gibt es nicht (mehr). In der Produktliste findest du alle Produkte.
        </EmptyState>
      </>
    );
  }

  const hidden = Boolean(overrides[handle]?.hidden);
  return (
    <>
      <BackLink />
      <PageHeader
        actions={
          hidden ? (
            <span className="inline-flex items-center rounded-full border border-line border-dashed px-4 py-2 text-[14px] text-muted">Im Shop ausgeblendet</span>
          ) : (
            <a className={btnSecondary} href={`/products/${handle}`} rel="noreferrer" target="_blank">
              Im Shop ansehen ↗
            </a>
          )
        }
        description="Bilder hochladen und sortieren, Name und Beschreibung ändern, Kollektionen wählen und festlegen, welche Größen und Farben es gibt."
        title={product.title}
      />
      <ProductTabs active="inhalt" handle={handle} />
      <ContentEditor
        collections={catalog.collections.map((c) => ({ handle: c.handle, title: c.title }))}
        existingVariants={product.variants.map((v) => v.options)}
        fromCatalog={catalog.products.some((p) => p.handle === handle)}
        handle={handle}
        initial={{
          title: product.title,
          subtitle: product.subtitle ?? "",
          description: htmlToText(product.descriptionHtml),
          images: product.images.map((i) => ({ src: i.src, alt: i.alt, type: aiMediaType(i.src, i.type, aiOverrides) })),
          collections: product.collections,
          highlights: (product.highlights ?? []).join("\n"),
          capacity: product.capacity ?? "",
          absorbency: product.absorbency ? String(product.absorbency) : "",
          packSize: product.packSize ? String(product.packSize) : "",
          options: product.options.map((o) => ({ name: o.name, values: o.values.join(", ") })),
        }}
        mode="edit"
      />
    </>
  );
}
