import Link from "next/link";
import { getApprovedReviews } from "@/lib/review-store";
import { mergeReviews, REVIEW_SOURCE_LABEL, type Review, summarize } from "@/lib/reviews";
import { CheckIcon } from "./icons";
import { ReviewForm } from "./review-form";
import { formatAverage, Stars } from "./stars";

export function ReviewDisclosure() {
  return (
    <p className="text-muted text-xs leading-relaxed">
      <strong className="font-medium">Hinweis zur Echtheit:</strong> Bewertungen mit „Verifizierter Kauf“ stammen von Kund:innen, deren Bestellung
      wir anhand der Bestellnummer geprüft haben. Wir veröffentlichen positive wie negative Bewertungen.
    </p>
  );
}

const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });

/** `product` = Produkt anzeigen, zu dem die Bewertung gehört (z. B. auf der Startseite) */
export function ReviewCard({ review, product }: { review: Review; product?: { handle: string; title: string } }) {
  const date = review.date ? new Date(review.date) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  return (
    <figure className="flex h-full flex-col rounded-[1.75rem] border border-line bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Stars value={review.rating} />
          {validDate ? (
            <time className="text-muted text-xs" dateTime={validDate.toISOString()}>
              {monthFmt.format(validDate)}
            </time>
          ) : null}
        </span>
        {review.verified ? (
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-cream px-2.5 py-1 text-xs">
            <CheckIcon className="size-3" /> Verifizierter Kauf
          </span>
        ) : null}
      </div>
      {review.title ? <p className="mt-4 font-medium">{review.title}</p> : null}
      <blockquote className="mt-3 flex-1 whitespace-pre-line text-[17px] leading-relaxed">„{review.text}“</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-line border-t pt-4 text-sm">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-card font-medium text-accent">
          {review.name.charAt(0)}
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{review.name}</span>
          <span className="block truncate text-muted text-xs">
            {product ? (
              <Link className="hover:text-ink" href={`/products/${product.handle}`}>
                {product.title}
              </Link>
            ) : null}
            {product && review.source ? " · " : null}
            {review.source ? REVIEW_SOURCE_LABEL[review.source] : null}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Bewertungsbereich auf der Produktseite.
 * Lädt zusätzlich die im Dashboard veröffentlichten Bewertungen dieses Produkts und zeigt sie zusammen
 * mit den übergebenen (festen) Bewertungen – neueste zuerst, jede nur einmal.
 */
export async function ProductReviews({ handle, title, reviews: given = [], sold }: { handle: string; title: string; reviews?: Review[]; sold: number | null }) {
  const reviews = mergeReviews(await getApprovedReviews(handle), given);
  const { count, average, distribution } = summarize(reviews);
  return (
    <section className="mt-16 lg:mt-20 scroll-mt-28" id="bewertungen">
      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="t-eyebrow">Bewertungen</p>
          <h2 className="t-h2 mt-3">Das sagen Kund:innen</h2>
          {count ? (
            <div className="mt-6 rounded-[1.75rem] bg-cream p-6">
              <p className="flex items-end gap-3">
                <span className="t-display leading-none">{formatAverage(average)}</span>
                <span className="pb-1 text-muted">von 5</span>
              </p>
              <div className="mt-3">
                <Stars className="size-5" value={average} />
              </div>
              <p className="mt-2 text-muted text-sm">
                {count} {count === 1 ? "Bewertung" : "Bewertungen"}
                {sold ? ` · über ${sold.toLocaleString("de-DE")}× verkauft` : ""}
              </p>
              <ul className="mt-5 space-y-1.5">
                {distribution.map((d) => (
                  <li className="flex items-center gap-3 text-sm" key={d.stars}>
                    <span className="w-8 text-muted">{d.stars} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-card">
                      <span className="block h-full rounded-full bg-[#f5a524]" style={{ width: `${count ? (d.count / count) * 100 : 0}%` }} />
                    </span>
                    <span className="w-5 text-right text-muted">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="t-lead mt-4">Noch keine Bewertungen – sei die erste Person, die ihre Erfahrung teilt.</p>
          )}
          <div className="mt-6">
            <ReviewForm product={handle} productTitle={title} />
          </div>
        </div>
        <div>
          {count ? (
            <div className="grid gap-4 md:grid-cols-2">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          ) : null}
          <div className="mt-6">
            <ReviewDisclosure />
          </div>
        </div>
      </div>
    </section>
  );
}
