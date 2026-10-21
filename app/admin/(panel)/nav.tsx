"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Alle Menüpunkte, nach Gruppen geordnet. Die Gruppe „verwaltung“ (selten gebraucht) ist eingeklappt,
 * solange man nicht gerade auf einer ihrer Seiten ist.
 */
export const ADMIN_NAV = [
  { href: "/admin", label: "Übersicht", group: "haupt", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/admin/bestellungen", label: "Bestellungen", group: "haupt", icon: "M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 7Zm4 0V6a4 4 0 0 1 8 0v1" },
  { href: "/admin/buero", label: "Büroverwaltung", group: "haupt", icon: "M4 4h10l6 6v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm10 0v6h6M7 13h10M7 17h7" },
  { href: "/admin/produkte", label: "Produkte", group: "shop", icon: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" },
  { href: "/admin/kunden", label: "Kunden", group: "shop", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10c0-3.9 3.1-6 7-6s7 2.1 7 6M16 3.3a4 4 0 0 1 0 7.4M18 15c2.4.6 4 2.6 4 6" },
  { href: "/admin/bewertungen", label: "Bewertungen", group: "shop", icon: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" },
  { href: "/admin/newsletter", label: "Newsletter", group: "shop", icon: "M3 6h18v12H3zM3 7l9 7 9-7" },
  { href: "/admin/haendler", label: "Händler", group: "partner", icon: "M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 11h18" },
  { href: "/admin/influencer", label: "Influencer", group: "partner", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 19c1.4-2.4 4-3.5 7-3.5s5.6 1.1 7 3.5M4 8.5a9 9 0 0 1 16 0M7 10.5a5.5 5.5 0 0 1 10 0" },
  { href: "/admin/einstellungen", label: "Einstellungen", group: "verwaltung", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" },
  { href: "/admin/datensicherung", label: "Datensicherung", group: "verwaltung", icon: "M12 3v12m0 0-4-4m4 4 4-4M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" },
  { href: "/admin/sicherheit", label: "Sicherheit", group: "verwaltung", icon: "M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3ZM9 12l2 2 4-4" },
  { href: "/admin/speicher", label: "Speicher", group: "verwaltung", icon: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" },
  { href: "/admin/ki-medien", label: "KI-Kennzeichnung", group: "verwaltung", icon: "M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7ZM19 15c.2 2 1 2.8 3 3-2 .2-2.8 1-3 3-.2-2-1-2.8-3-3 2-.2 2.8-1 3-3Z" },
] as const;

type NavItem = (typeof ADMIN_NAV)[number];

const GROUPS: { key: NavItem["group"]; label?: string; collapsible?: boolean }[] = [
  { key: "haupt" },
  { key: "shop", label: "Shop" },
  { key: "partner", label: "Partner" },
  { key: "verwaltung", label: "Verwaltung", collapsible: true },
];

function isActive(href: string, path: string | null) {
  return href === "/admin" ? path === "/admin" : Boolean(path?.startsWith(href));
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3.5 py-2 text-[15px] transition ${active ? "bg-accent text-white" : "text-ink/75 hover:bg-ink/5 hover:text-ink"}`}
      href={item.href}
    >
      <svg aria-hidden className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}

function Chevron() {
  return (
    <svg aria-hidden className="size-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Menü in Gruppen: Tagesgeschäft oben, Seltenes eingeklappt */
function GroupedList({ items, path }: { items: readonly NavItem[]; path: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.key);
        if (!list.length) return null;
        const links = (
          <ul className="flex flex-col gap-0.5">
            {list.map((item) => (
              <li key={item.href}>
                <NavLink active={isActive(item.href, path)} item={item} />
              </li>
            ))}
          </ul>
        );
        if (g.collapsible) {
          const inside = list.some((i) => isActive(i.href, path));
          return (
            <details className="group" key={g.key} open={inside || undefined}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3.5 pb-1 text-[11.5px] text-muted uppercase tracking-[0.1em] outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
                {g.label}
                <Chevron />
              </summary>
              {links}
            </details>
          );
        }
        return (
          <div key={g.key}>
            {g.label ? <p className="px-3.5 pb-1 text-[11.5px] text-muted uppercase tracking-[0.1em]">{g.label}</p> : null}
            {links}
          </div>
        );
      })}
    </div>
  );
}

/** `only`: nur diese Menüpunkte zeigen (Büro-Zugänge sehen nur die Büroverwaltung) */
export function AdminNav({ only }: { only?: string[] }) {
  const path = usePathname();
  const items = only ? ADMIN_NAV.filter((i) => only.includes(i.href)) : ADMIN_NAV;
  const current = items.find((i) => isActive(i.href, path));

  // Nur ein Menüpunkt (Büro-Zugang): einfach anzeigen
  if (items.length <= 1) {
    return (
      <nav aria-label="Dashboard">
        {items.map((item) => (
          <NavLink active={isActive(item.href, path)} item={item} key={item.href} />
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Dashboard">
      {/* Handy: ein Knopf „Menü“, darunter klappt die Liste auf (schließt sich nach dem Wechseln der Seite) */}
      <details className="group lg:hidden" key={path ?? ""}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="text-muted">Menü · </span>
            {current?.label ?? "Dashboard"}
          </span>
          <svg aria-hidden className="size-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="mt-3">
          <GroupedList items={items} path={path} />
        </div>
      </details>
      <div className="hidden lg:block">
        <GroupedList items={items} path={path} />
      </div>
    </nav>
  );
}
