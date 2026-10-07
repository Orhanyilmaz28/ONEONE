"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    ttEnhance?: (root?: ParentNode) => void;
  }
}

/** Lädt public/enhance.js und bindet die Extras nach jeder Navigation neu. */
export function Enhance() {
  const pathname = usePathname();
  useEffect(() => {
    const id = requestAnimationFrame(() => window.ttEnhance?.());
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return <Script onReady={() => window.ttEnhance?.()} src="/enhance.js" strategy="afterInteractive" />;
}
