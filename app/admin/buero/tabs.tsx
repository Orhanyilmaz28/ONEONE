"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Unterpunkte der Büroverwaltung */
export const OFFICE_NAV = [
  { href: "/admin/buero", label: "Übersicht" },
  { href: "/admin/buero/bestellungen", label: "Alle Bestellungen" },
  { href: "/admin/buero/export", label: "Excel-Export" },
  { href: "/admin/buero/lieferscheine", label: "Lieferscheine" },
  { href: "/admin/buero/versandlisten", label: "Versandlisten" },
  { href: "/admin/buero/sammellisten", label: "Artikel-Sammellisten" },
  { href: "/admin/buero/tagesberichte", label: "Tagesberichte" },
  { href: "/admin/buero/exporthistorie", label: "Exporthistorie" },
  { href: "/admin/buero/berichte", label: "Berichte" },
  { href: "/admin/buero/stammdaten", label: "Artikelstammdaten prüfen" },
  { href: "/admin/buero/einstellungen", label: "Einstellungen" },
] as const;

/** `canExport`: Excel-Export nur zeigen, wenn die Rolle exportieren darf · `canHistory`: Exporthistorie nur mit Recht */
export function OfficeTabs({ canExport = true, canHistory = true }: { canExport?: boolean; canHistory?: boolean }) {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Büroverwaltung" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
        {OFFICE_NAV.filter((item) => (canExport || item.href !== "/admin/buero/export") && (canHistory || item.href !== "/admin/buero/exporthistorie")).map((item) => {
          const active = item.href === "/admin/buero" ? path === item.href : path.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
