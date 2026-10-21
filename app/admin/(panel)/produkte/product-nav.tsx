import Link from "next/link";

/** „← Alle Produkte“ */
export function BackLink() {
  return (
    <Link
      className="-ml-1 mb-4 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[14px] text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      href="/admin/produkte"
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        <path d="m15 6-6 6 6 6" />
      </svg>
      Alle Produkte
    </Link>
  );
}
