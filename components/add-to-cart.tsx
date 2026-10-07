"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { cansOf, depositFor, formatPrice } from "@/lib/format";
import { useShopData } from "@/lib/shop-data";
import type { Product } from "@/lib/types";
import { CheckIcon, MinusIcon, PlusIcon } from "./icons";
import { FeatureIcon } from "./feature-icons";
import { Price } from "./price";
import { FlagDE, formatPriceShort, shippingRules } from "./trust";

export function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const initial = product.variants.find((v) => v.available) ?? product.variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(initial?.options ?? {});
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  // Versandkosten aus den Einstellungen im Dashboard
  const shipping = shippingRules(useShopData().settings.shipping);

  const variant = useMemo(
    () =>
      product.variants.find((v) => product.options.every((o) => v.options[o.name] === selected[o.name])) ??
      (product.options.length === 0 ? product.variants[0] : undefined),
    [product, selected]
  );

  function isValueAvailable(optionName: string, value: string) {
    return product.variants.some(
      (v) =>
        v.available &&
        v.options[optionName] === value &&
        product.options.every((o) => o.name === optionName || v.options[o.name] === selected[o.name])
    );
  }

  const canBuy = Boolean(variant?.available);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline gap-3">
        {variant ? (
          <Price className="font-medium text-2xl tracking-tight" compareAtPrice={variant.compareAtPrice} price={variant.price} />
        ) : (
          <span className="text-muted">Kombination nicht verfügbar</span>
        )}
        {variant?.compareAtPrice && variant.compareAtPrice > variant.price ? (
          <span className="rounded-full bg-lilac/40 px-2.5 py-1 font-medium text-xs">
            −{Math.round((1 - variant.price / variant.compareAtPrice) * 100)} %
          </span>
        ) : null}
      </div>
      {variant && cansOf(variant) > 1 ? (
        <p className="-mt-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-ink px-3 py-1 font-medium text-white text-xs">{cansOf(variant)} Dosen</span>
          <span className="font-medium">{formatPrice(Math.round(variant.price / cansOf(variant)))} pro Dose</span>
          <span className="text-muted">+ {formatPrice(depositFor(variant, 1))} Pfand</span>
        </p>
      ) : null}
      <p className="t-small -mt-6 text-muted">
        {shipping.alwaysFree ? (
          <>
            inkl. MwSt., zzgl. Pfand ·{" "}
            <a className="underline underline-offset-2 hover:text-ink" href="/versand">
              versandkostenfrei
            </a>
          </>
        ) : (
          <>
            inkl. MwSt., zzgl. Pfand und{" "}
            <a className="underline underline-offset-2 hover:text-ink" href="/versand">
              Versand
            </a>
            {shipping.freeFrom ? <> · ab {formatPriceShort(shipping.freeFrom)} versandkostenfrei</> : null}
          </>
        )}
      </p>

      {product.options.map((option) => (
        <fieldset key={option.name}>
          <div className="mb-3 flex items-center justify-between">
            <legend className="text-sm">
              {option.name}: <span className="font-medium">{selected[option.name]}</span>
            </legend>
          </div>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const active = selected[option.name] === value;
              const available = isValueAvailable(option.name, value);
              return (
                <button
                  aria-pressed={active}
                  className={`relative rounded-full border px-5 py-2.5 text-sm transition ${
                    active ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-ink"
                  } ${available ? "" : "text-muted line-through decoration-1"}`}
                  key={value}
                  onClick={() => setSelected((s) => ({ ...s, [option.name]: value }))}
                  type="button"
                >
                  {option.name.startsWith("Farbe") ? (
                    <span className="mr-2 inline-block size-3.5 rounded-full align-[-2px] ring-1 ring-current/30" style={{ background: SWATCH[value] ?? "#ccc" }} />
                  ) : null}
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-3">
        <div className="flex shrink-0 items-center rounded-full border border-line bg-white">
          <button aria-label="Weniger" className="p-4" onClick={() => setQuantity((q) => Math.max(1, q - 1))} type="button">
            <MinusIcon />
          </button>
          <span className="w-6 text-center tabular-nums">{quantity}</span>
          <button aria-label="Mehr" className="p-4" onClick={() => setQuantity((q) => Math.min(99, q + 1))} type="button">
            <PlusIcon />
          </button>
        </div>
        <motion.button
          className="anim-shine relative flex min-w-56 flex-1 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full bg-ink px-6 py-4 font-medium text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-muted"
          disabled={!canBuy}
          onClick={() => {
            if (variant) {
              add(product.handle, variant.id, quantity);
              setAdded(true);
              setTimeout(() => setAdded(false), 1800);
            }
          }}
          type="button"
          whileTap={{ scale: 0.97 }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-2"
              exit={{ y: -20, opacity: 0 }}
              initial={{ y: 20, opacity: 0 }}
              key={added ? "added" : "idle"}
            >
              {added ? (
                <>
                  <CheckIcon /> Hinzugefügt
                </>
              ) : canBuy ? (
                <>In den Warenkorb · {variant ? formatPrice(variant.price * quantity) : ""}</>
              ) : (
                "Ausverkauft"
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      <ul className="grid gap-2 rounded-[1.5rem] border border-line bg-white p-4 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2.5">
          <FlagDE />
          Händler & Versand aus Deutschland
        </li>
        <li className="flex items-center gap-2.5">
          <FeatureIcon className="size-5" draw={false} name="versand" />
          {canBuy ? "Auf Lager · 1–3 Werktage" : "Derzeit nicht vorrätig"}
        </li>
        <li className="flex items-center gap-2.5">
          <FeatureIcon className="size-5" draw={false} name="antibakteriell" />
          Sicher bezahlen · SSL-verschlüsselt
        </li>
        <li className="flex items-center gap-2.5">
          <FeatureIcon className="size-5" draw={false} name="nachhaltig" />
          Pfand 0,25 € je Dose
        </li>
      </ul>
    </div>
  );
}

const SWATCH: Record<string, string> = {};
