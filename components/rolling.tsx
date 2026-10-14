"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

/** Zahl rollt weich zum neuen Wert (bei „Bewegung reduzieren“ sofort) */
export function useRolling(value: number) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return shown;
}

export function Rolling({ cents, prefix = "" }: { cents: number; prefix?: string }) {
  const v = useRolling(cents);
  return (
    <>
      {prefix}
      {formatPrice(Math.round(v))}
    </>
  );
}

export function RollingInt({ value }: { value: number }) {
  return <>{Math.round(useRolling(value))}</>;
}
