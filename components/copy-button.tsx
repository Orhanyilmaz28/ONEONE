"use client";

import { useState } from "react";

/** Text in die Zwischenablage kopieren (mit kurzer Bestätigung) */
export function CopyButton({ text, label = "Kopieren", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback für ältere Browser
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1800);
  }
  return (
    <button aria-live="polite" className={className} onClick={copy} type="button">
      {done ? "Kopiert ✓" : label}
    </button>
  );
}
