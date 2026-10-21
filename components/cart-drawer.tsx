"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { depositFor, formatPrice } from "@/lib/format";
import { mixDiscount } from "@/lib/mix";
import { SORT_COLORS } from "@/lib/pack-contents";
import { useShopData } from "@/lib/shop-data";
import { ArrowIcon, CloseIcon, MinusIcon, PlusIcon } from "./icons";
import { LogoMark } from "./logo";
import { MixBooster } from "./mix-booster";
import { ProductImage } from "./product-image";
import { Rolling } from "./rolling";
import { shippingRules } from "./trust";

/** Sortenfarbe als halbtransparentes rgba (für das kurze Aufleuchten neuer Zeilen) */
function tint(handle: string, alpha: number) {
  const hex = (SORT_COLORS[handle] ?? "#a8e652").replace("#", "");
  const n = Number.parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function CartDrawer() {
  const { lines, subtotal, isOpen, close, setQuantity, setLine, count, mix, promo, codeDiscount, discount, discountBy } = useCart();
  const { products } = useShopData();
  // Sorten, die man im Warenkorb noch dazunehmen kann (verfügbar und noch nicht drin)
  const addable = products.filter((p) => p.variants.length === 1 && p.variants[0].available && !p.onRequest && !lines.some((l) => l.handle === p.handle));
  const net = subtotal - discount;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Versandkosten aus den Einstellungen im Dashboard
  const shipping = shippingRules(useShopData().settings.shipping);
  const freeFrom = shipping.freeFrom;
  const deposit = lines.reduce((n, l) => n + depositFor(l.variant, l.quantity), 0);
  const remaining = freeFrom ? Math.max(0, freeFrom - net) : 0;
  // Standardversand wie an der Kasse (gleiche Regel wie in app/api/checkout): kostenlos ab Grenze, sonst Versandkosten
  const shippingCost = shipping.alwaysFree || (freeFrom && net >= freeFrom) ? 0 : shipping.cost;
  // Voraussichtliche Endsumme: Ware nach Rabatt + Pfand + Standardversand (alles inkl. MwSt.)
  const total = net + deposit + shippingCost;
  // Handy: Einzelposten eingeklappt, damit die Artikel sichtbar bleiben (ab Tablet immer offen)
  const [details, setDetails] = useState(false);
  const progress = freeFrom ? Math.min(1, net / freeFrom) : 1;

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Tastatur & Screenreader: Fokus in den Warenkorb – beim Schließen zurück, wo er vorher war
    const previous = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen, close]);

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          ...(promo ? { code: promo.code } : {}),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!(res.ok && data.url)) {
        throw new Error(data.error ?? "Checkout fehlgeschlagen");
      }
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  // Rabatt-Hinweis: +1 Tray einer noch fehlenden Sorte (sonst der ersten im Warenkorb) und was die nächste Stufe spart
  const suggest = addable[0];
  const first = lines[0];
  const boost = suggest ? () => setLine(suggest.handle, suggest.variants[0].id, 1) : first ? () => setQuantity(first.variantId, first.quantity + 1) : undefined;
  const boostLabel = suggest ? `+1 Tray ${suggest.title}` : first ? `+1 Tray ${first.product.title}` : undefined;
  const addTrays = mix.sorts < 2 ? 1 : (mix.next?.missing ?? 0);
  const sim = mixDiscount([
    ...lines.map((l) => ({ handle: l.handle, quantity: l.quantity, price: l.variant.price })),
    suggest ? { handle: suggest.handle, quantity: addTrays, price: suggest.variants[0].price } : { handle: first?.handle ?? "", quantity: addTrays, price: first?.variant.price ?? 0 },
  ]);

  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            animate={{ x: 0 }}
            aria-label="Warenkorb"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-paper shadow-2xl"
            exit={{ x: "100%" }}
            initial={{ x: "100%" }}
            role="dialog"
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <header className="flex items-center justify-between border-line border-b px-4 py-3 sm:px-6 sm:py-5">
              <h2 className="t-h3">
                Warenkorb <span className="text-muted text-base">({count})</span>
              </h2>
              <button
                aria-label="Warenkorb schließen"
                className="rounded-full p-2 transition hover:bg-cream"
                onClick={close}
                ref={closeRef}
                type="button"
              >
                <CloseIcon />
              </button>
            </header>

            {lines.length > 0 ? (
              <div className="border-line border-b px-4 py-3 sm:px-6">
                <MixBooster addLabel={boostLabel} mix={mix} onAdd={boost} sim={sim} />
              </div>
            ) : null}

            {/* Hinweis zum kostenlosen Versand – entfällt, wenn es im Shop keinen gibt */}
            {lines.length > 0 && (freeFrom || shipping.alwaysFree) ? (
              <div className="border-line border-b px-4 py-3 sm:px-6 sm:py-4">
                <p className="text-sm">
                  {remaining > 0 ? (
                    <>
                      Noch <strong>{formatPrice(remaining)}</strong> bis zum kostenlosen Versand
                    </>
                  ) : (
                    <>🎉 Du erhältst <strong>kostenlosen Versand</strong></>
                  )}
                </p>
                {freeFrom ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
                    <motion.div
                      animate={{ width: `${progress * 100}%` }}
                      className="h-full rounded-full bg-accent"
                      initial={false}
                      transition={{ type: "spring", damping: 25 }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-4 py-2 sm:px-6 sm:py-4">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <LogoMark className="anim-bob mb-2 h-16 w-auto text-ink/20" />
                  <p className="t-h3">Dein Warenkorb ist leer</p>
                  <p className="text-muted text-sm">Such dir deine Lieblingssorten aus.</p>
                  <Link
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-paper text-sm transition hover:bg-accent"
                    href="/products"
                    onClick={close}
                  >
                    Jetzt stöbern <ArrowIcon />
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {lines.map((line) => (
                      <motion.li
                        animate={{ opacity: 1, height: "auto", backgroundColor: tint(line.handle, 0) }}
                        className="-mx-3 overflow-hidden rounded-2xl px-3"
                        exit={{ opacity: 0, height: 0 }}
                        initial={{ opacity: 0, height: 0, backgroundColor: tint(line.handle, 0.22) }}
                        key={line.variantId}
                        layout
                        transition={{ backgroundColor: { duration: 1.4, ease: "easeOut" }, default: { type: "spring", stiffness: 380, damping: 34 } }}
                      >
                        <div className="flex gap-4 py-4">
                          <Link
                            className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-cream"
                            href={`/products/${line.handle}`}
                            onClick={close}
                          >
                            <ProductImage aiLabel="compact" product={line.product} sizes="96px" />
                          </Link>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{line.product.title}</p>
                                {line.product.variants.length > 1 ? (
                                  <p className="text-muted text-sm">{line.variant.title}</p>
                                ) : null}
                              </div>
                              <p className="shrink-0 text-sm tabular-nums">
                                <Rolling cents={line.variant.price * line.quantity} />
                              </p>
                            </div>
                            <div className="mt-auto flex items-center justify-between">
                              <div className="flex items-center rounded-full border border-line">
                                <button
                                  aria-label="Menge verringern"
                                  className="p-2 transition hover:text-accent"
                                  onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                                  type="button"
                                >
                                  <MinusIcon className="size-3.5" />
                                </button>
                                <span className="relative w-6 overflow-hidden text-center text-sm tabular-nums">
                                  <AnimatePresence initial={false} mode="popLayout">
                                    <motion.span animate={{ y: 0, opacity: 1 }} className="inline-block" exit={{ y: -10, opacity: 0 }} initial={{ y: 10, opacity: 0 }} key={line.quantity} transition={{ duration: 0.18 }}>
                                      {line.quantity}
                                    </motion.span>
                                  </AnimatePresence>
                                </span>
                                <button
                                  aria-label="Menge erhöhen"
                                  className="p-2 transition hover:text-accent"
                                  onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                                  type="button"
                                >
                                  <PlusIcon className="size-3.5" />
                                </button>
                              </div>
                              <button
                                className="text-muted text-xs underline-offset-4 hover:underline"
                                onClick={() => setQuantity(line.variantId, 0)}
                                type="button"
                              >
                                Entfernen
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
              {lines.length > 0 ? (
                <section aria-label="Mix zusammenstellen" className="mt-3 rounded-2xl border border-line p-4">
                  <p className="font-medium text-sm">Mix zusammenstellen</p>
                  <p className="mt-1 text-muted text-xs">Weitere Sorten mit einem Tipp dazulegen – jede Sorte zählt für den Mix-Rabatt.</p>
                  {addable.length ? (
                    <motion.ul className="mt-3 grid grid-cols-2 gap-2" layout>
                      <AnimatePresence initial={false}>
                        {addable.map((p) => (
                          <motion.li animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} initial={{ opacity: 0, scale: 0.85 }} key={p.handle} layout transition={{ duration: 0.2 }}>
                            <button
                              aria-label={`1 Tray ${p.title} hinzufügen`}
                              className="flex w-full items-center gap-2 rounded-xl border border-line p-1.5 pr-2 text-left text-xs transition hover:border-accent"
                              onClick={() => setLine(p.handle, p.variants[0].id, 1)}
                              style={{ ["--c" as string]: SORT_COLORS[p.handle] ?? "#a8e652" }}
                              type="button"
                            >
                              <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-cream">
                                <ProductImage product={p} sizes="36px" />
                              </span>
                              <span className="min-w-0 flex-1 leading-tight">{p.title}</span>
                              <PlusIcon className="size-3.5 shrink-0 text-[var(--c)]" />
                            </button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </motion.ul>
                  ) : null}
                  <Link className="mt-3 inline-block text-accent text-xs underline-offset-4 hover:underline" href="/mix" onClick={close}>
                    Im Mix-Konfigurator öffnen →
                  </Link>
                </section>
              ) : null}
            </div>

            {lines.length > 0 ? (
              <footer className="space-y-3 border-line border-t px-4 py-4 sm:space-y-4 sm:px-6 sm:py-5">
                <div className={`${details ? "space-y-3" : "hidden"} sm:block sm:space-y-3`} id="cart-details">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">Zwischensumme</span>
                  <span className="tabular-nums">
                    <Rolling cents={subtotal} />
                  </span>
                </div>
                <AnimatePresence initial={false}>
                {discountBy === "mix" ? (
                  <motion.div animate={{ opacity: 1, height: "auto" }} className="flex items-baseline justify-between overflow-hidden text-sm" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} key="mix-rabatt">
                    <span className="text-accent">
                      Mix-Rabatt ({mix.pct} %, {mix.sorts} Sorten · {mix.trays} Trays)
                    </span>
                    <span className="text-accent tabular-nums">
                      <Rolling cents={mix.discount} prefix="−" />
                    </span>
                  </motion.div>
                ) : null}
                {discountBy === "code" && promo ? (
                  <motion.div animate={{ opacity: 1, height: "auto" }} className="flex items-baseline justify-between overflow-hidden text-sm" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }} key="code-rabatt">
                    <span className="text-accent">
                      Code {promo.code} ({promo.pct} %)
                    </span>
                    <span className="text-accent tabular-nums">
                      <Rolling cents={codeDiscount} prefix="−" />
                    </span>
                  </motion.div>
                ) : null}
                </AnimatePresence>
                {deposit > 0 ? (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted">Einwegpfand (0,25 € je Dose/Flasche)</span>
                    <span className="tabular-nums">
                      <Rolling cents={deposit} />
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">
                    Versand (DHL)
                    {remaining > 0 ? <span className="text-xs"> · ab {formatPrice(freeFrom ?? 0)} kostenlos</span> : null}
                  </span>
                  <span className="tabular-nums">{shippingCost ? formatPrice(shippingCost) : "kostenlos"}</span>
                </div>
                <PromoField mixHigher={Boolean(promo && discountBy === "mix")} />
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span>
                    Gesamt <span className="text-muted text-xs">(voraussichtlich)</span>
                  </span>
                  <span className="t-h3 tabular-nums">
                    <Rolling cents={total} />
                  </span>
                </div>
                <button
                  aria-controls="cart-details"
                  aria-expanded={details}
                  className="-mt-1 text-muted text-xs underline-offset-4 hover:text-ink hover:underline sm:hidden"
                  onClick={() => setDetails((v) => !v)}
                  type="button"
                >
                  {details ? "Details ausblenden ▴" : `Details: Ware, ${discount > 0 ? "Rabatt, " : ""}Pfand, Versand${promo ? "" : ", Rabattcode"} ▾`}
                </button>
                <p className="text-muted text-xs">
                  {deposit > 0 ? "inkl. MwSt. und Pfand" : "inkl. MwSt."}{shipping.express ? ` · Express-Versand (${formatPrice(shipping.express)}) an der Kasse wählbar` : ""}
                </p>
                {error ? (
                  <p className="rounded-xl bg-accent/10 px-3 py-2 text-accent-dark text-sm">{error}</p>
                ) : null}
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 font-medium text-paper transition hover:bg-accent disabled:opacity-60"
                  disabled={loading}
                  onClick={checkout}
                  type="button"
                >
                  {loading ? "Weiterleitung …" : "Sicher zur Kasse"}
                  {loading ? null : <ArrowIcon />}
                </button>
                <p className="text-center text-muted text-xs">
                  Kreditkarte · PayPal · Apple Pay · Google Pay · Klarna · SEPA
                </p>
              </footer>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
    </MotionConfig>
  );
}

/** Feld für den Influencer-Code – eingeklappt, damit der Warenkorb ruhig bleibt */
function PromoField({ mixHigher }: { mixHigher: boolean }) {
  const { promo, applyCode, removeCode } = useCart();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (promo) {
    return (
      <div className="text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted">
            Code <b className="text-ink">{promo.code}</b> eingelöst
          </span>
          <button aria-label="Code entfernen" className="text-muted text-xs underline underline-offset-4 hover:text-ink" onClick={removeCode} type="button">
            entfernen
          </button>
        </p>
        {mixHigher ? <p className="mt-1 text-muted text-xs">Dein Mix-Rabatt ist höher – er wird verwendet.</p> : null}
      </div>
    );
  }
  if (!open) {
    return (
      <button className="text-muted text-sm underline-offset-4 hover:text-ink hover:underline" onClick={() => setOpen(true)} type="button">
        Rabattcode?
      </button>
    );
  }
  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setBusy(true);
    setError(await applyCode(value));
    setBusy(false);
  }
  return (
    <form className="text-sm" onSubmit={submit}>
      <div className="flex gap-2">
        <input
          aria-label="Rabattcode"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 uppercase outline-none focus:border-accent"
          maxLength={24}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Code eingeben"
          value={value}
        />
        <button className="h-10 shrink-0 rounded-full border border-accent px-4 font-medium text-accent transition hover:bg-accent hover:text-paper disabled:opacity-60" disabled={busy || !value.trim()} type="submit">
          {busy ? "…" : "Einlösen"}
        </button>
      </div>
      {error ? <p className="mt-1 text-accent-dark text-xs">{error}</p> : null}
    </form>
  );
}
