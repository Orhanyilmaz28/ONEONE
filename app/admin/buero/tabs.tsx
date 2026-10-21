"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Unterpunkte der Büroverwaltung · `more`: steht unter „Mehr“ (seltener gebraucht) */
export const OFFICE_NAV = [
  { href: "/admin/buero", label: "Übersicht" },
  { href: "/admin/buero/bestellungen", label: "Alle Bestellungen" },
  { href: "/admin/buero/kundenservice", label: "Kundenservice" },
  { href: "/admin/buero/lieferscheine", label: "Lieferscheine" },
  { href: "/admin/buero/versandlisten", label: "Versandlisten" },
  { href: "/admin/buero/export", label: "Excel-Export" },
  { href: "/admin/buero/sammellisten", label: "Artikel-Sammellisten", more: true },
  { href: "/admin/buero/tagesberichte", label: "Tagesberichte", more: true },
  { href: "/admin/buero/berichte", label: "Berichte", more: true },
  { href: "/admin/buero/analysen", label: "Verkaufsanalysen", more: true },
  { href: "/admin/buero/exporthistorie", label: "Exporthistorie", more: true },
  { href: "/admin/buero/stammdaten", label: "Artikelstammdaten prüfen", more: true },
  { href: "/admin/buero/einstellungen", label: "Einstellungen", more: true },
] as const;

type OfficeItem = (typeof OFFICE_NAV)[number];

function isActive(href: string, path: string) {
  return href === "/admin/buero" ? path === href : path.startsWith(href);
}

/** `canExport`: Excel-Export nur zeigen, wenn die Rolle exportieren darf · `canHistory`: Exporthistorie nur mit Recht */
export function OfficeTabs({ canExport = true, canHistory = true }: { canExport?: boolean; canHistory?: boolean }) {
  const path = usePathname() ?? "";
  const items: readonly OfficeItem[] = OFFICE_NAV.filter((item) => (canExport || item.href !== "/admin/buero/export") && (canHistory || item.href !== "/admin/buero/exporthistorie"));
  const main = items.filter((i) => !("more" in i));
  const more = items.filter((i) => "more" in i);
  const activeMore = more.find((i) => isActive(i.href, path));
  const pill = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`;
  return (
    <nav aria-label="Büroverwaltung" className="mb-6">
      <ul className="flex w-fit max-w-full flex-wrap gap-1 rounded-3xl border border-line bg-card p-1">
        {main.map((item) => {
          const active = isActive(item.href, path);
          return (
            <li key={item.href}>
              <Link aria-current={active ? "page" : undefined} className={pill(active)} href={item.href}>
                {item.label}
              </Link>
            </li>
          );
        })}
        {more.length ? (
          <li className="relative">
            {/* Seltener gebrauchte Seiten: aufklappbar, schließt sich nach dem Seitenwechsel */}
            <details className="group" key={path}>
              <summary className={`${pill(Boolean(activeMore))} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                {activeMore ? activeMore.label : "Mehr"}
                <svg aria-hidden className="size-3.5 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-line bg-card p-1.5 shadow-lg sm:right-auto sm:left-0">
                {more.map((item) => {
                  const active = isActive(item.href, path);
                  return (
                    <li key={item.href}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-xl px-3 py-2 text-sm ${active ? "bg-accent text-white" : "text-ink/80 hover:bg-ink/5 hover:text-ink"}`}
                        href={item.href}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
