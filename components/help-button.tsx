"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { HELP_EMAIL, HELP_TOPICS, type HelpAnswer, answerQuestion, answerTopic } from "@/lib/help-assistant";
import { useShopData } from "@/lib/shop-data";
import { ArrowIcon, ChatIcon, CloseIcon } from "./icons";

type Entry = { from: "kunde"; text: string } | { from: "assistent"; answer: HelpAnswer };

const WELCOME: HelpAnswer = {
  topic: "start",
  text: "Hallo! Tipp einfach auf eine Frage oder schreib unten deine eigene.",
  links: [],
};

/**
 * Schwebender Hilfe-Knopf mit Fragen-Assistent – erscheint nach dem ersten Scrollen (per Tastatur sofort erreichbar).
 * Feste Antworten aus lib/help-assistant.ts, ohne KI: Fragen werden nicht gespeichert oder verschickt.
 */
export function HelpButton() {
  const { products, settings } = useShopData();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([{ from: "assistent", answer: WELCOME }]);
  const [input, setInput] = useState("");
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape schließt, Fokus zurück auf den Knopf
  useEffect(() => {
    if (!open) return;
    // Am Handy nicht ins Textfeld springen: die Tastatur würde die Fragen verdecken
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    else closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Neueste Frage mit Antwort oben im Fenster zeigen (die Fragen-Liste steht darunter)
  useEffect(() => {
    const log = logRef.current;
    const last = log?.querySelector<HTMLElement>("[data-last-question]");
    if (log && last) log.scrollTop = last.offsetTop - 12;
  }, [entries]);

  const ask = (question: string, answer: HelpAnswer) => {
    setEntries((list) => [...list, { from: "kunde", text: question }, { from: "assistent", answer }]);
  };

  const onTopic = (id: string, label: string) => {
    const answer = answerTopic(id, settings.shipping);
    if (answer) ask(label, answer);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    ask(q, answerQuestion(q, settings.shipping, products));
    setInput("");
  };

  return (
    <>
      {open ? (
        <section
          aria-label="Fragen-Assistent"
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100dvh-5rem)] sm:max-h-[min(44rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-[1.75rem] border border-line bg-card text-ink shadow-[0_24px_60px_-16px_rgba(0,0,0,0.8)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[23rem]"
          data-print-hide
          id={panelId}
        >
          <header className="flex items-center gap-3 border-line border-b px-4 py-3">
            <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-accent text-black">
              <ChatIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-tight">Fragen? Wir helfen gern.</p>
              <p className="text-muted text-xs">Schnelle Antworten, rund um die Uhr</p>
            </div>
            <button
              aria-label="Assistent schließen"
              ref={closeRef}
              className="flex size-9 items-center justify-center rounded-full transition hover:bg-line"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              type="button"
            >
              <CloseIcon className="size-4" />
            </button>
          </header>

          <div className="relative flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[15px]" ref={logRef}>
            <div aria-live="polite" className="space-y-3">
            {entries.map((entry, i) =>
              entry.from === "kunde" ? (
                <p
                  className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-black"
                  data-last-question={i === entries.length - 2 ? "" : undefined}
                  key={i}
                >
                  {entry.text}
                </p>
              ) : (
                <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-paper px-3.5 py-2.5" key={i}>
                  <p>{entry.answer.text}</p>
                  {entry.answer.links.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.answer.links.map((l) => (
                        <Link
                          className="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1 font-medium text-accent text-sm transition hover:bg-accent hover:text-black"
                          href={l.href}
                          key={l.href}
                          onClick={() => setOpen(false)}
                        >
                          {l.label} <ArrowIcon className="size-3.5" />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            )}
            </div>

            {/* Alle vorgegebenen Fragen, immer sichtbar unter dem Verlauf */}
            <div className="pt-2">
              <p className="mb-2 font-medium text-muted text-xs uppercase tracking-wider">{entries.length > 1 ? "Weitere Fragen" : "Häufige Fragen"}</p>
              <ul className="flex flex-wrap gap-2">
                {HELP_TOPICS.map((t) => (
                  <li key={t.id}>
                    <button
                      className="rounded-full border border-accent/50 px-3 py-1.5 text-left text-accent text-sm transition hover:bg-accent hover:text-black"
                      onClick={() => onTopic(t.id, t.label)}
                      type="button"
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-line border-t px-4 pt-3 pb-4">
            <form className="flex gap-2" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor={`${panelId}-q`}>
                Deine Frage
              </label>
              <input
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-[16px] text-ink outline-none placeholder:text-muted focus:border-accent"
                id={`${panelId}-q`}
                maxLength={200}
                onChange={(e) => setInput(e.target.value)}
                placeholder="z. B. Was kostet der Versand?"
                ref={inputRef}
                value={input}
              />
              <button aria-label="Frage senden" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-black transition hover:opacity-85" type="submit">
                <ArrowIcon className="size-4" />
              </button>
            </form>
            <p className="mt-2 text-center text-muted text-xs">
              Lieber persönlich?{" "}
              <a className="text-accent underline" href={`mailto:${HELP_EMAIL}`}>
                {HELP_EMAIL}
              </a>
            </p>
          </div>
        </section>
      ) : null}

      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className="sd-help help-btn group fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-full border border-line bg-card py-2 pr-4 pl-2 text-[15px] text-ink shadow-[0_14px_40px_-12px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
        data-print-hide
        onClick={() => setOpen(true)}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-accent text-black">
          <ChatIcon className="size-4" />
        </span>
        {/* Sichtbarer Text = vorgelesener Name (kein abweichendes aria-label) */}
        <span className="hidden sm:inline">Fragen? Wir helfen gern.</span>
        <span className="sm:hidden">Hilfe</span>
      </button>
    </>
  );
}
