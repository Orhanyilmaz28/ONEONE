"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Übersicht", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/admin/bestellungen", label: "Bestellungen", icon: "M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 7Zm4 0V6a4 4 0 0 1 8 0v1" },
  { href: "/admin/produkte", label: "Produkte", icon: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" },
  { href: "/admin/bewertungen", label: "Bewertungen", icon: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" },
  { href: "/admin/newsletter", label: "Newsletter", icon: "M3 6h18v12H3zM3 7l9 7 9-7" },
  { href: "/admin/ki-medien", label: "KI-Kennzeichnung", icon: "M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7ZM19 15c.2 2 1 2.8 3 3-2 .2-2.8 1-3 3-.2-2-1-2.8-3-3 2-.2 2.8-1 3-3Z" },
  { href: "/admin/kunden", label: "Kunden", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10c0-3.9 3.1-6 7-6s7 2.1 7 6M16 3.3a4 4 0 0 1 0 7.4M18 15c2.4.6 4 2.6 4 6" },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ADMIN_NAV.map((item) => {
        const active = item.href === "/admin" ? path === "/admin" : path?.startsWith(item.href);
        return (
          <Link
            className={`flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${active ? "bg-accent text-black" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
            href={item.href}
            key={item.href}
          >
            <svg aria-hidden className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
              <path d={item.icon} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
