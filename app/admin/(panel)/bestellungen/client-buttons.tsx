"use client";

import { useEffect, useState } from "react";
import { btn } from "@/components/admin/ui";

/** Kopiert Text in die Zwischenablage (z. B. die Lieferadresse für den DHL-Paketschein) */
export function CopyButton({ text, label = "Kopieren", className = "" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 font-medium text-[13px] text-ink/80 transition hover:border-ink/40 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${className}`}
      onClick={copy}
      type="button"
    >
      {state === "done" ? (
        <svg aria-hidden className="size-3.5 text-emerald-700" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : (
        <svg aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <rect height="13" rx="2" width="13" x="9" y="9" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span aria-live="polite">{state === "done" ? "Kopiert" : state === "error" ? "Ging nicht – bitte markieren" : label}</span>
    </button>
  );
}

/** „Drucken“ öffnet den Druckdialog des Browsers (dort auch „Als PDF speichern“) */
export function PrintButton() {
  return (
    <button className={btn} onClick={() => window.print()} type="button">
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      Drucken
    </button>
  );
}
