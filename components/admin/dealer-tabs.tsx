import Link from "next/link";

const TABS = [
  { href: "/admin/haendler", label: "Anfragen" },
  { href: "/admin/haendler/preise", label: "Händlerpreise" },
  { href: "/admin/haendler/artikelpaesse", label: "Artikelpässe" },
];

/** Umschalter im Bereich „Händler“ */
export function DealerTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Händler" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          aria-current={t.href === active ? "page" : undefined}
          className={`rounded-full border px-4 py-2 text-sm transition ${t.href === active ? "border-ink bg-accent text-white" : "border-line bg-card hover:border-ink/40"}`}
          href={t.href}
          key={t.href}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
