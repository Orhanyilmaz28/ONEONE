import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, EmptyState, Notice, PageHeader, btn, btnSecondary, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { type DeletedProduct, getCustomProducts, getOverrides, isDeleted, mergeBase } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { restoreProduct } from "./actions";
import { FILTERS, type FilterKey, type Row, TODO_FILTERS, buildRows, groupRows, isFilter, listHref, matchesFilter, matchesSearch, productHref } from "./list";

export const metadata: Metadata = { title: "Produkte" };

const BASE = "/admin/produkte";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Link mit Filter + Suche (leere Werte weglassen) */
const hrefWith = (filter: FilterKey, q: string) => listHref(filter, q);

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const filterParam = first(sp.filter);
  const filter: FilterKey = isFilter(filterParam) ? filterParam : "";
  const q = first(sp.q).trim().slice(0, 100);

  const [overrides, custom] = await Promise.all([getOverrides(), getCustomProducts()]);
  const rows = buildRows(mergeBase(custom), overrides);
  const deleted = Object.entries(custom).filter((e): e is [string, DeletedProduct] => isDeleted(e[1]));
  const justDeleted = first(sp.geloescht).slice(0, 120);

  const searched = q ? rows.filter((r) => matchesSearch(r, q)) : rows;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, searched.filter((r) => matchesFilter(r, f.key)).length])) as Record<string, number>;
  const totals = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matchesFilter(r, f.key)).length])) as Record<string, number>;
  const visible = searched.filter((r) => matchesFilter(r, filter));

  // Kasten „Zu erledigen“
  const materialMissing = rows.filter((r) => r.materialMissing);
  const artNrMissing = rows.filter((r) => !r.artNr);
  const duplicates = [...new Set(rows.filter((r) => r.artNrDuplicate.length).map((r) => r.artNr as string))].map((nr) => ({
    nr,
    titles: rows.filter((r) => r.artNr === nr).map((r) => r.product.title),
  }));
  const soldOutVisible = rows.filter((r) => r.soldOut && !r.hidden);
  const todoCount = materialMissing.length + artNrMissing.length + duplicates.length + soldOutVisible.length;

  const groups = groupRows(visible);

  const todoFilter = filter in TODO_FILTERS ? TODO_FILTERS[filter as keyof typeof TODO_FILTERS] : null;

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
        description="Klick auf ein Produkt, um Preis, Bilder und Texte zu ändern. Gespeichertes ist nach wenigen Sekunden im Shop zu sehen."
        title="Produkte"
      />

      {justDeleted ? (
        <div className="mb-4" role="status">
          <Notice title={`„${justDeleted}“ wurde gelöscht`} tone="green">
            Das Produkt ist nicht mehr im Shop zu sehen.
          </Notice>
        </div>
      ) : null}

      {/* ── Zu erledigen ── */}
      {todoCount > 0 ? (
        <details className="group mb-6 rounded-3xl border border-amber-200 bg-amber-50/60" open={!filter && !q}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-3.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-[15px] text-amber-950">Zu erledigen</span>
            <span className="flex items-center gap-1.5 text-[13px] text-amber-900/70">
              <span className="group-open:hidden">anzeigen</span>
              <span className="hidden group-open:inline">einklappen</span>
              <svg aria-hidden className="size-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </summary>
          <ul className="divide-y divide-amber-200/70 border-amber-200/70 border-t px-5 text-[14px]">
            {materialMissing.length ? (
              <TodoLine href={hrefWith("material-fehlt", "")} note="Pflicht im Online-Shop">
                {materialMissing.length === 1 ? "1 Produkt ohne Zutaten & Nährwerte" : `${materialMissing.length} Produkte ohne Zutaten & Nährwerte`}
              </TodoLine>
            ) : null}
            {artNrMissing.length ? (
              <TodoLine href={hrefWith("artnr-fehlt", "")}>{artNrMissing.length === 1 ? "1 Produkt ohne Artikelnummer" : `${artNrMissing.length} Produkte ohne Artikelnummer`}</TodoLine>
            ) : null}
            {duplicates.map((d) => (
              <TodoLine href={hrefWith("artnr-doppelt", "")} key={d.nr}>
                Artikelnummer {d.nr} doppelt ({d.titles.join(" und ")})
              </TodoLine>
            ))}
            {soldOutVisible.length ? (
              <TodoLine href={hrefWith("ausverkauft", "")}>{soldOutVisible.length === 1 ? "1 Produkt ausverkauft" : `${soldOutVisible.length} Produkte ausverkauft`}</TodoLine>
            ) : null}
          </ul>
        </details>
      ) : null}

      {/* ── Filter + Suche ── */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Zu schmal für alle Knöpfe? Dann lässt sich die Leiste seitlich schieben */}
        <nav aria-label="Produkte filtern" className="no-scrollbar -mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:shrink-0">
          <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
            {FILTERS.filter((f) => !("onlyIfAny" in f) || totals[f.key] > 0 || filter === f.key).map((f) => {
              const active = f.key === filter;
              const warn = f.key === "zu-erledigen" && counts[f.key] > 0;
              return (
                <li key={f.key || "alle"}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
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

        <Form action={BASE} className="relative w-full lg:w-64" role="search" scroll={false}>
          {filter ? <input name="filter" type="hidden" value={filter} /> : null}
          <label className="sr-only" htmlFor="product-search">
            Produkte durchsuchen
          </label>
          <input className={`${input} pr-12`} defaultValue={q} id="product-search" name="q" placeholder="Name oder Artikelnummer" type="search" />
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

      {todoFilter && visible.length > 0 ? (
        <div className="mb-4" role="status">
          <Notice title={`${todoFilter.title} (${visible.length})`}>
            {todoFilter.how}{" "}
            <Link className="whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline" href={hrefWith("", q)} scroll={false}>
              Alle Produkte zeigen
            </Link>
          </Notice>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState action={{ href: BASE, label: "Alle Produkte zeigen" }} title="Keine passenden Produkte">
          {q
            ? "Versuch es mit einem anderen Suchbegriff, z. B. „Classic“ oder einer Artikelnummer wie „D31031“."
            : filter === "ausverkauft"
              ? "Super – gerade ist nichts ausverkauft."
              : filter === "ausgeblendet"
                ? "Alle Produkte sind im Shop zu sehen."
                : filter === "angepasst"
                  ? "Bei keinem Produkt wurden Preise oder Verfügbarkeit geändert – es gelten überall die Original-Werte."
                  : filter === "zu-erledigen" || todoFilter
                    ? "Super – hier ist nichts mehr zu erledigen."
                    : "Gerade passt kein Produkt zu diesem Filter."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section aria-labelledby={`gruppe-${g.key}`} key={g.key}>
              <h2 className="mb-2 px-1 font-medium text-[12.5px] text-muted uppercase tracking-[0.08em]" id={`gruppe-${g.key}`}>
                {g.title} <span className="font-normal">· {g.rows.length}</span>
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                {g.rows.map((r) => (
                  <li key={r.product.handle}>
                    <ProductLine filter={filter} q={q} row={r} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-5 text-[13px] text-muted leading-relaxed">
        {rows.length} Produkte insgesamt
        {totals.ausgeblendet ? ` · ${totals.ausgeblendet} ausgeblendet` : ""}
        {soldOutVisible.length ? ` · ${soldOutVisible.length} ausverkauft` : ""}.
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

function TodoLine({ href, note, children }: { href: string; note?: string; children: ReactNode }) {
  return (
    <li>
      <Link
        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-amber-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        href={href}
        scroll={false}
      >
        <span className="text-amber-950">
          {children}
          {note ? <span className="text-amber-900/60"> · {note}</span> : null}
        </span>
        <span className="whitespace-nowrap font-medium text-amber-900 underline underline-offset-2">zeigen →</span>
      </Link>
    </li>
  );
}

function ProductLine({ row, filter, q }: { row: Row; filter: FilterKey; q: string }) {
  const p = row.product;
  const image = p.images[0];
  const n = p.variants.length;
  // Beim Blättern im Produkt bleibt die gleiche Auswahl (Filter/Suche) erhalten
  const href = productHref(p.handle, filter, q);
  return (
    <Link
      className="flex items-center gap-3.5 px-4 py-3 transition hover:bg-ink/[0.025] focus-visible:bg-ink/[0.03] focus-visible:outline-none sm:px-5 sm:py-2.5"
      href={href}
    >
      <div className={`relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-cream ring-1 ring-line sm:h-12 sm:w-9 ${row.hidden ? "opacity-50 grayscale" : ""}`}>
        {image ? <Image alt="" className="object-cover" fill sizes="44px" src={image.src} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-medium text-[15px] leading-snug">
          <span className="truncate">{p.title}</span>
          {row.featured ? (
            <svg aria-label="Bestseller" className="size-3.5 shrink-0 text-amber-500" fill="currentColor" role="img" viewBox="0 0 24 24">
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
            </svg>
          ) : null}
        </div>
        <div className="text-[12.5px] text-muted tabular-nums">
          {row.artNr ? (
            <span className={row.artNrDuplicate.length ? "text-amber-800" : ""}>
              {row.artNr}
              {row.artNrDuplicate.length ? " (doppelt)" : ""}
            </span>
          ) : (
            <span className="text-amber-800">ohne Art.-Nr.</span>
          )}
          {n > 1 ? ` · ${n} Varianten` : ""}
        </div>
        <StatusBadges className="mt-1.5 sm:hidden" row={row} />
      </div>
      <StatusBadges className="hidden justify-end sm:flex" row={row} />
      <span className="flex w-20 shrink-0 flex-col items-end text-right sm:w-24">
        <span className="font-medium text-[14px] tabular-nums">{row.min === row.max ? formatPrice(row.min) : `ab ${formatPrice(row.min)}`}</span>
        {row.compare ? <s className="text-[12px] text-muted tabular-nums">{formatPrice(row.compare)}</s> : null}
      </span>
      <svg aria-hidden className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}

/** Nur Abweichungen zeigen – „Sichtbar“ ist der Normalfall und bekommt kein Abzeichen */
function StatusBadges({ row, className = "" }: { row: Row; className?: string }) {
  const badges = [
    row.hidden ? <Badge key="h">Ausgeblendet</Badge> : null,
    row.soldOut ? (
      <Badge key="s" tone="red">
        Ausverkauft
      </Badge>
    ) : row.unavailable > 0 ? (
      <Badge key="u" tone="amber">
        {row.unavailable} ausverkauft
      </Badge>
    ) : null,
    row.materialMissing ? (
      <Badge key="m" tone="amber">
        Zutaten fehlen
      </Badge>
    ) : null,
    row.changed ? (
      <Badge key="c" tone="blue">
        Angepasst
      </Badge>
    ) : null,
  ].filter(Boolean);
  if (!badges.length) return null;
  return <div className={`flex flex-wrap gap-1.5 ${className}`}>{badges}</div>;
}
