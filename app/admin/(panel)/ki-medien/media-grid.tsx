"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AI_MEDIA_LABEL, type AiMediaType } from "@/lib/ai-media";
import { setMediaType } from "./actions";
import type { MediaItem } from "./data";

const CHOICES: { type: AiMediaType; label: string; short: string }[] = [
  { type: "original", label: "Echt", short: "Echt" },
  { type: "ai-generated", label: "KI-generiert", short: "KI-gen." },
  { type: "ai-edited", label: "KI-bearbeitet", short: "KI-bearb." },
];

const FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "video", label: "Videos" },
  { key: "image", label: "Fotos" },
  { key: "ki", label: "Als KI markiert" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

type Status = { key: string; tone: "ok" | "error"; text: string } | null;

export function MediaGrid({ items }: { items: MediaItem[] }) {
  // Lokaler Stand: sofort umschalten, der Server speichert im Hintergrund
  const [types, setTypes] = useState<Record<string, AiMediaType>>(() => Object.fromEntries(items.map((i) => [i.key, i.type])));
  const [filter, setFilter] = useState<FilterKey>("alle");
  const [status, setStatus] = useState<Status>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const counts = useMemo(
    () => ({
      alle: items.length,
      video: items.filter((i) => i.kind === "video").length,
      image: items.filter((i) => i.kind === "image").length,
      ki: items.filter((i) => types[i.key] !== "original").length,
    }),
    [items, types],
  );
  const visible = items.filter((i) => (filter === "alle" ? true : filter === "ki" ? types[i.key] !== "original" : i.kind === filter));

  function choose(item: MediaItem, type: AiMediaType) {
    const before = types[item.key];
    if (before === type) return;
    setTypes((t) => ({ ...t, [item.key]: type }));
    setSavingKey(item.key);
    clearTimeout(timer.current);
    startTransition(async () => {
      const res = await setMediaType(item.key, type).catch(() => ({ error: "Keine Verbindung. Bitte versuche es noch einmal." }));
      setSavingKey((k) => (k === item.key ? null : k));
      if ("error" in res) {
        setTypes((t) => ({ ...t, [item.key]: before }));
        setStatus({ key: item.key, tone: "error", text: res.error });
        return;
      }
      setStatus({
        key: item.key,
        tone: "ok",
        text: type === "original" ? `„${item.title}“ ist als echt markiert – keine Kennzeichnung.` : `„${item.title}“: ${AI_MEDIA_LABEL[type]} – im Shop in wenigen Sekunden sichtbar.`,
      });
      timer.current = setTimeout(() => setStatus(null), 4000);
    });
  }

  return (
    <div>
      <nav aria-label="Medien filtern" className="no-scrollbar mb-5 overflow-x-auto">
        <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
          {FILTERS.map((f) => (
            <li key={f.key}>
              <button
                aria-pressed={filter === f.key}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition ${filter === f.key ? "bg-accent text-black" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                onClick={() => setFilter(f.key)}
                type="button"
              >
                {f.label}
                <span className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${filter === f.key ? "bg-white/20" : "bg-ink/5 text-ink/60"}`}>{counts[f.key]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-3xl border border-line border-dashed bg-white/60 px-6 py-14 text-center text-muted">
          {filter === "ki" ? "Noch nichts als KI markiert. Alle Medien gelten als echt." : "Keine Medien in dieser Ansicht."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visible.map((item) => (
            <MediaCard item={item} key={item.key} onChoose={(t) => choose(item, t)} saving={savingKey === item.key} type={types[item.key]} />
          ))}
        </ul>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="status">
        {status ? (
          <p className={`pointer-events-auto max-w-lg rounded-full px-5 py-3 text-[14px] shadow-lg ${status.tone === "ok" ? "bg-accent text-black" : "bg-red-700 text-black"}`}>
            {status.tone === "ok" ? "✓ " : ""}
            {status.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MediaCard({ item, type, onChoose, saving }: { item: MediaItem; type: AiMediaType; onChoose: (t: AiMediaType) => void; saving: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ai = type !== "original";
  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl border bg-card transition ${ai ? "border-ink/40 shadow-[0_0_0_1px_rgba(20,20,20,0.15)]" : "border-line"}`}>
      <div
        className="relative aspect-[4/5] bg-cream"
        onMouseEnter={() => videoRef.current?.play().catch(() => {})}
        onMouseLeave={() => {
          const v = videoRef.current;
          if (v) {
            v.pause();
            v.currentTime = 0;
          }
        }}
      >
        <Image alt="" className="object-cover" fill sizes="(min-width: 1024px) 220px, 45vw" src={item.preview} />
        {item.kind === "video" && item.video ? (
          <video className="absolute inset-0 size-full object-cover opacity-0 transition-opacity hover:opacity-100" loop muted playsInline preload="none" ref={videoRef}>
            <source src={item.video} type="video/mp4" />
          </video>
        ) : null}
        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-card/90 px-2 py-0.5 font-medium text-[11px] text-ink/80">{item.kind === "video" ? "▶ Video" : "Foto"}</span>
        {ai ? (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-card/90 px-2 py-1 font-medium text-[10.5px] text-ink/85 shadow-sm">
            ✦ {AI_MEDIA_LABEL[type]}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-medium text-[14px] leading-snug">{item.title}</p>
        <p className="line-clamp-2 text-[12px] text-muted leading-snug" title={item.usage.join(" · ")}>
          {item.usage.join(" · ")}
        </p>
        {item.product ? (
          <Link className="w-fit text-[12px] text-ink/60 underline-offset-2 hover:text-ink hover:underline" href={`/admin/produkte/${item.product.handle}/inhalt`}>
            Zum Produkt
          </Link>
        ) : null}
      </div>
      <fieldset className="border-line border-t p-2">
        <legend className="sr-only">Herkunft von „{item.title}“</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink/[0.04] p-1">
          {CHOICES.map((c) => {
            const active = type === c.type;
            return (
              <button
                aria-pressed={active}
                className={`rounded-lg px-1 py-1.5 font-medium text-[12px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${active ? (c.type === "original" ? "bg-card text-ink shadow-sm" : "bg-accent text-black shadow-sm") : "text-ink/60 hover:bg-card/70 hover:text-ink"}`}
                disabled={saving}
                key={c.type}
                onClick={() => onChoose(c.type)}
                title={c.label}
                type="button"
              >
                <span className="hidden min-[1700px]:inline">{c.label}</span>
                <span className="min-[1700px]:hidden">{c.short}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </li>
  );
}
