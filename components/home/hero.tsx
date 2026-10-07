import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { ArrowIcon } from "../icons";
import { DropIcon } from "../logo";

/** Startbild: Headline links, drei gekippte Dosen-Karten rechts */
export function Hero({ products }: { products: Product[] }) {
  const cards = products.filter((p) => p.images[0]).slice(0, 3);
  const tilt = ["-rotate-6 left-0 top-10", "rotate-2 left-[28%] top-0 z-10", "rotate-6 right-0 top-12"];
  return (
    <section className="px-3 pt-3 sm:px-4">
      <div className="relative isolate mx-auto grid max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#0b0b12] text-white lg:grid-cols-[1.05fr_1fr]">
        <div aria-hidden className="-z-10 pointer-events-none absolute inset-0">
          <div className="anim-blob absolute -top-40 -left-24 size-[30rem] rounded-full bg-lilac/25 blur-3xl" />
          <div className="anim-blob absolute -right-20 -bottom-40 size-[28rem] rounded-full bg-sky/25 blur-3xl [animation-delay:-8s]" />
        </div>

        <div className="flex flex-col justify-center px-6 py-14 sm:px-12 lg:py-24">
          <p className="anim-rise t-eyebrow text-white/60">Energy Drink</p>
          <h1 className="anim-rise t-display mt-4" style={{ animationDelay: "0.1s" }}>
            Pure <span className="grad-text">Ekstase</span>
            <br />
            in jeder Dose.
          </h1>
          <p className="anim-rise t-lead mt-6 max-w-md text-white/70" style={{ animationDelay: "0.2s" }}>
            Frisch, kräftig, eiskalt: EXSTASE Energy in der 250-ml-Dose – mit und ohne Zucker. Direkt zu dir nach Hause.
          </p>
          <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.3s" }}>
            <Link className="anim-shine relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-white px-7 font-medium text-ink transition hover:bg-lilac" href="/products">
              Jetzt shoppen <ArrowIcon />
            </Link>
            <Link className="inline-flex h-12 items-center rounded-full border border-white/25 px-6 font-medium transition hover:border-white" href="/#sorten">
              Sorten ansehen
            </Link>
          </div>
          <ul className="anim-rise mt-8 flex flex-wrap gap-2 text-sm text-white/80" style={{ animationDelay: "0.4s" }}>
            {["250-ml-Dose", "Mit & ohne Zucker", "Versand aus Deutschland"].map((c) => (
              <li className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5" key={c}>
                <DropIcon className="h-3 w-auto text-lilac" />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative min-h-[22rem] sm:min-h-[30rem]">
          {cards.map((p, i) => (
            <Link
              aria-label={p.title}
              className={`anim-tile absolute aspect-square w-[46%] overflow-hidden rounded-[2rem] border-4 border-white/90 bg-ink shadow-2xl transition-transform duration-500 hover:scale-[1.04] sm:w-[44%] ${tilt[i]}`}
              href={`/products/${p.handle}`}
              key={p.handle}
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
            >
              <Image alt={p.images[0].alt} className="object-cover" fill preload={i === 1} sizes="(min-width: 1024px) 22vw, 46vw" src={p.images[0].src} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
