"use client";

import { useState, useTransition } from "react";
import { btn } from "@/components/admin/ui";
import { type MailFormState, sendPreviewTest } from "../../actions";

/** Vorschau im Rahmen (Handy- oder Computerbreite) und „Beispiel an mich schicken“ */
export function Preview({ tag, html, text, canSend }: { tag: string; html: string; text: string; canSend: boolean }) {
  const [width, setWidth] = useState<"handy" | "computer">("handy");
  const [state, setState] = useState<MailFormState>({});
  const [pending, start] = useTransition();
  const tab = (key: "handy" | "computer", l: string) => (
    <button
      aria-pressed={width === key}
      className={`rounded-full px-3.5 py-1.5 text-[13px] ring-1 ${width === key ? "bg-ink text-white ring-ink" : "text-ink/75 ring-line hover:ring-ink/30"}`}
      onClick={() => setWidth(key)}
      type="button"
    >
      {l}
    </button>
  );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab("handy", "Handy")}
        {tab("computer", "Computer")}
        <span className="flex-1" />
        <button className={btn} disabled={pending || !canSend} onClick={() => start(async () => setState(await sendPreviewTest(tag)))} title={canSend ? undefined : "Erst den E-Mail-Versand einrichten"} type="button">
          {pending ? "Wird verschickt …" : "Als Beispiel an mich schicken"}
        </button>
      </div>
      {state.error || state.message ? (
        <p className={`mb-4 rounded-2xl px-4 py-3 text-[14px] ${state.error ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`} role="status">
          {state.error ?? `✓ ${state.message}`}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-3xl bg-[#efefea] p-3 ring-1 ring-line sm:p-6">
        <iframe
          className="mx-auto block h-[1100px] w-full rounded-2xl bg-white"
          key={width}
          // Ohne Skripte; gleiche Herkunft nur, damit die Höhe an den Inhalt angepasst werden kann
          onLoad={(e) => {
            const f = e.currentTarget;
            const h = f.contentDocument?.documentElement.scrollHeight;
            if (h) f.style.height = `${h + 8}px`;
          }}
          sandbox="allow-same-origin"
          srcDoc={html}
          style={{ maxWidth: width === "handy" ? 390 : 720 }}
          title="Vorschau der E-Mail"
        />
      </div>
      <details className="mt-5 rounded-2xl border border-line p-4">
        <summary className="cursor-pointer font-medium text-[14px]">Text-Fassung (für Mail-Programme ohne Bilder)</summary>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-[13px] text-ink/80 leading-relaxed">{text}</pre>
      </details>
    </div>
  );
}
