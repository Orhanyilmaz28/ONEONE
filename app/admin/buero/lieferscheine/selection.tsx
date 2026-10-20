"use client";

import { useEffect, useState } from "react";

const boxes = (form: string) => [...document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="auswahl"][form="${form}"]:not(:disabled)`)];

/** Auswahl auf dieser Seite: alle markieren, Auswahl entfernen, Anzahl anzeigen (ohne JavaScript bleiben die Kästchen einzeln nutzbar) */
export function SelectionTools({ form, onPage }: { form: string; onPage: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(boxes(form).filter((b) => b.checked).length);
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [form]);
  const setAll = (on: boolean) => {
    for (const b of boxes(form)) b.checked = on;
    setCount(on ? boxes(form).length : 0);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <button className="rounded-full border border-line bg-card px-3 py-1.5 font-medium text-ink/80 transition hover:border-ink/40" onClick={() => setAll(true)} type="button">
        Alle {onPage} auf dieser Seite auswählen
      </button>
      <button className="rounded-full border border-line bg-card px-3 py-1.5 font-medium text-ink/80 transition hover:border-ink/40" onClick={() => setAll(false)} type="button">
        Auswahl entfernen
      </button>
      <span aria-live="polite" className="text-muted">
        {count} ausgewählt
      </span>
    </div>
  );
}
