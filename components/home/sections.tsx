import Link from "next/link";
import type { ReactNode } from "react";
import type { Product } from "@/lib/types";
import { ArrowIcon } from "../icons";
import { Newsletter } from "../newsletter";
import { FeatureIcon, type IconName } from "../feature-icons";
import { ProductCard } from "../product-card";
import { ReviewCard, ReviewDisclosure } from "../reviews";
import { formatAverage, Stars } from "../stars";
import { getCustomers, summarize } from "@/lib/reviews";
import { getBaseProducts } from "@/lib/catalog";
import { getPublicReviews } from "@/lib/review-store";

const Drop = ({ className = "size-4" }: { className?: string }) => (
  <svg aria-hidden className={className} viewBox="0 0 12 16">
    <path d="M6 .8C4.2 3.6 1.2 6.8 1.2 10a4.8 4.8 0 0 0 9.6 0C10.8 6.8 7.8 3.6 6 .8Z" fill="currentColor" />
  </svg>
);

export function SectionTitle({
  eyebrow,
  title,
  intro,
  center,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: string;
  center?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`sd-up mb-10 flex flex-col gap-6 ${center ? "items-center text-center" : "md:flex-row md:items-end md:justify-between"}`}>
      <div className={center ? "max-w-2xl" : "max-w-2xl"}>
        <p className="t-eyebrow">{eyebrow}</p>
        <h2 className="t-h2 mt-3">{title}</h2>
        {intro ? <p className="t-lead mt-4">{intro}</p> : null}
      </div>
      {action}
    </div>
  );
}

const Section = ({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) => (
  <section className={`mx-auto max-w-7xl scroll-mt-24 px-4 py-14 sm:px-6 lg:py-20 ${className}`} id={id}>
    {children}
  </section>
);

/* ───────── Bestseller ───────── */
export function Bestsellers({ products }: { products: Product[] }) {
  return (
    <Section id="sorten">
      <SectionTitle
        action={
          <Link className="group inline-flex items-center gap-2 font-medium" href="/products">
            Alle Produkte
            <span className="transition-transform group-hover:translate-x-1">
              <ArrowIcon />
            </span>
          </Link>
        }
        eyebrow="Unsere Sorten"
        intro="Von klassisch bis tropisch – such dir deine Lieblingssorte aus oder probier dich durch."
        title="Deine Sorte, dein Kick"
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </Section>
  );
}

/* ───────── Mixpakete (hinter den einzelnen Produkten) ───────── */
export function MixPakete({ products }: { products: Product[] }) {
  if (!products.length) return null;
  return (
    <Section id="mixpakete">
      <SectionTitle
        action={
          <Link className="group inline-flex items-center gap-2 font-medium" href="/collections/mixpakete">
            Alle Mixpakete
            <span className="transition-transform group-hover:translate-x-1">
              <ArrowIcon />
            </span>
          </Link>
        }
        eyebrow="Mixpakete"
        intro="Mehrere Sorten, mehrere Trays – je größer das Paket, desto mehr sparst du."
        title="Alles probieren, Geld sparen"
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </Section>
  );
}

/* ───────── Versprechen ───────── */
export function Promises() {
  const items = [
    { icon: "versand" as IconName, title: "Versand aus Deutschland", text: "Direkt aus Straelen (NRW), in 1–3 Werktagen bei dir – sicher verpackt." },
    { icon: "nachhaltig" as IconName, title: "Fair beim Pfand", text: "0,25 € Einwegpfand je Dose/Flasche – separat ausgewiesen, damit du immer weißt, was du zahlst." },
    { icon: "antibakteriell" as IconName, title: "Sicher bezahlen", text: "PayPal, Klarna, Kreditkarte, Apple Pay & Google Pay – SSL-verschlüsselt über Stripe." },
  ];
  return (
    <Section className="py-16! lg:py-16!">
      <div className="grid gap-4 md:grid-cols-3">
        {items.map(({ icon, title, text }) => (
          <div className="sd-up group flex gap-4 rounded-[1.75rem] bg-cream p-7" key={title}>
            <span className="icon-hover flex size-12 shrink-0 items-center justify-center rounded-full bg-card">
              <FeatureIcon className="size-6" name={icon} />
            </span>
            <div>
              <p className="t-h3">{title}</p>
              <p className="t-small mt-1 text-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ───────── FAQ ───────── */
const FAQ = [
  ["Welche Sorten gibt es?", "Energy: Classic, Tropical, Kiwi & Lemon, Watermelon, White Peach, Ice Bonbon, Lime, Blueberry Coconut und Zero (ohne Zucker). Dazu X-Tea Ice Tea (Watermelon, Peach, Lemon), Ice Coffee (Latte, Cappuccino) und Aqua x Mineralwasser (Still, Medium, Classic). In den Mixpaketen bekommst du mehrere Sorten zusammen – jeweils als ganze Trays."],
  ["Gibt es einzelne Dosen?", "Nein, wir verkaufen nur komplette Trays (24 Dosen, beim Wasser 12 Flaschen). Wer mehrere Sorten möchte, nimmt ein Mixpaket aus mehreren Trays."],
  ["Wie viel Koffein ist enthalten?", "Die genauen Angaben stehen auf der Dose und auf der jeweiligen Produktseite. EXSTASE hat einen erhöhten Koffeingehalt – für Kinder, schwangere und stillende Frauen nicht empfohlen."],
  ["Was bedeutet „Zero“?", "Zero ist die Variante ohne Zucker. Der volle EXSTASE-Geschmack, aber ohne Zucker."],
  ["Gibt es Pfand?", "Ja. Auf jede Dose und Flasche kommen 0,25 € Einwegpfand. Es wird an der Kasse separat berechnet."],
  ["Wie lange dauert der Versand?", "In Deutschland in der Regel 1–3 Werktage. Ab dem im Warenkorb angezeigten Warenwert ist der Versand kostenlos."],
  ["Kann ich Dosen zurückgeben?", "Ungeöffnete Ware kannst du innerhalb der gesetzlichen Widerrufsfrist zurücksenden. Details stehen in der Widerrufsbelehrung."],
];

export function Faq() {
  return (
    <Section className="grid gap-12 lg:grid-cols-[1fr_1.4fr]" id="faq">
      <div className="sd-up">
        <p className="t-eyebrow">Häufige Fragen</p>
        <h2 className="t-h2 mt-3">Gut zu wissen</h2>
        <p className="t-lead mt-4 max-w-sm">Noch etwas offen? Schreib uns – wir antworten persönlich und vertraulich.</p>
        <Link className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-ink/15 px-5 font-medium transition hover:border-ink" href="/kontakt">
          Kontakt aufnehmen <ArrowIcon />
        </Link>
      </div>
      <div className="divide-y divide-line border-line border-y">
        {FAQ.map(([q, a]) => (
          <details className="group" key={q}>
            <summary className="flex items-center justify-between gap-6 py-5 font-medium text-[17px]">
              {q}
              <span aria-hidden className="faq-icon flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-lg transition-transform duration-300 group-hover:border-ink">+</span>
            </summary>
            <p className="faq-body max-w-2xl pb-6 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ───────── Abschluss mit Newsletter ───────── */
export function NewsletterCta() {
  return (
    <section className="px-3 sm:px-4">
      <div className="sd-up relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-line bg-card px-6 py-14 text-center sm:py-16">
        <div aria-hidden className="-z-10 pointer-events-none absolute inset-0">
          <div className="anim-blob absolute -top-32 left-1/4 size-[28rem] rounded-full bg-lilac/60 blur-3xl" />
          <div className="anim-blob absolute -bottom-40 right-1/4 size-[26rem] rounded-full bg-peach/60 blur-3xl [animation-delay:-6s]" />
          <div className="anim-blob absolute top-1/4 -right-20 size-80 rounded-full bg-sky/60 blur-3xl [animation-delay:-10s]" />
        </div>
        <Drop className="anim-float mx-auto size-8 text-ink" />
        <h2 className="t-h1 mx-auto mt-6 max-w-2xl">
          10 % auf deine erste Bestellung
        </h2>
        <p className="t-lead mx-auto mt-4 max-w-md">Neue Sorten, Aktionen und exklusive Angebote – ein- bis zweimal im Monat.</p>
        <div className="mx-auto mt-8 flex justify-center">
          <Newsletter />
        </div>
      </div>
    </section>
  );
}

/* ───────── Kundenbewertungen (echte Bewertungen: data/reviews.json + im Dashboard freigegebene) ───────── */
export async function HomeReviews() {
  const [reviews, products] = await Promise.all([getPublicReviews(), getBaseProducts()]);
  if (!reviews.length) return null;
  const productByHandle = new Map(products.map((p) => [p.handle, p]));
  const { count, average } = summarize(reviews);
  const customers = getCustomers();
  return (
    <Section id="bewertungen">
      <SectionTitle
        action={
          <div className="flex items-center gap-4 rounded-[1.5rem] border border-line bg-card px-5 py-4">
            <span className="t-h1 leading-none">{formatAverage(average)}</span>
            <span>
              <Stars className="size-5" value={average} />
              <span className="mt-1 block text-muted text-sm">
                {count} {count === 1 ? "Bewertung" : "Bewertungen"}
                {customers ? ` · über ${customers.toLocaleString("de-DE")} Kund:innen` : ""}
              </span>
            </span>
          </div>
        }
        eyebrow="Kundenstimmen"
        intro="Echte Erfahrungen von Menschen, die EXSTASE schon getrunken haben."
        title={<>Das sagen <span className="grad-text">unsere Kund:innen</span></>}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reviews.slice(0, 6).map((r) => (
          <div className="sd-up" key={r.id}>
            <ReviewCard product={productByHandle.get(r.product)} review={r} />
          </div>
        ))}
        <div className="sd-up flex flex-col justify-between gap-6 rounded-[1.75rem] bg-accent p-6 text-black">
          <div>
            <p className="t-h3">Du kennst EXSTASE schon?</p>
            <p className="mt-2 text-white/60">Teile deine Erfahrung und hilf anderen bei der Entscheidung – auf der Produktseite unter „Bewertung schreiben“.</p>
          </div>
          <Link className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-card px-5 font-medium text-ink" href="/products">
            Zu den Produkten <ArrowIcon />
          </Link>
        </div>
      </div>
      <div className="mt-6 max-w-3xl">
        <ReviewDisclosure />
      </div>
    </Section>
  );
}
