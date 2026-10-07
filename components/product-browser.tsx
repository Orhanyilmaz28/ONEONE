"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef } from "react";
import { isMixProduct } from "@/lib/format";
import type { Collection, Product } from "@/lib/types";
import { CloseIcon, SearchIcon } from "./icons";
import { ProductCard } from "./product-card";
import { searchProducts } from "./search-overlay";

const sorts = {
  beliebt: "Beliebt",
  neu: "Neuheiten",
  "preis-auf": "Preis aufsteigend",
  "preis-ab": "Preis absteigend",
} as const;
type SortKey = keyof typeof sorts;

const minPrice = (p: Product) => Math.min(...p.variants.map((v) => v.price));

type BrowserProps = {
  products: Product[];
  collections: Collection[];
  activeCollection?: string;
};

const NO_PARAMS = new URLSearchParams();

/**
 * Produktliste mit Suche, Sortierung und Filter (Werte stehen in der Adresse, z. B. ?sort=neu).
 * Die Adresse ist beim Vorab-Erzeugen der Seite unbekannt – deshalb wird zuerst die ungefilterte Liste
 * gezeigt (sofort sichtbar, gut für Google, kein Springen beim Laden) und danach die gefilterte.
 */
export function ProductBrowser(props: BrowserProps) {
  return (
    <Suspense fallback={<BrowserView {...props} params={NO_PARAMS} />}>
      <BrowserWithParams {...props} />
    </Suspense>
  );
}

function BrowserWithParams(props: BrowserProps) {
  return <BrowserView {...props} params={useSearchParams()} />;
}

function BrowserView({
  products,
  collections,
  activeCollection,
  params,
}: BrowserProps & { params: Pick<URLSearchParams, "get" | "toString"> }) {
  const router = useRouter();
  const pathname = usePathname();
  const filterRef = useRef<HTMLInputElement>(null);
  const q = params.get("q") ?? "";
  const sort = (params.get("sort") as SortKey) in sorts ? (params.get("sort") as SortKey) : "beliebt";
  const onlyAvailable = params.get("verfuegbar") === "1";

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const visible = useMemo(() => {
    const handles = new Set(products.map((p) => p.handle));
    let list = q ? searchProducts(products, q).filter((p) => handles.has(p.handle)) : [...products];
    if (onlyAvailable) {
      list = list.filter((p) => p.variants.some((v) => v.available));
    }
    switch (sort) {
      case "neu":
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "preis-auf":
        list.sort((a, b) => minPrice(a) - minPrice(b));
        break;
      case "preis-ab":
        list.sort((a, b) => minPrice(b) - minPrice(a));
        break;
      default:
        if (!q) {
          list.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
        }
    }
    // Erst alle einzelnen Produkte, dann die Mixpakete (Reihenfolge innerhalb bleibt erhalten)
    return list.sort((a, b) => Number(isMixProduct(a)) - Number(isMixProduct(b)));
  }, [products, q, sort, onlyAvailable]);

  function resetFilters() {
    // Eingabefeld ist ungesteuert – beim Zurücksetzen auch den sichtbaren Text leeren
    if (filterRef.current) filterRef.current.value = "";
    router.replace(pathname, { scroll: false });
  }

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <div className="sticky top-16 z-30 -mx-4 mb-8 border-line border-b bg-paper/95 px-4 py-4 sm:-mx-6 sm:px-6 lg:top-20">
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Kategorien" className="-m-1.5 flex flex-1 gap-2 overflow-x-auto p-1.5 [scrollbar-width:none]">
              <Chip active={!activeCollection} href="/products" label="Alle" />
              {collections.map((c) => (
                <Chip
                  active={activeCollection === c.handle}
                  href={`/collections/${c.handle}`}
                  key={c.handle}
                  label={c.title}
                />
              ))}
            </nav>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label className="flex flex-1 items-center gap-2 rounded-full border border-line bg-card px-4 py-2 focus-within:border-ink sm:w-56 sm:flex-none">
                <SearchIcon className="size-4 text-muted" />
                <input
                  aria-label="Produkte filtern"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                  defaultValue={q}
                  enterKeyHint="search"
                  onChange={(e) => update("q", e.target.value || null)}
                  placeholder="Filtern …"
                  ref={filterRef}
                  type="search"
                />
              </label>
              <select
                aria-label="Sortieren"
                className="rounded-full border border-line bg-card px-4 py-2 text-sm transition hover:border-ink"
                onChange={(e) => update("sort", e.target.value === "beliebt" ? null : e.target.value)}
                value={sort}
              >
                {Object.entries(sorts).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-muted text-sm">
            <span aria-live="polite" role="status">
              {visible.length} {visible.length === 1 ? "Produkt" : "Produkte"}
            </span>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                checked={onlyAvailable}
                className="accent-accent"
                onChange={(e) => update("verfuegbar", e.target.checked ? "1" : null)}
                type="checkbox"
              />
              Nur verfügbare
            </label>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="t-h2">Nichts gefunden</p>
            <p className="mt-3 text-muted">Versuch es mit einem anderen Begriff – z. B. „Classic“, „Zero“ oder „12er“.</p>
            <button
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm transition hover:border-ink"
              onClick={resetFilters}
              type="button"
            >
              <CloseIcon className="size-4" /> Filter zurücksetzen
            </button>
          </div>
        ) : (
          <motion.div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4" layout>
            <AnimatePresence mode="popLayout">
              {visible.map((p, i) => (
                <motion.div
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  key={p.handle}
                  layout
                  transition={{ duration: 0.3 }}
                >
                  <ProductCard index={i} preload={i < 4} product={p} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </MotionConfig>
  );
}

/** Kategorie-Link als Chip (echter Link: Mittelklick, „In neuem Tab öffnen“ und Screenreader funktionieren) */
function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${
        active ? "bg-accent text-paper" : "border border-line bg-card hover:border-ink"
      }`}
      href={href}
      scroll={false}
    >
      {label}
    </Link>
  );
}
