"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowIcon } from "../icons";

export type HeroSlide = { handle: string; title: string; subtitle?: string; image: string; color: string };

const INTERVAL = 5200;

/** Startbild wie auf exstase.com: Video-Hintergrund, große Headline, Dose mit kreisenden Ringen – wechselt automatisch die Sorte */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % count), INTERVAL);
    return () => window.clearInterval(id);
  }, [paused, count, active]);

  if (!count) return null;
  const go = (i: number) => setActive((i + count) % count);
  const current = slides[active];

  return (
    <section className="px-3 pt-3 sm:px-4">
      <div
        className="relative isolate mx-auto flex min-h-[40rem] max-w-7xl flex-col overflow-hidden rounded-[2.5rem] border border-line bg-paper lg:min-h-[44rem]"
        onBlur={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{ "--c": current.color } as React.CSSProperties}
      >
        {/* Hintergrund: Video rechts, Verlauf, Sorten-Glow */}
        <div aria-hidden className="-z-10 pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 right-0 left-[30%] [mask-image:linear-gradient(90deg,transparent,#000_35%)]">
            <video autoPlay className="size-full object-cover opacity-50 brightness-[0.7] motion-reduce:hidden" loop muted playsInline poster="/videos/hero-bg.jpg">
              <source src="/videos/hero-bg.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,3,3,0.7),rgba(3,3,3,0.2)_55%,rgba(3,3,3,0.35))]" />
          <div className="absolute top-1/2 right-[8%] size-[46rem] max-w-[120vw] -translate-y-1/2 rounded-full opacity-40 transition-[background] duration-1000" style={{ background: "radial-gradient(circle, var(--c) 0%, transparent 62%)" }} />
        </div>

        <div className="grid flex-1 items-center gap-6 px-6 py-14 sm:px-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <p className="anim-rise t-eyebrow">New era of energy</p>
            <h1 className="anim-rise mt-4 font-black text-[clamp(3rem,8.2vw,7.2rem)] leading-[0.92] tracking-[-0.045em]" style={{ animationDelay: "0.1s" }}>
              find your
              <br />
              <span className="grad-text">favourite</span> kick.
            </h1>
            <p className="anim-rise mt-6 max-w-sm text-muted text-lg" style={{ animationDelay: "0.2s" }}>
              Pure Energy. Pure exstase. Frisch, kraftvoll, unverwechselbar.
            </p>
            <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.3s" }}>
              <Link className="anim-shine relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-accent px-7 font-bold text-black transition hover:bg-accent-dark" href="/#sorten">
                Sorten entdecken <ArrowIcon />
              </Link>
              <Link className="inline-flex h-12 items-center rounded-full border border-white/25 px-6 font-medium transition hover:border-accent hover:text-accent" href="/products">
                Zum Shop
              </Link>
            </div>
          </div>

          {/* Dose mit Ringen */}
          <div className="relative mx-auto flex h-[26rem] w-full max-w-md items-center justify-center sm:h-[32rem]">
            <div aria-hidden className="absolute top-1/2 left-1/2 aspect-square w-[88%] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-white/30 border-dashed [animation-duration:30s]" style={{ borderColor: "color-mix(in srgb, var(--c) 45%, transparent)" }}>
              <span className="absolute -top-1.5 left-1/2 size-3 rounded-full bg-[var(--c)] shadow-[0_0_20px_var(--c)]" />
            </div>
            <div aria-hidden className="absolute top-1/2 left-1/2 aspect-square w-[118%] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border [animation-direction:reverse] [animation-duration:50s]" style={{ borderColor: "color-mix(in srgb, var(--c) 14%, transparent)" }} />

            {slides.map((s, i) => {
              const isActive = i === active;
              return (
                <div
                  aria-hidden={!isActive}
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] ${isActive ? "translate-y-0 rotate-0 scale-100 opacity-100" : "pointer-events-none translate-y-12 rotate-[14deg] scale-90 opacity-0"}`}
                  key={s.handle}
                >
                  <Link className="relative block h-[88%] w-auto" href={`/products/${s.handle}`} tabIndex={isActive ? 0 : -1}>
                    <Image
                      alt={s.title}
                      className="anim-float h-full w-auto object-contain [filter:saturate(1.3)_contrast(1.08)_drop-shadow(0_40px_50px_rgba(0,0,0,0.75))]"
                      height={640}
                      preload={i === 0}
                      sizes="(min-width: 1024px) 220px, 160px"
                      src={s.image}
                      width={240}
                    />
                  </Link>
                </div>
              );
            })}

            {/* Unscharfe Nachbar-Dosen als Tiefe */}
            {count > 2 ? (
              <>
                <Image alt="" aria-hidden className="pointer-events-none absolute top-[6%] left-[2%] w-12 -rotate-[24deg] opacity-40 blur-[1.5px] sm:w-16" height={160} src={slides[(active + 1) % count].image} width={60} />
                <Image alt="" aria-hidden className="pointer-events-none absolute right-[2%] bottom-[8%] w-10 rotate-[18deg] opacity-40 blur-[2.5px] sm:w-14" height={160} src={slides[(active + 2) % count].image} width={60} />
              </>
            ) : null}
          </div>
        </div>

        {/* Sortenname und Steuerung */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-line border-t px-6 py-4 sm:px-12">
          <div aria-live="polite" className="min-w-0">
            <p className="font-black text-2xl uppercase tracking-tight">{current.title}</p>
            {current.subtitle ? <p className="font-bold text-[var(--c)] text-xs uppercase tracking-[0.18em]">{current.subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Vorherige Sorte" className="flex size-10 items-center justify-center rounded-full border border-line transition hover:border-accent hover:text-accent" onClick={() => go(active - 1)} type="button">
              <span className="rotate-180"><ArrowIcon /></span>
            </button>
            <div className="flex items-center gap-1.5 px-2">
              {slides.map((s, i) => (
                <button aria-current={i === active} aria-label={`Sorte ${s.title} anzeigen`} className={`h-1.5 rounded-full transition-all ${i === active ? "w-7 bg-[var(--c)]" : "w-1.5 bg-white/30 hover:bg-white/60"}`} key={s.handle} onClick={() => go(i)} type="button" />
              ))}
            </div>
            <button aria-label="Nächste Sorte" className="flex size-10 items-center justify-center rounded-full border border-line transition hover:border-accent hover:text-accent" onClick={() => go(active + 1)} type="button">
              <ArrowIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Laufband im Akzent-Grün wie auf exstase.com */
export function HeroMarquee() {
  const items = ["Push your limits", "Drink exstase", "Pure Energy", "Find your favourite kick"];
  const row = [...items, ...items, ...items, ...items];
  return (
    <div aria-hidden className="relative z-10 mt-6 -rotate-1 overflow-hidden bg-accent py-3 text-black shadow-[0_20px_60px_rgba(168,230,82,0.2)]">
      <div className="flex w-max animate-marquee items-center gap-8 whitespace-nowrap font-black text-2xl uppercase italic sm:text-3xl">
        {[0, 1].map((k) => (
          <div className="flex items-center gap-8" key={k}>
            {row.map((t, i) => (
              <span className="flex items-center gap-8" key={`${k}-${i}`}>
                {t}
                <svg className="size-5" viewBox="0 0 24 24"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" fill="currentColor" /></svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
