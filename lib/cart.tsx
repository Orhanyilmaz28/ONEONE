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
import { useShopData } from "./shop-data";
import type { CartLine, Product, Variant } from "./types";

const STORAGE_KEY = "shop-cart-v2";

type Action =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; line: CartLine }
  | { type: "set"; variantId: string; quantity: number }
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
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, []);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const { products } = useShopData();

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

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: lines.reduce((n, l) => n + l.quantity * l.variant.price, 0),
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      add,
      setQuantity,
      clear: () => dispatch({ type: "clear" }),
    }),
    [lines, isOpen, add, setQuantity]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart muss innerhalb von <CartProvider> verwendet werden");
  }
  return ctx;
}
