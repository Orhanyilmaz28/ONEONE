"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useOptimistic, useTransition } from "react";
import { Badge, btn, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { Stars } from "@/components/stars";
import type { ReviewStatus, StoredReview } from "@/lib/review-store";
import { deleteReviewAction, type ReviewActionResult, setReviewStatusAction, setReviewVerifiedAction } from "./actions";
import { ConfirmButton, Toast, useToast } from "./feedback";

/** Bewertung + Produktinfos (vom Server aufbereitet) */
export type AdminReview = StoredReview & {
  productTitle: string;
  /** false = Produkt gibt es nicht mehr im Katalog */
  productExists: boolean;
  productImage?: { src: string; alt: string };
};

const STATUS_BADGE: Record<ReviewStatus, { tone: "amber" | "green" | "neutral"; label: string }> = {
  pending: { tone: "amber", label: "Neu" },
  approved: { tone: "green", label: "Veröffentlicht" },
  rejected: { tone: "neutral", label: "Abgelehnt" },
};

type Change = { type: "remove"; id: string } | { type: "verify"; id: string; verified: boolean };

/**
 * Liste mit Sofort-Anzeige und Meldungen. Bleibt auch bei leerer Liste stehen (zeigt dann `empty`),
 * damit die Meldung nach dem Bearbeiten der letzten Bewertung nicht verschwindet.
 */
export function ReviewList({ reviews, empty }: { reviews: AdminReview[]; empty: ReactNode }) {
  const { toast, show, hide } = useToast();
  const [pending, startTransition] = useTransition();
  // Sofort-Anzeige: Karte verschwindet direkt, Haken springt direkt um – der Server bestätigt im Hintergrund
  const [list, apply] = useOptimistic(reviews, (current: AdminReview[], change: Change) =>
    change.type === "remove" ? current.filter((r) => r.id !== change.id) : current.map((r) => (r.id === change.id ? { ...r, verified: change.verified } : r)),
  );

  function run(change: Change, action: () => Promise<ReviewActionResult>, after?: (res: Extract<ReviewActionResult, { ok: true }>) => void) {
    startTransition(async () => {
      apply(change);
      const res = await action().catch((): ReviewActionResult => ({ ok: false, error: "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung." }));
      if (res.ok) {
        if (after) after(res);
        else show({ tone: "success", message: res.message });
      } else {
        show({ tone: "error", message: res.error });
      }
    });
  }

  function setStatus(review: AdminReview, status: ReviewStatus) {
    const previous = review.status;
    run({ type: "remove", id: review.id }, () => setReviewStatusAction(review.id, status), (res) =>
      show({
        tone: "success",
        message: res.message,
        link: status === "approved" && review.productExists ? { label: "Ansehen ↗", href: `/products/${review.product}#bewertungen` } : undefined,
        action: { label: "Rückgängig", onClick: () => run({ type: "remove", id: review.id }, () => setReviewStatusAction(review.id, previous)) },
      }),
    );
  }

  return (
    <>
      {list.length ? null : empty}
      <ul aria-busy={pending} className="space-y-4">
        {list.map((r) => (
          <li key={r.id}>
            <ReviewItem
              onDelete={() => run({ type: "remove", id: r.id }, () => deleteReviewAction(r.id))}
              onStatus={(status) => setStatus(r, status)}
              onVerify={(verified) => run({ type: "verify", id: r.id, verified }, () => setReviewVerifiedAction(r.id, verified))}
              review={r}
            />
          </li>
        ))}
      </ul>
      <Toast onClose={hide} toast={toast} />
    </>
  );
}

function ReviewItem({
  review: r,
  onStatus,
  onVerify,
  onDelete,
}: {
  review: AdminReview;
  onStatus: (status: ReviewStatus) => void;
  onVerify: (verified: boolean) => void;
  onDelete: () => void;
}) {
  const badge = STATUS_BADGE[r.status];
  const headingId = `review-${r.id}`;
  return (
    <article aria-labelledby={headingId} className="rounded-3xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)] sm:p-6">
      <div className="flex gap-4">
        {r.productImage ? (
          <Image
            alt=""
            className="hidden h-[84px] w-16 shrink-0 rounded-xl bg-cream object-cover sm:block"
            height={84}
            sizes="64px"
            src={r.productImage.src}
            width={64}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Stars className="size-[18px]" value={r.rating} />
            <span className="font-medium text-sm tabular-nums">{r.rating} von 5</span>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {r.verified ? (
              <Badge tone="green">
                <svg aria-hidden className="size-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Kauf geprüft
              </Badge>
            ) : null}
            <time className="text-[13px] text-muted tabular-nums sm:ml-auto" dateTime={r.createdAt}>
              {formatDateTime(r.createdAt)}
            </time>
          </div>

          <p className="mt-2 text-[13px] text-muted">
            zu{" "}
            {r.productExists ? (
              <Link className="font-medium text-ink underline-offset-4 hover:underline" href={`/products/${r.product}`} rel="noreferrer" target="_blank">
                {r.productTitle} ↗
              </Link>
            ) : (
              <span className="text-ink">{r.productTitle} (nicht mehr im Shop)</span>
            )}
          </p>

          {/* Ohne Überschrift: unsichtbare Überschrift für Screenreader */}
          <h3 className={r.title ? "mt-3 font-medium text-[17px] leading-snug" : "sr-only"} id={headingId}>
            {r.title || `Bewertung von ${r.name}`}
          </h3>
          <p className="mt-1.5 whitespace-pre-line break-words text-[15px] text-ink/85 leading-relaxed">{r.text}</p>

          <div className="mt-4 rounded-2xl bg-paper px-4 py-3 text-[13px]">
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Name im Shop</dt>
              <dd className="font-medium">{r.name}</dd>
              <dt className="text-muted">E-Mail (privat)</dt>
              <dd className="min-w-0 truncate">
                <a className="underline-offset-4 hover:underline" href={`mailto:${r.email}`}>
                  {r.email}
                </a>
              </dd>
              {r.order ? (
                <>
                  <dt className="text-muted">Bestellnummer</dt>
                  <dd className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium tabular-nums">{r.order}</span>
                    <Link className="text-ink/70 underline underline-offset-4 hover:text-ink" href={`/admin/bestellungen?q=${encodeURIComponent(r.order)}`}>
                      in Bestellungen suchen
                    </Link>
                  </dd>
                </>
              ) : null}
            </dl>
            {/* „Kauf geprüft“ gehört zur Bestellnummer – deshalb im gleichen Kasten */}
            <div className="mt-3 border-line border-t pt-3">
              <label className="flex w-fit cursor-pointer items-start gap-2.5 text-sm">
                <input
                  checked={r.verified === true}
                  className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded accent-ink"
                  onChange={(e) => onVerify(e.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  <span className="font-medium">Kauf geprüft</span>
                  <span className="text-muted"> – zeigt im Shop „Verifizierter Kauf“</span>
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {r.status !== "approved" ? (
              <button className={btn} disabled={!r.productExists} onClick={() => onStatus("approved")} title={r.productExists ? undefined : "Das Produkt gibt es nicht mehr"} type="button">
                <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Veröffentlichen
              </button>
            ) : null}
            {r.status !== "rejected" ? (
              <button className={btnSecondary} onClick={() => onStatus("rejected")} type="button">
                {r.status === "approved" ? "Aus dem Shop nehmen" : "Ablehnen"}
              </button>
            ) : (
              <button className={btnSecondary} onClick={() => onStatus("pending")} type="button">
                Zurück zu „Neu“
              </button>
            )}
            <span className="sm:ml-auto">
              <ConfirmButton onConfirm={onDelete} srContext={`Bewertung von ${r.name}`} />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
