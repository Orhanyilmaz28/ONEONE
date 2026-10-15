"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { CODE_RE, normalizeCode } from "./influencer-rules";
import { useShopData } from "./shop-data";
import { type MixResult, mixDiscount } from "./mix";
import type { CartLine, Product, Variant } from "./types";

const STORAGE_KEY = "shop-cart-v2";
/** Influencer-Code (aus dem Link ?code=… oder selbst eingegeben) */
const CODE_KEY = "shop-ref-code";

export type Promo = { code: string; pct: number };

async function lookupCode(raw: string): Promise<Promo | string> {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) return "Bitte einen gültigen Code eingeben.";
  try {
    const res = await fetch(`/api/code?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    const data = (await res.json()) as { valid?: boolean; pct?: number; error?: string };
    if (data.valid && typeof data.pct === "number") return { code, pct: data.pct };
    return data.error ?? "Diesen Code gibt es nicht (mehr).";
  } catch {
    return "Code konnte nicht geprüft werden – bitte später erneut versuchen.";
  }
}

type Action =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; line: CartLine }
  | { type: "set"; variantId: string; quantity: number }
  | { type: "put"; line: CartLine }
  | { type: "clear" };

function reducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case "hydrate":
      return action.lines;
    case "add": {
      const existing = state.find((l) => l.variantId === action.line.variantId);
      if (existing) {
        return state.map((l) =>
          l.variantId === action.line.variantId
            ? { ...l, quantity: Math.min(99, l.quantity + action.line.quantity) }
            : l
        );
      }
      return [...state, action.line];
    }
    case "set":
      return action.quantity <= 0
        ? state.filter((l) => l.variantId !== action.variantId)
        : state.map((l) =>
            l.variantId === action.variantId
              ? { ...l, quantity: Math.min(99, action.quantity) }
              : l
          );
    case "put": {
      // Menge direkt setzen und Zeile anlegen, falls sie fehlt (Mix-Konfigurator)
      const q = Math.max(0, Math.min(99, action.line.quantity));
      if (!state.some((l) => l.variantId === action.line.variantId)) return q > 0 ? [...state, { ...action.line, quantity: q }] : state;
      return q === 0 ? state.filter((l) => l.variantId !== action.line.variantId) : state.map((l) => (l.variantId === action.line.variantId ? { ...l, quantity: q } : l));
    }
    case "clear":
      return [];
    default:
      return state;
  }
}

export type ResolvedLine = CartLine & { product: Product; variant: Variant };

type CartContextValue = {
  lines: ResolvedLine[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (handle: string, variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  /** Menge setzen, Zeile bei Bedarf anlegen – ohne den Warenkorb zu öffnen (Mix-Konfigurator) */
  setLine: (handle: string, variantId: string, quantity: number) => void;
  /** Mix-Rabatt (ab 2 Sorten, nach Tray-Anzahl) */
  mix: MixResult;
  /** Eingelöster Influencer-Code */
  promo: Promo | null;
  applyCode: (raw: string) => Promise<string | null>;
  removeCode: () => void;
  /** Rabatt durch den Code (Cent) */
  codeDiscount: number;
  /** Tatsächlicher Rabatt: der höhere von Mix- und Code-Rabatt */
  discount: number;
  discountBy: "mix" | "code" | null;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, []);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const { products } = useShopData();
  const [promo, setPromo] = useState<Promo | null>(null);

  // Code aus dem Link (?code=MAX10) übernehmen, sonst einen gespeicherten Code erneut prüfen
  useEffect(() => {
    let fromUrl: string | null = null;
    let saved: string | null = null;
    try {
      fromUrl = new URLSearchParams(window.location.search).get("code");
      saved = localStorage.getItem(CODE_KEY);
    } catch {
      // ignorieren
    }
    const candidate = fromUrl || saved;
    if (!candidate) return;
    lookupCode(candidate).then((r) => {
      if (typeof r === "string") {
        if (!fromUrl) {
          try {
            localStorage.removeItem(CODE_KEY);
          } catch {
            // ignorieren
          }
        }
        return;
      }
      setPromo(r);
      try {
        localStorage.setItem(CODE_KEY, r.code);
      } catch {
        // ignorieren
      }
    });
  }, []);

  const applyCode = useCallback(async (raw: string) => {
    const r = await lookupCode(raw);
    if (typeof r === "string") return r;
    setPromo(r);
    try {
      localStorage.setItem(CODE_KEY, r.code);
    } catch {
      // ignorieren
    }
    return null;
  }, []);

  const removeCode = useCallback(() => {
    setPromo(null);
    try {
      localStorage.removeItem(CODE_KEY);
    } catch {
      // ignorieren
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        dispatch({ type: "hydrate", lines: JSON.parse(raw) as CartLine[] });
      }
    } catch {
      // Speicher nicht verfügbar – leerer Warenkorb
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignorieren
    }
  }, [state, hydrated]);

  const lines = useMemo(() => {
    const resolved: ResolvedLine[] = [];
    for (const line of state) {
      const product = products.find((p) => p.handle === line.handle);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (product && variant) {
        resolved.push({ ...line, product, variant });
      }
    }
    return resolved;
  }, [state, products]);

  const add = useCallback((handle: string, variantId: string, quantity = 1) => {
    dispatch({ type: "add", line: { handle, variantId, quantity } });
    setOpen(true);
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    dispatch({ type: "set", variantId, quantity });
  }, []);

  const setLine = useCallback((handle: string, variantId: string, quantity: number) => {
    dispatch({ type: "put", line: { handle, variantId, quantity } });
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((n, l) => n + l.quantity * l.variant.price, 0);
    const mix = mixDiscount(lines.map((l) => ({ handle: l.handle, quantity: l.quantity, price: l.variant.price })));
    const codeDiscount = promo ? Math.round((subtotal * promo.pct) / 100) : 0;
    const discountBy = codeDiscount > 0 && codeDiscount > mix.discount ? "code" : mix.discount > 0 ? "mix" : null;
    return {
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal,
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add,
      setQuantity,
      setLine,
      mix,
      promo,
      applyCode,
      removeCode,
      codeDiscount,
      discount: Math.max(mix.discount, codeDiscount),
      discountBy,
      clear: () => dispatch({ type: "clear" }),
    };
  }, [lines, isOpen, add, setQuantity, setLine, promo, applyCode, removeCode]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart muss innerhalb von <CartProvider> verwendet werden");
  }
  return ctx;
}
