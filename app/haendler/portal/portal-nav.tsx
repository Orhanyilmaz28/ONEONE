"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/haendler/portal", label: "Übersicht", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/haendler/portal/preise", label: "Preisliste", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/haendler/portal/artikelpaesse", label: "Artikelpässe", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
  { href: "/haendler/portal/konto", label: "Konto & Dokumente", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c0-4 3.6-6 8-6s8 2 8 6" },
];

export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Händlerbereich" className="no-scrollbar mt-4 flex gap-1 overflow-x-auto lg:mt-8 lg:flex-col">
      {ITEMS.map((i) => {
        const active = i.href === "/haendler/portal" ? path === i.href : path?.startsWith(i.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${active ? "bg-accent font-bold text-black" : "text-ink/75 hover:bg-white/5 hover:text-ink"}`}
            href={i.href}
            key={i.href}
          >
            <svg aria-hidden className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d={i.icon} />
            </svg>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
