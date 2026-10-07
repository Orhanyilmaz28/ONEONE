import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Stat } from "@/components/admin/ui";
import { formatAverage, Stars } from "@/components/stars";
import { requireAdmin } from "@/lib/admin-auth";
import { getBaseProducts } from "@/lib/catalog";
import { getStoredReviews, type ReviewStatus, toPublicReview } from "@/lib/review-store";
import { getAllReviews, mergeReviews, REVIEW_SOURCE_LABEL, summarize } from "@/lib/reviews";
import { type AdminReview, ReviewList } from "./review-list";

export const metadata: Metadata = { title: "Bewertungen" };

const BASE = "/admin/bewertungen";

/** Reiter: Adresse (deutsch, ohne Umlaute) → gespeicherter Status */
const TABS = [
  { key: "neu", status: "pending", label: "Neu" },
  { key: "veroeffentlicht", status: "approved", label: "Veröffentlicht" },
  { key: "abgelehnt", status: "rejected", label: "Abgelehnt" },
] as const satisfies readonly { key: string; status: ReviewStatus; label: string }[];

type TabKey = (typeof TABS)[number]["key"];

const EMPTY: Record<ReviewStatus, { title: string; text: string }> = {
  pending: {
    title: "Keine neuen Bewertungen",
    text: "Sobald jemand auf einer Produktseite eine Bewertung schreibt, erscheint sie hier. Du entscheidest dann, ob sie im Shop sichtbar wird.",
  },
  approved: {
    title: "Noch keine Bewertung aus dem Formular veröffentlicht",
    text: "Veröffentlichte Bewertungen erscheinen im Shop auf der Produktseite und in den Sternen der Produktkarten.",
  },
  rejected: {
    title: "Keine abgelehnten Bewertungen",
    text: "Abgelehnte Bewertungen sind im Shop nicht zu sehen. Du kannst sie hier jederzeit doch noch veröffentlichen.",
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];

  const [stored, products] = await Promise.all([getStoredReviews(), getBaseProducts()]);
  const productByHandle = new Map(products.map((p) => [p.handle, p]));
  const getBaseProduct = (handle: string) => productByHandle.get(handle);
  const fixed = getAllReviews();
  const counts = Object.fromEntries(TABS.map((t) => [t.status, stored.filter((r) => r.status === t.status).length])) as Record<ReviewStatus, number>;

  // Alles, was Kund:innen im Shop sehen (feste + veröffentlichte Bewertungen)
  const visible = mergeReviews(stored.filter((r) => r.status === "approved" && getBaseProduct(r.product)).map(toPublicReview), fixed);
  const { count: visibleCount, average } = summarize(visible);

  const list: AdminReview[] = stored
    .filter((r) => r.status === tab.status)
    .map((r) => {
      const product = getBaseProduct(r.product);
      return {
        ...r,
        productTitle: product?.title ?? r.product,
        productExists: Boolean(product),
        productImage: product?.images[0],
      };
    });

  return (
    <>
      <PageHeader
        description="Neue Bewertungen aus dem Shop erscheinen erst, wenn du sie veröffentlichst. So bleibt nichts Unpassendes stehen."
        title="Bewertungen"
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          hint={counts.pending ? "Bitte lesen und entscheiden" : "Alles erledigt"}
          icon={counts.pending ? <span aria-hidden className="size-2 rounded-full bg-amber-500" /> : null}
          label="Warten auf Freigabe"
          value={counts.pending.toLocaleString("de-DE")}
        />
        <Stat
          hint={fixed.length ? `davon ${fixed.length} aus dem bisherigen Shop` : "auf Produktseiten und Produktkarten"}
          label="Im Shop sichtbar"
          value={visibleCount.toLocaleString("de-DE")}
        />
        <Stat
          hint={visibleCount ? <Stars className="size-4" value={average} /> : "Noch keine Bewertungen"}
          label="Durchschnitt im Shop"
          value={visibleCount ? `${formatAverage(average)} von 5` : "–"}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <nav aria-label="Bewertungen nach Status" className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
              {TABS.map((t) => {
                const active = t.key === tab.key;
                const n = counts[t.status];
                return (
                  <li key={t.key}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                      href={tabHref(t.key)}
                      scroll={false}
                    >
                      {t.label}
                      <span
                        className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${active ? "bg-white/20 text-white" : t.status === "pending" && n > 0 ? "bg-amber-100 text-amber-900" : "bg-ink/5 text-ink/60"}`}
                      >
                        {n}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* key: bei Reiterwechsel frisch starten (Meldungen, Sofort-Anzeige) */}
          <ReviewList empty={<EmptyState title={EMPTY[tab.status].title}>{EMPTY[tab.status].text}</EmptyState>} key={tab.key} reviews={list} />

          {tab.status === "approved" && fixed.length ? <FixedReviews titleOf={(handle) => getBaseProduct(handle)?.title ?? handle} /> : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8">
          <Card title="So funktioniert’s">
            <ol className="space-y-3 text-[14px] text-ink/80 leading-relaxed">
              {[
                "Kund:innen schreiben auf der Produktseite unter „Bewertung schreiben“ ihre Erfahrung.",
                "Die Bewertung landet hier unter „Neu“. Im Shop ist sie noch nicht zu sehen.",
                "Du klickst auf „Veröffentlichen“ – sie erscheint sofort im Shop.",
              ].map((step, i) => (
                <li className="flex gap-3" key={step}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent font-medium text-[12px] text-white tabular-nums">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Fair und rechtssicher">
            <div className="space-y-3 text-[14px] text-ink/80 leading-relaxed">
              <p>
                Im Shop steht: <i>„Wir veröffentlichen positive wie negative Bewertungen.“</i> Lehne deshalb nur ab, was beleidigend ist, Werbung enthält oder nichts mit
                dem Produkt zu tun hat – nicht, weil die Bewertung kritisch ist.
              </p>
              <p>
                Setze den Haken <b className="font-medium">„Kauf geprüft“</b> nur, wenn du die Bestellnummer in deinen{" "}
                <Link className="underline underline-offset-4 hover:no-underline" href="/admin/bestellungen">
                  Bestellungen
                </Link>{" "}
                gefunden hast.
              </p>
              <p className="text-muted">E-Mail-Adresse und Bestellnummer siehst nur du – im Shop erscheint nur der Vorname.</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function tabHref(key: TabKey) {
  return key === "neu" ? BASE : `${BASE}?status=${key}`;
}

/** Feste Bewertungen aus data/reviews.json – nur zur Info, nicht änderbar */
function FixedReviews({ titleOf }: { titleOf: (handle: string) => string }) {
  const fixed = getAllReviews();
  return (
    <details className="group mt-6 rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-6 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-medium text-[15px]">Fest eingebaute Bewertungen ({fixed.length})</span>
          <span className="block text-[13px] text-muted">Aus dem bisherigen Shop übernommen – immer sichtbar, hier nicht änderbar.</span>
        </span>
        <svg aria-hidden className="size-4 shrink-0 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <ul className="divide-y divide-line border-line border-t px-6">
        {fixed.map((r) => (
          <li className="py-4" key={r.id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <Stars value={r.rating} />
              <span className="font-medium text-ink">{r.name}</span>
              <span className="text-muted">
                {titleOf(r.product)}
                {r.source ? ` · ${REVIEW_SOURCE_LABEL[r.source]}` : ""}
              </span>
            </div>
            {r.title ? <p className="mt-2 font-medium text-[15px]">{r.title}</p> : null}
            <p className="mt-1 text-[15px] text-ink/80 leading-relaxed">{r.text}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
