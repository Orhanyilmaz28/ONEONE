import type { Metadata } from "next";
import { EmptyState, Notice } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { aiMediaType } from "@/lib/ai-media";
import { getAiOverrides } from "@/lib/ai-media-store";
import { applyOverride, catalog, getBaseProducts, getOverrides } from "@/lib/catalog";
import { packSizeOf } from "@/lib/format";
import { strictReads } from "@/lib/store";
import { skuInfo } from "../checks";
import { htmlToText } from "../content";
import { FILTERS, TODO_FILTERS, buildRows, groupRows, isFilter, listHref, matchesFilter, matchesSearch, productHref } from "../list";
import { changedVariantCount } from "../pricing";
import type { EditorProduct } from "../pricing-fields";
import { BackLink } from "../product-nav";
import { ProductWorkspace, type WorkspaceNav } from "../product-workspace";

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ handle: string }>; searchParams: Promise<SearchParams> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = (await params).handle;
  const product = (await getBaseProducts()).find((p) => p.handle === handle);
  return { title: product ? `${product.title} bearbeiten` : "Produkt nicht gefunden" };
}

export default async function EditProductPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { handle } = await params;
  const sp = await searchParams;
  const created = first(sp.angelegt) === "1";
  const [all, overrides, aiOverrides] = await strictReads(() => Promise.all([getBaseProducts(), getOverrides(), getAiOverrides()]));
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

  // Bestseller, die gerade im Shop zu sehen sind (für den Hinweis „am besten 6–8“)
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

  // Blättern in derselben Reihenfolge (und mit derselben Auswahl) wie in der Produktliste
  const listeParam = first(sp.liste);
  const filter = isFilter(listeParam) ? listeParam : "";
  const q = first(sp.suche).trim().slice(0, 100);
  const rows = buildRows(all, overrides);
  let order = groupRows(rows.filter((r) => (!q || matchesSearch(r, q)) && matchesFilter(r, filter))).flatMap((g) => g.rows.map((r) => r.product.handle));
  let index = order.indexOf(handle);
  // Passt das Produkt (z. B. nach dem Eintragen der Zutaten) nicht mehr zur Auswahl, an seiner alten Stelle weiterblättern
  if (index === -1) {
    const full = groupRows(rows).flatMap((g) => g.rows.map((r) => r.product.handle));
    const after = full.slice(full.indexOf(handle) + 1).find((h) => order.includes(h));
    index = after ? order.indexOf(after) : order.length;
    order = [...order.slice(0, index), handle, ...order.slice(index)];
  }
  const label = filter ? (filter in TODO_FILTERS ? "Zu erledigen" : FILTERS.find((f) => f.key === filter)?.label) : q ? `Suche „${q}“` : undefined;
  const nav: WorkspaceNav = {
    listHref: listHref(filter, q),
    prevHref: index > 0 ? productHref(order[index - 1], filter, q) : undefined,
    nextHref: index < order.length - 1 ? productHref(order[index + 1], filter, q) : undefined,
    position: index + 1,
    total: order.length,
    listLabel: label,
  };

  const sku = skuInfo(all.map((p) => p.handle))[handle];
  const titleOf = new Map(all.map((p) => [p.handle, p.title]));

  return (
    <>
      {created ? (
        <div className="mb-6" role="status">
          <Notice title="Produkt angelegt" tone="green">
            {hidden
              ? "Es ist noch ausgeblendet. Prüfe Preise und Zutaten und schalte „Im Shop sichtbar“ ein, wenn alles passt."
              : "Es ist jetzt im Shop zu sehen. Hier kannst du alles noch anpassen."}
          </Notice>
        </div>
      ) : null}
      <ProductWorkspace
        content={{
          collections: catalog.collections.map((c) => ({ handle: c.handle, title: c.title })),
          existingVariants: base.variants.map((v) => v.options),
          fromCatalog: catalog.products.some((p) => p.handle === handle),
          initial: {
            title: base.title,
            subtitle: base.subtitle ?? "",
            description: htmlToText(base.descriptionHtml),
            images: base.images.map((i) => ({ src: i.src, alt: i.alt, type: aiMediaType(i.src, i.type, aiOverrides) })),
            collections: base.collections,
            highlights: (base.highlights ?? []).join("\n"),
            capacity: base.capacity ?? "",
            absorbency: base.absorbency ? String(base.absorbency) : "",
            packSize: String(packSizeOf(base)),
            options: base.options.map((o) => ({ name: o.name, values: o.values.join(", ") })),
          },
        }}
        featuredCount={featuredCount}
        key={handle}
        nav={nav}
        product={product}
        sku={{
          artNr: sku.artNr,
          ean: sku.spec?.gtin,
          gebinde: sku.spec?.gebinde.split(" · ")[0],
          tray: sku.spec?.tray.split(" · ")[0],
          mhd: sku.spec?.mhd.split(" · ")[0],
          duplicateWith: sku.duplicateOf.map((h) => titleOf.get(h) ?? h),
        }}
      />
    </>
  );
}
