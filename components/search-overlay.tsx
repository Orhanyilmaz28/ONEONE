"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { useShopData } from "@/lib/shop-data";
import { CloseIcon, SearchIcon } from "./icons";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function searchProducts(products: Product[], query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  return products
    .map((p) => {
      const haystack = normalize(
        [p.title, p.handle.replace(/-/g, " "), p.subtitle, p.productType, p.vendor, ...p.tags, p.descriptionHtml.replace(/<[^>]+>/g, " ")]
          .filter(Boolean)
          .join(" ")
      );
      const title = normalize(p.title);
      let score = 0;
      for (const t of terms) {
        if (!haystack.includes(t)) {
          return { p, score: 0 };
        }
        score += title.includes(t) ? 3 : 1;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.p);
}

const FOCUSABLE = ["a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])", "textarea:not([disabled])", "[tabindex]"]
  .map((sel) => `${sel}:not([tabindex="-1"])`)
  .join(", ");

/**
 * Barrierefreies Overlay (Suche, Handy-Menü): Fokus springt hinein, Tab bleibt im Dialog,
 * Escape schließt, danach geht der Fokus zurück auf den auslösenden Knopf.
 */
export function useModalDialog({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
  lockScroll = false,
}: {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Seite dahinter nicht mitscrollen (für Vollbild-Overlays) */
  lockScroll?: boolean;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Fokus erst setzen, wenn das Overlay im DOM ist (Einblend-Animation läuft parallel)
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    });

    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    if (lockScroll) html.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      const root = dialogRef.current;
      if (e.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      if (lockScroll) html.style.overflow = prevOverflow;
      // Fokus zurück, sofern er nicht schon woanders sinnvoll gelandet ist
      if (previous?.isConnected && (!document.activeElement || document.activeElement === document.body || dialogRef.current?.contains(document.activeElement))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, dialogRef, initialFocusRef, lockScroll]);
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const ids = useId();
  const listId = `${ids}-treffer`;
  const optionId = (i: number) => `${ids}-treffer-${i}`;
  const { products } = useShopData();
  const results = useMemo(() => searchProducts(products, query).slice(0, 6), [products, query]);
  const trimmed = query.trim();

  useModalDialog({ open, onClose, dialogRef, initialFocusRef: inputRef });

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Markierten Treffer bei Pfeiltasten sichtbar halten
  useEffect(() => {
    if (results.length) document.getElementById(`${ids}-treffer-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, results.length, ids]);

  // Ansage für Screenreader
  const status = !trimmed ? "" : results.length === 0 ? `Keine Treffer für „${trimmed}“` : `${results.length} Treffer – mit den Pfeiltasten auswählen, Enter öffnet`;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[10vh] backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          >
            <motion.div
              animate={{ y: 0, scale: 1 }}
              aria-label="Produktsuche"
              aria-modal="true"
              className="w-full max-w-2xl overflow-hidden rounded-3xl bg-paper shadow-2xl"
              exit={{ y: -10, scale: 0.98 }}
              initial={{ y: -10, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              ref={dialogRef}
              role="dialog"
            >
              <div className="flex items-center gap-3 border-line border-b px-5 focus-within:border-ink">
                <SearchIcon className="size-5 shrink-0 text-muted" />
                <input
                  aria-activedescendant={results.length ? optionId(active) : undefined}
                  aria-autocomplete="list"
                  aria-controls={listId}
                  aria-expanded={results.length > 0}
                  aria-label="Produkte suchen"
                  autoComplete="off"
                  className="h-16 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
                  enterKeyHint="search"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => Math.min(a + 1, results.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => Math.max(a - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (!trimmed) return;
                      const hit = results[active];
                      router.push(hit ? `/products/${hit.handle}` : `/products?q=${encodeURIComponent(trimmed)}`);
                      onClose();
                    }
                  }}
                  placeholder="Wonach suchst du?"
                  ref={inputRef}
                  role="combobox"
                  spellCheck={false}
                  value={query}
                />
                <button aria-label="Suche schließen" className="shrink-0 rounded-full p-2 hover:bg-cream" onClick={onClose} type="button">
                  <CloseIcon />
                </button>
              </div>
              <p aria-live="polite" className="sr-only">
                {status}
              </p>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {trimmed && results.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-muted">Keine Treffer für „{trimmed}“</p>
                    <Link className="mt-3 inline-flex text-sm underline underline-offset-4" href="/products" onClick={onClose}>
                      Alle Produkte ansehen
                    </Link>
                  </div>
                ) : null}
                <div aria-label="Suchergebnisse" id={listId} role="listbox">
                  {results.map((p, i) => (
                    <Link
                      aria-selected={i === active}
                      className={`flex items-center gap-4 rounded-2xl p-3 transition ${i === active ? "bg-cream" : ""}`}
                      href={`/products/${p.handle}`}
                      id={optionId(i)}
                      key={p.handle}
                      onClick={onClose}
                      onMouseEnter={() => setActive(i)}
                      role="option"
                      tabIndex={-1}
                    >
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-cream">
                        <ProductImage aiLabel="compact" product={p} sizes="56px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.title}</p>
                        {p.subtitle ? <p className="truncate text-muted text-sm">{p.subtitle}</p> : null}
                      </div>
                      <span className="text-sm">{formatPrice(Math.min(...p.variants.map((v) => v.price)))}</span>
                    </Link>
                  ))}
                </div>
                {query ? null : (
                  <p className="p-6 text-center text-muted text-sm">
                    Tippe, um sofort durch alle {products.length} Produkte zu suchen.
                    <span className="hidden sm:inline"> Tipp: Mit Strg/⌘ + K öffnest du die Suche jederzeit.</span>
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
