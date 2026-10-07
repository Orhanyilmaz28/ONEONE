"use client";

import { useEffect, useId, useRef, useState } from "react";
import { REVIEW_LIMITS } from "@/lib/reviews";
import { CheckIcon } from "./icons";

const field = "w-full rounded-xl border border-line bg-white px-4 py-3 outline-none transition focus:border-ink focus-visible:ring-4 focus-visible:ring-ink/5";
const STAR_LABEL = ["", "Gefällt mir gar nicht", "Gefällt mir eher nicht", "Ganz okay", "Gefällt mir gut", "Gefällt mir sehr gut"];

export function ReviewForm({ product, productTitle }: { product: string; productTitle: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [length, setLength] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  /** Zeitpunkt, an dem das Formular geöffnet wurde (Spam-Schutz: Bots sind unmenschlich schnell) */
  const openedAt = useRef(0);
  const starsRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    // Fokus in das geöffnete Formular setzen (Tastatur & Screenreader)
    starsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!rating) {
      setError("Bitte wähle eine Sternebewertung.");
      starsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    setState("sending");
    setError("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product,
        rating,
        name: fd.get("name"),
        email: fd.get("email"),
        title: fd.get("title"),
        text: fd.get("text"),
        order: fd.get("order"),
        website: fd.get("website"),
        elapsed: Date.now() - openedAt.current,
      }),
    }).catch(() => null);
    if (res?.ok) {
      setState("done");
    } else {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Senden fehlgeschlagen – bitte später erneut versuchen.");
      setState("error");
    }
  }

  /** Pfeiltasten in der Sterne-Auswahl (wie bei echten Radio-Buttons) */
  function onStarKey(e: React.KeyboardEvent<HTMLButtonElement>, n: number) {
    const next = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(5, n + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(1, n - 1) : 0;
    if (!next) return;
    e.preventDefault();
    setRating(next);
    starsRef.current?.querySelectorAll<HTMLButtonElement>("button")[next - 1]?.focus();
  }

  if (state === "done") {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-cream p-5" role="status">
        <CheckIcon className="mt-1 size-4 shrink-0" /> Danke! Deine Bewertung wird nach einer kurzen Prüfung veröffentlicht.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        className="inline-flex h-11 items-center rounded-full border border-ink/15 bg-white px-5 font-medium transition hover:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
        data-review-open
        onClick={() => setOpen(true)}
        type="button"
      >
        Bewertung schreiben
      </button>
    );
  }

  const shown = hover || rating;

  return (
    <form aria-labelledby={`${id}-title`} className="space-y-4 rounded-[1.75rem] border border-line bg-white p-6" onSubmit={submit}>
      <p className="font-medium" id={`${id}-title`}>
        Wie gefällt dir {productTitle}?
      </p>
      <div>
        <div aria-label="Sternebewertung" className="flex gap-1" onMouseLeave={() => setHover(0)} ref={starsRef} role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              aria-checked={rating === n}
              aria-label={`${n} von 5 Sternen`}
              className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              key={n}
              onClick={() => {
                setRating(n);
                setError("");
              }}
              onKeyDown={(e) => onStarKey(e, n)}
              onMouseEnter={() => setHover(n)}
              role="radio"
              // nur der gewählte (oder erste) Stern ist per Tab erreichbar
              tabIndex={rating ? (rating === n ? 0 : -1) : n === 1 ? 0 : -1}
              type="button"
            >
              <svg aria-hidden className={`size-8 ${shown >= n ? "text-[#f5a524]" : "text-ink/15"}`} viewBox="0 0 20 20">
                <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7L10 1.5Z" fill="currentColor" />
              </svg>
            </button>
          ))}
        </div>
        <p aria-hidden className="mt-1 h-5 text-muted text-sm">
          {STAR_LABEL[shown]}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="sr-only" htmlFor={`${id}-name`}>
            Vorname (wird angezeigt)
          </label>
          <input autoComplete="given-name" className={field} id={`${id}-name`} maxLength={REVIEW_LIMITS.name} name="name" placeholder="Vorname (wird angezeigt)" required />
        </div>
        <div>
          <label className="sr-only" htmlFor={`${id}-email`}>
            E-Mail (nicht öffentlich)
          </label>
          <input autoComplete="email" className={field} id={`${id}-email`} maxLength={REVIEW_LIMITS.email} name="email" placeholder="E-Mail (nicht öffentlich)" required type="email" />
        </div>
      </div>
      <div>
        <label className="sr-only" htmlFor={`${id}-order`}>
          Bestellnummer (optional)
        </label>
        <input aria-describedby={`${id}-order-hint`} className={field} id={`${id}-order`} maxLength={REVIEW_LIMITS.order} name="order" placeholder="Bestellnummer (optional)" />
        <p className="mt-1 px-1 text-muted text-xs" id={`${id}-order-hint`}>
          Mit Bestellnummer können wir deine Bewertung als „Verifizierter Kauf“ kennzeichnen.
        </p>
      </div>
      <div>
        <label className="sr-only" htmlFor={`${id}-title-input`}>
          Überschrift (optional)
        </label>
        <input className={field} id={`${id}-title-input`} maxLength={REVIEW_LIMITS.title} name="title" placeholder="Überschrift (optional)" />
      </div>
      <div>
        <label className="sr-only" htmlFor={`${id}-text`}>
          Deine Erfahrung
        </label>
        <textarea
          aria-describedby={`${id}-count`}
          className={`${field} min-h-28`}
          id={`${id}-text`}
          maxLength={REVIEW_LIMITS.text}
          minLength={REVIEW_LIMITS.textMin}
          name="text"
          onChange={(e) => setLength(e.currentTarget.value.length)}
          placeholder="Deine Erfahrung"
          required
        />
        <p className="mt-1 text-right text-muted text-xs tabular-nums" id={`${id}-count`}>
          {length < REVIEW_LIMITS.textMin ? `mindestens ${REVIEW_LIMITS.textMin} Zeichen` : `${length.toLocaleString("de-DE")} / ${REVIEW_LIMITS.text.toLocaleString("de-DE")}`}
        </p>
      </div>
      {/* Spam-Schutz: für Menschen unsichtbar, Bots füllen es aus */}
      <div aria-hidden className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website (bitte leer lassen)</label>
        <input autoComplete="off" id={`${id}-website`} name="website" tabIndex={-1} type="text" />
      </div>
      <label className="flex items-start gap-2 text-muted text-sm">
        <input className="mt-1 accent-ink" name="consent" required type="checkbox" />
        Ich bin damit einverstanden, dass meine Bewertung mit Vornamen veröffentlicht wird. Meine E-Mail-Adresse wird nicht angezeigt.
      </label>
      {error ? (
        <p className="text-red-700 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <button className="h-12 rounded-full bg-ink px-6 font-medium text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/20 disabled:opacity-60" disabled={state === "sending"} type="submit">
        {state === "sending" ? "Wird gesendet …" : "Bewertung absenden"}
      </button>
    </form>
  );
}
