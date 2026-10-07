import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btn, btnSecondary, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { type DeletedProduct, applyOverride, catalog, getCustomProducts, getOverrides, isAvailable, isDeleted, mergeBase, priceRange } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { restoreProduct } from "./actions";
import { changedVariantCount } from "./pricing";

export const metadata: Metadata = { title: "Produkte" };

const BASE = "/admin/produkte";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS = [
  { key: "", label: "Alle" },
  { key: "sichtbar", label: "Im Shop" },
  { key: "ausgeblendet", label: "Ausgeblendet" },
  { key: "bestseller", label: "Bestseller" },
  { key: "ausverkauft", label: "Ausverkauft" },
  { key: "angepasst", label: "Angepasst" },
] as const;
/** Zusätzlicher Filter ohne eigenen Knopf in der Leiste – erreichbar über den Hinweis oben und den Startklar-Check */
const MATERIAL_FILTER = "material-fehlt";
type FilterKey = (typeof FILTERS)[number]["key"] | typeof MATERIAL_FILTER;

function isFilter(v: string): v is FilterKey {
  return v === MATERIAL_FILTER || FILTERS.some((f) => f.key === v);
}

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Link mit Filter + Suche (leere Werte weglassen) */
function hrefWith(filter: FilterKey, q: string) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** Spaltenköpfe. „relative“ hält die unsichtbare Beschriftung in der scrollbaren Tabelle – sonst ließe sich die Seite seitlich schieben. */
const TABLE_HEAD = [
  "Produkt",
  "Kollektion",
  "Preis",
  "Varianten",
  "Status",
  <span className="relative" key="edit">
    <span className="sr-only">Bearbeiten</span>
  </span>,
];

const collectionTitle = new Map(catalog.collections.map((c) => [c.handle, c.title]));

/** Eine Zeile der Übersicht: aktueller Stand eines Produkts samt Kennzeichen */
type Row = {
  product: Product;
  hidden: boolean;
  featured: boolean;
  soldOut: boolean;
  unavailable: number;
  changed: number;
  /** Im Shop sichtbar, aber ohne Zutaten & Nährwerte (Pflicht nach Lebensmittelinformationsverordnung) */
  materialMissing: boolean;
  min: number;
  max: number;
  /** Streichpreis(e) der günstigsten Variante(n), falls vorhanden */
  compare?: number;
  collections: string[];
};

function toRow(base: Product, override: Parameters<typeof applyOverride>[1]): Row {
  const product = applyOverride(base, override);
  const { min, max } = priceRange(product);
  const cheapest = product.variants.filter((v) => v.price === min && v.compareAtPrice !== undefined && v.compareAtPrice > v.price);
  return {
    product,
    hidden: Boolean(override?.hidden),
    featured: Boolean(product.featured),
    soldOut: !isAvailable(product),
    unavailable: product.variants.filter((v) => !v.available).length,
    changed: changedVariantCount(override),
    materialMissing: !override?.hidden && !product.material,
    min,
    max,
    compare: cheapest.length ? Math.min(...cheapest.map((v) => v.compareAtPrice ?? 0)) : undefined,
    collections: product.collections.map((c) => collectionTitle.get(c) ?? c),
  };
}

function matchesFilter(row: Row, filter: FilterKey) {
  switch (filter) {
    case "sichtbar":
      return !row.hidden;
    case "ausgeblendet":
      return row.hidden;
    case "bestseller":
      return row.featured;
    case "ausverkauft":
      return row.soldOut;
    case "angepasst":
      return row.changed > 0;
    case MATERIAL_FILTER:
      return row.materialMissing;
    default:
      return true;
  }
}

function matchesSearch(row: Row, q: string) {
  const needle = q.toLowerCase();
  return [row.product.title, row.product.handle, ...row.collections].join(" ").toLowerCase().includes(needle);
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const filterParam = first(sp.filter);
  const filter: FilterKey = isFilter(filterParam) ? filterParam : "";
  const q = first(sp.q).trim().slice(0, 100);

  const [overrides, custom] = await Promise.all([getOverrides(), getCustomProducts()]);
  const rows = mergeBase(custom).map((p) => toRow(p, overrides[p.handle]));
  const deleted = Object.entries(custom).filter((e): e is [string, DeletedProduct] => isDeleted(e[1]));
  const justDeleted = first(sp.geloescht).slice(0, 120);

  const searched = q ? rows.filter((r) => matchesSearch(r, q)) : rows;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, searched.filter((r) => matchesFilter(r, f.key)).length])) as Record<string, number>;
  const visible = searched.filter((r) => matchesFilter(r, filter));

  const hiddenTotal = rows.filter((r) => r.hidden).length;
  const soldOutTotal = rows.filter((r) => r.soldOut && !r.hidden).length;
  const materialMissingTotal = rows.filter((r) => r.materialMissing).length;

  return (
    <>
      <PageHeader
        actions={
          <Link className={btn} href={`${BASE}/neu`}>
            <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Neues Produkt
          </Link>
        }
        description="Hier legst du fest, was im Shop zu sehen ist und was es kostet. Klick auf ein Produkt, um Preise, Bilder, Texte und Varianten zu ändern – oder lege mit „Neues Produkt“ ein weiteres an."
        title="Produkte"
      />

      {justDeleted ? (
        <div className="mb-3" role="status">
          <Notice title={`„${justDeleted}“ wurde gelöscht`} tone="green">
            Das Produkt ist nicht mehr im Shop zu sehen.
          </Notice>
        </div>
      ) : null}

      <div className="mb-6">
        <Notice title="Änderungen sind in wenigen Sekunden live" tone="blue">
          Sobald du speicherst, sehen deine Kund:innen die neuen Preise im Shop. An der Kasse gilt immer der aktuelle Preis – auch für Artikel, die schon im
          Warenkorb liegen.
        </Notice>
        {materialMissingTotal > 0 && filter !== MATERIAL_FILTER ? (
          <div className="mt-3">
            <Notice title={materialMissingTotal === 1 ? "Bei 1 Produkt fehlen Zutaten & Nährwerte" : `Bei ${materialMissingTotal} Produkten fehlen Zutaten & Nährwerte`}>
              Beim Online-Verkauf müssen Kund:innen vor dem Kauf Zutaten, Allergene und Nährwerte sehen (Lebensmittelinformationsverordnung).{" "}
              <Link className="whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline" href={hrefWith(MATERIAL_FILTER, "")} scroll={false}>
                {materialMissingTotal === 1 ? "Produkt zeigen" : "Diese Produkte zeigen"} →
              </Link>
            </Notice>
          </div>
        ) : null}
      </div>

      {/* Filter + Suche */}
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Handy: Knöpfe brechen um (aktiver Filter bleibt sichtbar); ab Tablet als Leiste */}
        {/* Zu schmal für alle Knöpfe? Dann lässt sich die Leiste seitlich schieben, statt abgeschnitten zu werden */}
        <nav aria-label="Produkte filtern" className="no-scrollbar min-w-0 overflow-x-auto xl:shrink-0">
          <ul className="flex flex-wrap gap-1.5 sm:w-max sm:flex-nowrap sm:gap-1 sm:rounded-full sm:border sm:border-line sm:bg-card sm:p-1">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              const warn = (f.key === "ausverkauft" || f.key === "ausgeblendet") && counts[f.key] > 0;
              return (
                <li key={f.key || "alle"}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-black ring-1 ring-ink sm:ring-0" : "bg-card text-ink/70 ring-1 ring-line hover:bg-ink/5 hover:text-ink sm:bg-transparent sm:ring-0"}`}
                    href={hrefWith(f.key, q)}
                    scroll={false}
                  >
                    {f.label}
                    <span
                      className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${active ? "bg-white/20 text-white" : warn ? "bg-amber-100 text-amber-900" : "bg-ink/5 text-ink/60"}`}
                    >
                      {counts[f.key]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Form action={BASE} className="relative w-full sm:max-w-sm xl:w-56" role="search" scroll={false}>
          {filter ? <input name="filter" type="hidden" value={filter} /> : null}
          <label className="sr-only" htmlFor="product-search">
            Produkte durchsuchen
          </label>
          <input className={`${input} pr-12`} defaultValue={q} id="product-search" name="q" placeholder="Produkt suchen" type="search" />
          <button
            aria-label="Suchen"
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
            type="submit"
          >
            <svg aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </Form>
      </div>

      {q ? (
        <p className="mb-4 text-muted text-sm" role="status">
          {visible.length === 1 ? "1 Treffer" : `${visible.length} Treffer`} für „<span className="text-ink">{q}</span>“ ·{" "}
          <Link className="text-ink underline underline-offset-4 hover:no-underline" href={hrefWith(filter, "")} scroll={false}>
            Suche löschen
          </Link>
        </p>
      ) : null}

      {filter === MATERIAL_FILTER && visible.length > 0 ? (
        <div className="mb-4" role="status">
          <Notice title={`Nur Produkte ohne Zutaten & Nährwerte (${visible.length})`}>
            Produkt öffnen, im Feld <b>Zutaten & Nährwerte</b> die Angaben von der Dose eintragen und speichern. Ist alles
            eingetragen, ist diese Liste leer.{" "}
            <Link className="whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline" href={hrefWith("", q)} scroll={false}>
              Alle Produkte zeigen
            </Link>
          </Notice>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState action={{ href: BASE, label: "Alle Produkte zeigen" }} title="Keine passenden Produkte">
          {q
            ? "Versuch es mit einem anderen Suchbegriff, z. B. „Classic“ oder „Zero“."
            : filter === "ausverkauft"
              ? "Super – gerade ist nichts ausverkauft."
              : filter === "ausgeblendet"
                ? "Alle Produkte sind im Shop zu sehen."
                : filter === "angepasst"
                  ? "Bei keinem Produkt wurden Preise oder Verfügbarkeit geändert – es gelten überall die Original-Werte."
                  : filter === MATERIAL_FILTER
                    ? "Super – bei allen Produkten im Shop sind Zutaten & Nährwerte eingetragen."
                    : "Gerade passt kein Produkt zu diesem Filter."}
        </EmptyState>
      ) : (
        <>
          {/* Handy: Karten */}
          <ul className="space-y-3 md:hidden">
            {visible.map((r) => (
              <li key={r.product.handle}>
                <ProductCard row={r} />
              </li>
            ))}
          </ul>

          {/* Ab Tablet: Tabelle */}
          <div className="hidden md:block">
            <Card padded={false}>
              <div className="px-6 pb-1">
                <Table head={TABLE_HEAD}>
                  {visible.map((r) => (
                    <ProductRow key={r.product.handle} row={r} />
                  ))}
                </Table>
              </div>
            </Card>
          </div>
        </>
      )}

      <p className="mt-5 text-[13px] text-muted leading-relaxed">
        {rows.length} Produkte insgesamt
        {hiddenTotal ? ` · ${hiddenTotal} ausgeblendet` : ""}
        {soldOutTotal ? ` · ${soldOutTotal} ausverkauft` : ""}.
      </p>

      {deleted.length ? (
        <details className="group mt-6 rounded-3xl border border-line bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-6 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-medium text-[15px]">Gelöschte Produkte ({deleted.length})</span>
              <span className="block text-[13px] text-muted">Produkte aus dem ursprünglichen Sortiment lassen sich hier zurückholen.</span>
            </span>
            <svg aria-hidden className="size-4 shrink-0 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className="divide-y divide-line border-line border-t px-6">
            {deleted.map(([handle, d]) => (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={handle}>
                <span className="text-[15px]">
                  {d.title} <span className="text-[13px] text-muted">· gelöscht am {new Date(d.deletedAt).toLocaleDateString("de-DE")}</span>
                </span>
                <form action={restoreProduct}>
                  <input name="handle" type="hidden" value={handle} />
                  <button className={btnSecondary.replace("px-5 py-2.5", "px-4 py-2")} type="submit">
                    Wiederherstellen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function Thumb({ product, className = "" }: { product: Product; className?: string }) {
  const image = product.images[0];
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-cream ring-1 ring-line ${className}`}>
      {image ? <Image alt="" className="object-cover" fill sizes="64px" src={image.src} /> : null}
    </div>
  );
}

function PriceText({ row }: { row: Row }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium tabular-nums">{row.min === row.max ? formatPrice(row.min) : `${formatPrice(row.min)} – ${formatPrice(row.max)}`}</span>
      {row.compare ? (
        <span className="text-[12.5px] text-muted tabular-nums">
          statt <s>{formatPrice(row.compare)}</s>
        </span>
      ) : null}
    </span>
  );
}

function StatusBadges({ row, partial = false }: { row: Row; partial?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.hidden ? <Badge>Ausgeblendet</Badge> : <Badge tone="green">Sichtbar</Badge>}
      {row.featured ? (
        <Badge tone="amber">
          <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
          </svg>
          Bestseller
        </Badge>
      ) : null}
      {row.soldOut ? <Badge tone="red">Ausverkauft</Badge> : null}
      {row.materialMissing ? <Badge tone="amber">Zutaten fehlen</Badge> : null}
      {partial && row.unavailable > 0 && !row.soldOut ? <Badge tone="amber">{row.unavailable} ausverkauft</Badge> : null}
      {row.changed ? <Badge tone="blue">Angepasst</Badge> : null}
    </div>
  );
}

function VariantText({ row }: { row: Row }) {
  const n = row.product.variants.length;
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{n === 1 ? "1 Variante" : `${n} Varianten`}</span>
      {row.unavailable > 0 && !row.soldOut ? <span className="text-[12.5px] text-amber-800 tabular-nums">{row.unavailable} ausverkauft</span> : null}
    </span>
  );
}

function ProductRow({ row }: { row: Row }) {
  const p = row.product;
  return (
    <tr className="relative transition hover:bg-ink/[0.025]">
      <td className="py-3 pr-4 align-middle">
        <div className="flex items-center gap-3.5">
          <Thumb className={`h-[60px] w-12 ${row.hidden ? "opacity-50 grayscale" : ""}`} product={p} />
          <div className="min-w-0">
            <Link
              className="font-medium after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink/30"
              href={`${BASE}/${p.handle}`}
            >
              {p.title}
            </Link>
            {p.subtitle ? <div className="max-w-[260px] truncate text-[13px] text-muted">{p.subtitle}</div> : null}
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 align-middle text-ink/80">{row.collections.join(", ")}</td>
      <td className="whitespace-nowrap py-3 pr-4 align-middle">
        <PriceText row={row} />
      </td>
      <td className="whitespace-nowrap py-3 pr-4 align-middle text-ink/80">
        <VariantText row={row} />
      </td>
      <td className="py-3 pr-4 align-middle">
        <StatusBadges row={row} />
      </td>
      <td className="py-3 text-right align-middle">
        <span aria-hidden className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted">
          <span className="hidden xl:inline">Bearbeiten</span>
          <svg className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </td>
    </tr>
  );
}

function ProductCard({ row }: { row: Row }) {
  const p = row.product;
  return (
    <Link
      className="flex gap-4 rounded-3xl border border-line bg-card p-3.5 shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:border-ink/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
      href={`${BASE}/${p.handle}`}
    >
      <Thumb className={`h-[100px] w-20 ${row.hidden ? "opacity-50 grayscale" : ""}`} product={p} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium leading-snug">{p.title}</span>
        <span className="truncate text-[13px] text-muted">{row.collections.join(", ")}</span>
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className="tabular-nums">
            <span className="font-medium">{row.min === row.max ? formatPrice(row.min) : `ab ${formatPrice(row.min)}`}</span>
            {row.compare ? <s className="ml-1.5 text-[12.5px] text-muted">{formatPrice(row.compare)}</s> : null}
          </span>
          <span className="shrink-0 text-[12.5px] text-muted">
            {p.variants.length === 1 ? "1 Variante" : `${p.variants.length} Varianten`}
          </span>
        </div>
        <div className="mt-2">
          <StatusBadges partial row={row} />
        </div>
      </div>
    </Link>
  );
}
