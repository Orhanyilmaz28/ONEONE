"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useShopData } from "@/lib/shop-data";
import type { Collection } from "@/lib/types";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";
import { Logo } from "./logo";
import { SearchOverlay, useModalDialog } from "./search-overlay";
import { TopBar } from "./trust";

export function Header({
  brand,
  collections,
}: {
  brand: string;
  logo?: string;
  collections: Collection[];
}) {
  const { count, open } = useCart();
  const { accounts } = useShopData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Handy-Menü: Fokus im Menü halten, Escape schließt, Seite dahinter scrollt nicht mit
  useModalDialog({ open: menuOpen, onClose: closeMenu, dialogRef: menuRef, lockScroll: true });

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const nav = [
    { href: "/products", label: "Shop" },
    ...collections.slice(0, 5).map((c) => ({ href: `/collections/${c.handle}`, label: c.title })),
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>
      <div data-print-hide>
        <TopBar />
      </div>

      <header className="sticky top-3 z-40 px-3 pt-3 sm:px-4" data-print-hide>
        <div className="relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-line/80 bg-card pr-1.5 pl-3 shadow-[0_10px_40px_-18px_rgba(20,20,20,0.25)] sm:pr-2 sm:pl-5">
          <div className="flex items-center gap-1">
            <button
              aria-controls="mobil-menue"
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label="Menü öffnen"
              className="-ml-1 rounded-full p-2 lg:hidden"
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <MenuIcon />
            </button>
            <Link aria-label={`${brand} – Startseite`} className="shrink-0 text-ink" href="/">
              <Logo className="h-[22px] w-auto min-[330px]:h-[24px] min-[370px]:h-[28px] sm:h-[30px] xl:h-[32px]" compact title={brand} />
            </Link>
          </div>

          <nav aria-label="Hauptnavigation" className="hidden items-center gap-0.5 lg:flex">
            {nav.map((item) => (
              <Link
                aria-current={pathname === item.href ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-[15px] transition hover:bg-ink/5 xl:px-3.5 ${"wide" in item ? "hidden xl:block" : ""} ${pathname === item.href ? "bg-ink/5" : ""}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K"
              aria-label="Suche öffnen"
              className="rounded-full p-2 transition hover:bg-ink/5 sm:p-2.5"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <SearchIcon />
            </button>
            {accounts ? (
              <Link aria-label="Mein Konto" className="hidden rounded-full p-2 transition hover:bg-ink/5 sm:block sm:p-2.5" href="/konto">
                <UserIcon />
              </Link>
            ) : null}
            <button
              aria-label={`Warenkorb ${count} Artikel`}
              className="flex h-10 items-center gap-1.5 rounded-full bg-accent pr-1.5 pl-3 text-[15px] sm:gap-2 sm:pr-2 sm:pl-4 text-black transition hover:bg-accent-dark"
              onClick={open}
              type="button"
            >
              <BagIcon className="size-4" />
              <span className="hidden sm:inline">Warenkorb</span>{" "}
              <AnimatePresence mode="popLayout">
                <motion.span
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-6 items-center justify-center rounded-full bg-card font-medium text-[12px] text-ink max-sm:size-[22px]"
                  initial={{ scale: 0.4, opacity: 0 }}
                  key={count}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-x-8 -bottom-px h-px overflow-hidden">
            <div className="sd-progress h-full origin-left bg-gradient-to-r from-lilac via-peach to-sky [transform:scaleX(0)]" />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            aria-label="Menü"
            aria-modal="true"
            className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-paper lg:hidden"
            exit={{ opacity: 0 }}
            id="mobil-menue"
            initial={{ opacity: 0 }}
            ref={menuRef}
            role="dialog"
          >
            <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="anim-blob absolute -top-24 -right-24 size-80 rounded-full bg-lilac/60 blur-3xl" />
              <div className="anim-blob absolute bottom-0 -left-24 size-80 rounded-full bg-peach/60 blur-3xl [animation-delay:-5s]" />
            </div>
            <div className="relative flex h-20 items-center justify-between px-6">
              <Logo className="h-[30px] w-auto" compact title={brand} />
              <button aria-label="Menü schließen" className="rounded-full bg-card p-2.5 shadow" onClick={() => setMenuOpen(false)} type="button">
                <CloseIcon />
              </button>
            </div>
            <nav aria-label="Hauptnavigation" className="relative flex flex-col gap-1 px-6 pt-6 pb-10">
              {nav.map((item, i) => (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 20 }}
                  key={item.href}
                  transition={{ delay: 0.05 + 0.05 * i, ease: [0.22, 1, 0.36, 1], duration: 0.6 }}
                >
                  <Link
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="t-h1 block border-line border-b py-3"
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              {accounts ? (
                <Link className="mt-6 inline-flex items-center gap-2 text-[17px]" href="/konto" onClick={() => setMenuOpen(false)}>
                  <UserIcon /> Mein Konto
                </Link>
              ) : null}
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SearchOverlay onClose={closeSearch} open={searchOpen} />
    </MotionConfig>
  );
}
