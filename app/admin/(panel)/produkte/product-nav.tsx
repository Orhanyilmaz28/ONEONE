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

/** Reiter eines Produkts: Preise & Verfügbarkeit | Bilder & Texte */
export function ProductTabs({ handle, active }: { handle: string; active: "preise" | "inhalt" }) {
  const tabs = [
    { key: "preise", label: "Preise & Verfügbarkeit", href: `/admin/produkte/${handle}` },
    { key: "inhalt", label: "Bilder, Texte & Varianten", href: `/admin/produkte/${handle}/inhalt` },
  ] as const;
  return (
    <nav aria-label="Bereiche des Produkts" className="no-scrollbar -mt-2 mb-6 overflow-x-auto">
      <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              aria-current={t.key === active ? "page" : undefined}
              className={`block whitespace-nowrap rounded-full px-4 py-2 text-[14px] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${t.key === active ? "bg-accent text-black" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
              href={t.href}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
