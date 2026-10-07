"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Kleine Rückmeldungen im Dashboard (auch vom Newsletter-Bereich genutzt):
 * - Toast: kurze Meldung unten am Bildschirm, optional mit „Rückgängig“
 * - ConfirmButton: Löschen erst nach einer zweiten Bestätigung
 */

export type ToastData = {
  tone: "success" | "error";
  message: string;
  /** z. B. „Rückgängig“ */
  action?: { label: string; onClick: () => void };
  /** z. B. „Im Shop ansehen“ */
  link?: { label: string; href: string };
};

export function useToast() {
  const [toast, setToast] = useState<(ToastData & { key: number }) | null>(null);
  const show = useCallback((t: ToastData) => setToast({ ...t, key: Date.now() }), []);
  const hide = useCallback(() => setToast(null), []);

  // Erfolgsmeldungen verschwinden von selbst, Fehler bleiben stehen
  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const t = setTimeout(() => setToast(null), toast.action ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, show, hide };
}

export function Toast({ toast, onClose }: { toast: (ToastData & { key: number }) | null; onClose: () => void }) {
  return (
    // Der Bereich ist immer da, damit Screenreader neue Meldungen sicher vorlesen
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6" role="status">
      {toast ? (
        <div
          className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_12px_40px_-12px_rgba(20,20,20,0.45)] ${
            toast.tone === "error" ? "border border-red-200 bg-red-50 text-red-900" : "bg-ink text-white"
          }`}
          key={toast.key}
        >
          <span aria-hidden className="mt-0.5 shrink-0">
            {toast.tone === "error" ? (
              <svg className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.01" />
              </svg>
            ) : (
              <svg className="size-4 text-emerald-300" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="m5 12 5 5L20 7" />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
          <span className="flex shrink-0 items-center gap-1">
            {toast.link ? (
              <Link
                className="rounded-full px-2.5 py-0.5 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                href={toast.link.href}
                rel="noreferrer"
                target="_blank"
              >
                {toast.link.label}
              </Link>
            ) : null}
            {toast.action ? (
              <button
                className="rounded-full px-2.5 py-0.5 font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                onClick={() => {
                  toast.action?.onClick();
                  onClose();
                }}
                type="button"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              aria-label="Meldung schließen"
              className="rounded-full p-1 opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              onClick={onClose}
              type="button"
            >
              <svg aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Löschen-Knopf mit Rückfrage („Wirklich löschen?“) – ohne Browser-Popup */
export function ConfirmButton({
  label = "Löschen",
  question = "Wirklich löschen?",
  confirmLabel = "Ja, löschen",
  onConfirm,
  disabled,
  srContext,
  compact,
}: {
  label?: string;
  question?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** zusätzlicher Text für Screenreader, z. B. die E-Mail-Adresse */
  srContext?: string;
  /** Schmale Rückfrage in einer Zeile (für Tabellen): Frage nur für Screenreader */
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    // Fokus sinnvoll setzen: beim Nachfragen auf „Abbrechen“, danach zurück auf „Löschen“
    if (asking) cancelRef.current?.focus();
    else if (wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!asking) {
    return (
      <button
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 font-medium text-red-700 text-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => setAsking(true)}
        ref={triggerRef}
        type="button"
      >
        <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        {label}
        {srContext ? <span className="sr-only"> {srContext}</span> : null}
      </button>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape bricht die Rückfrage ab
    <span
      className={`inline-flex items-center gap-2 rounded-[1.25rem] bg-red-50 ${compact ? "flex-nowrap whitespace-nowrap pl-1" : "flex-wrap pl-3.5"} py-1 pr-1 text-red-900 text-sm ring-1 ring-red-200`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAsking(false);
      }}
      role="group"
    >
      <span className={compact ? "sr-only" : "font-medium"}>{question}</span>
      <button
        className="rounded-full bg-red-600 px-3.5 py-1.5 font-medium text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
        onClick={() => {
          setAsking(false);
          wasAsking.current = false;
          onConfirm();
        }}
        type="button"
      >
        {confirmLabel}
        {srContext ? <span className="sr-only"> {srContext}</span> : null}
      </button>
      <button
        className="rounded-full bg-white px-3.5 py-1.5 font-medium text-ink transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
        onClick={() => setAsking(false)}
        ref={cancelRef}
        type="button"
      >
        Abbrechen
      </button>
    </span>
  );
}
