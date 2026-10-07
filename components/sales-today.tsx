"use client";

import { useEffect, useState } from "react";

/** Zeigt „X× heute bestellt“ – nur mit echten Stripe-Daten und erst ab `min` Bestellungen. */
export function SalesToday({ handle, min = 2 }: { handle: string; min?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/sales-today")
      .then((r) => r.json() as Promise<{ products: Record<string, number> }>)
      .then((d) => alive && setCount(d.products?.[handle] ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [handle]);
  if (count < min) return null;
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="relative flex size-2">
        <span className="anim-ripple absolute inset-0 rounded-full bg-emerald-500" />
        <span className="relative size-2 rounded-full bg-emerald-500" />
      </span>
      Heute bereits {count}× bestellt
    </p>
  );
}
