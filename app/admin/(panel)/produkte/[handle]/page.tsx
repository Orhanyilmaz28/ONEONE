import type { Metadata } from "next";
import { EmptyState, Notice, PageHeader, btnSecondary } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { applyOverride, catalog, getBaseProducts, getOverrides } from "@/lib/catalog";
import { changedVariantCount } from "../pricing";
import { BackLink, ProductTabs } from "../product-nav";
import { type EditorProduct, ProductEditor } from "../product-editor";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = (await params).handle;
  const product = (await getBaseProducts()).find((p) => p.handle === handle);
  return { title: product ? `${product.title} bearbeiten` : "Produkt nicht gefunden" };
}

export default async function EditProductPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { handle } = await params;
  const created = (await searchParams).angelegt === "1";
  const [all, overrides] = await Promise.all([getBaseProducts(), getOverrides()]);
  const base = all.find((p) => p.handle === handle);

  if (!base) {
    return (
      <>
        <BackLink />
        <EmptyState action={{ href: "/admin/produkte", label: "Zur Produktliste" }} title="Produkt nicht gefunden">
          Dieses Produkt gibt es nicht (mehr). Vielleicht hat sich die Adresse geändert – in der Produktliste findest du alle Produkte.
        </EmptyState>
      </>
    );
  }

  const override = overrides[handle];
  const current = applyOverride(base, override);
  const hidden = Boolean(override?.hidden);
  // „Zurücksetzen“ betrifft nur Preise, Verfügbarkeit, Sichtbarkeit und Bestseller – Zutaten & Nährwerte zählt nicht als Änderung
  const featuredChanged = override?.featured !== undefined && override.featured !== Boolean(base.featured);
  const variantsChanged = changedVariantCount(override);

  // Bestseller, die gerade im Shop zu sehen sind (für den Hinweis „bis zu 8“)
  const featuredCount = all.filter((p) => !overrides[p.handle]?.hidden && (overrides[p.handle]?.featured ?? p.featured)).length;

  const collectionTitle = new Map(catalog.collections.map((c) => [c.handle, c.title]));
  const product: EditorProduct = {
    handle,
    title: base.title,
    image: base.images[0] ? { src: base.images[0].src, alt: base.images[0].alt || base.title } : undefined,
    collections: base.collections.map((c) => collectionTitle.get(c) ?? c),
    options: base.options,
    variants: base.variants.map((v, i) => {
      const c = current.variants[i];
      return {
        id: v.id,
        title: v.title,
        options: v.options,
        original: { price: v.price, compareAtPrice: v.compareAtPrice, available: v.available },
        saved: { price: c.price, compareAtPrice: c.compareAtPrice, available: c.available },
      };
    }),
    saved: { hidden, featured: Boolean(current.featured) },
    material: current.material ?? "",
    changed: hidden || featuredChanged || variantsChanged ? { hidden, featured: featuredChanged, variants: variantsChanged } : null,
  };

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
        description="Preise, Streichpreise und Verfügbarkeit je Variante ändern, Zutaten & Nährwerte pflegen – und festlegen, ob das Produkt im Shop und auf der Startseite erscheint."
        title={base.title}
      />
      <ProductTabs active="preise" handle={handle} />
      {created ? (
        <div className="mb-6" role="status">
          <Notice title="Produkt angelegt" tone="green">
            {hidden
              ? "Es ist noch ausgeblendet. Prüfe Preise und Material und schalte es unter „Sichtbarkeit“ ein, wenn alles passt."
              : "Es ist jetzt im Shop zu sehen. Hier kannst du die Preise je Variante noch anpassen."}
          </Notice>
        </div>
      ) : null}
      <ProductEditor featuredCount={featuredCount} product={product} />
    </>
  );
}
