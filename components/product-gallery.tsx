"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { AiMediaLabel } from "./ai-media";
import { ArrowIcon } from "./icons";
import { ProductImage } from "./product-image";

type Media = { kind: "video"; src: string; poster: string; title?: string; type?: Product["images"][number]["type"] } | { kind: "image"; index: number };

const PlayGlyph = ({ className = "size-3" }: { className?: string }) => (
  <svg aria-hidden className={className} viewBox="0 0 10 12">
    <path d="M0 0l10 6-10 6z" fill="currentColor" />
  </svg>
);

const PauseGlyph = ({ className = "size-3" }: { className?: string }) => (
  <svg aria-hidden className={className} viewBox="0 0 10 12">
    <path d="M1 0h3v12H1zM6 0h3v12H6z" fill="currentColor" />
  </svg>
);

const mediaKey = (m: Media) => (m.kind === "video" ? m.src : `bild-${m.index}`);

/** Galerie: Produktvideos zuerst, dann Fotos. Pfeile (auch Pfeiltasten), Zähler, Wischen, Zoom auf Fotos. */
export function ProductGallery({ product }: { product: Product }) {
  const videos = (product.videos ?? []).map((v) => ({ kind: "video" as const, ...v }));
  const images = product.images.map((_, i) => ({ kind: "image" as const, index: i }));
  // Pakete: Paketbild zuerst; Einzelteile: Video zuerst
  const media: Media[] =
    (product.packSize ?? 1) > 1
      ? [images[0], ...videos.slice(0, 1), ...images.slice(1), ...videos.slice(1)].filter(Boolean)
      : [...videos.slice(0, 1), ...images, ...videos.slice(1)];
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const touch = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Beim Wechsel blendet das alte Element noch aus – Referenz nur auf das neue Video setzen, nie zurück auf null
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    if (el) videoRef.current = el;
  }, []);
  const current = media[active] ?? media[0];
  const go = (d: number) => setActive((a) => (a + d + media.length) % media.length);
  const label = (m: Media) => (m.kind === "video" ? `Video${m.title ? ` „${m.title}“` : ""}` : `Bild ${m.index + 1}`);
  // KI-Kennzeichnung je Medium (ohne Angabe: Original → keine Kennzeichnung)
  const aiOf = (m: Media) => (m.kind === "video" ? { src: m.src, type: m.type } : { src: product.images[m.index]?.src, type: product.images[m.index]?.type });

  useEffect(() => setZoom(null), [active]);

  // Videos starten automatisch (stumm) – außer bei „Bewegung reduzieren“ in den Systemeinstellungen
  const isVideo = current?.kind === "video";
  useEffect(() => {
    const v = videoRef.current;
    setPlaying(Boolean(isVideo && v && !v.paused));
    if (!isVideo || !v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.muted = true;
    v.play()
      .then(() => setPlaying(!v.paused))
      .catch(() => {});
  }, [active, isVideo]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-label={`${product.title} – Bilder und Videos`}
        aria-roledescription="Galerie"
        className="flex w-full min-w-0 max-w-full flex-col-reverse gap-4 self-start lg:flex-row lg:items-start"
        onKeyDown={(e) => {
          // Pfeiltasten blättern, solange der Fokus in der Galerie liegt
          if (media.length < 2 || (e.target as HTMLElement).tagName === "VIDEO") return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(-1);
          }
        }}
        role="region"
      >
        {media.length > 1 ? (
          <div aria-label="Ansicht wählen" className="no-scrollbar -m-1 flex gap-3 overflow-x-auto p-1 lg:max-h-[648px] lg:flex-col lg:overflow-y-auto" role="group">
            {media.map((m, i) => (
              <button
                aria-label={`${label(m)} anzeigen`}
                aria-pressed={i === active}
                className={`relative size-20 shrink-0 overflow-hidden rounded-2xl bg-white ring-2 transition ${
                  i === active ? "ring-ink" : "ring-transparent opacity-70 hover:opacity-100 focus-visible:opacity-100"
                }`}
                key={mediaKey(m)}
                onClick={() => setActive(i)}
                type="button"
              >
                {m.kind === "video" ? (
                  <>
                    <Image alt="" className="object-cover" fill sizes="80px" src={m.poster} />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                      <span className="flex size-7 items-center justify-center rounded-full bg-white text-ink">
                        <PlayGlyph className="ml-0.5 size-2.5" />
                      </span>
                    </span>
                    <AiMediaLabel className="bottom-1! left-1!" compact {...aiOf(m)} />
                  </>
                ) : (
                  <ProductImage aiLabel="compact" index={m.index} product={product} sizes="80px" />
                )}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`group relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-[2rem] bg-white ${current?.kind === "image" ? "cursor-zoom-in" : ""}`}
          onMouseLeave={() => setZoom(null)}
          onMouseMove={(e) => {
            if (current?.kind !== "image") return;
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
            touch.current = null;
          }}
          onTouchStart={(e) => {
            touch.current = e.touches[0].clientX;
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0"
              exit={{ opacity: 0, scale: 1.02 }}
              initial={{ opacity: 0, scale: 1.04 }}
              key={active}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {current?.kind === "video" ? (
                <video
                  aria-label={`${product.title} – ${label(current)}`}
                  className="absolute inset-0 size-full object-cover"
                  loop
                  muted
                  onPause={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                  playsInline
                  poster={current.poster}
                  preload="metadata"
                  ref={setVideo}
                >
                  {/* WebM zuerst: gleiche Qualität, etwa halb so groß – Safari & ältere Geräte nehmen MP4 */}
                  <source src={current.src.replace(/\.mp4$/, ".webm")} type='video/webm; codecs="vp9"' />
                  <source src={current.src} type="video/mp4" />
                </video>
              ) : current ? (
                <div
                  className="absolute inset-0"
                  style={{
                    transform: zoom ? "scale(1.7)" : "scale(1)",
                    transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : "center",
                    transition: "transform 0.35s ease-out",
                  }}
                >
                  <ProductImage index={current.index} preload product={product} sizes="(min-width: 1024px) 50vw, 100vw" />
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* KI-Kennzeichnung unten links – bei mehreren Medien über der Pfeil-Leiste, damit Pfeile und Punkte frei bleiben */}
          {current ? <AiMediaLabel className={media.length > 1 ? "bottom-[4.25rem]! left-4!" : "bottom-4! left-4!"} key={`ki-${active}`} {...aiOf(current)} /> : null}

          {current?.kind === "video" ? (
            <button
              aria-label={`${current.title ?? "Video"} ${playing ? "pausieren" : "abspielen"}`}
              className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/55 py-1.5 pr-3.5 pl-1.5 text-white text-xs backdrop-blur-sm transition hover:bg-black/70"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) v.play().catch(() => {});
                else v.pause();
              }}
              type="button"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-white text-ink">
                {playing ? <PauseGlyph className="size-2.5" /> : <PlayGlyph className="ml-0.5 size-2.5" />}
              </span>
              {current.title ?? "Video"}
            </button>
          ) : null}

          {media.length > 1 ? (
            <>
              <span className="pointer-events-none absolute top-4 right-4 rounded-full bg-white/95 px-3 py-1 text-xs tabular-nums shadow-sm">
                <span aria-hidden>
                  {active + 1} / {media.length}
                </span>
                <span aria-live="polite" className="sr-only">
                  {`${label(current)} – ${active + 1} von ${media.length}`}
                </span>
              </span>
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                <button aria-label="Vorheriges Bild" className="flex size-11 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105" onClick={() => go(-1)} type="button">
                  <ArrowIcon className="size-4 rotate-180" />
                </button>
                <div aria-hidden className="flex gap-1.5">
                  {media.map((m, i) => (
                    <span className={`h-1.5 rounded-full bg-white shadow transition-all ${i === active ? "w-6" : "w-1.5 opacity-60"}`} key={mediaKey(m)} />
                  ))}
                </div>
                <button aria-label="Nächstes Bild" className="flex size-11 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:scale-105" onClick={() => go(1)} type="button">
                  <ArrowIcon className="size-4" />
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </MotionConfig>
  );
}
