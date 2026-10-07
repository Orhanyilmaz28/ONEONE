import { formatPrice } from "@/lib/format";
import type { PublicSettings } from "@/lib/settings-defaults";
import { useShopData } from "@/lib/shop-data";
import { FeatureIcon, type IconName } from "./feature-icons";
import { DropIcon } from "./logo";

/* ───────────────────────── Versandregeln (aus den Einstellungen) ───────────────────────── */

type Shipping = PublicSettings["shipping"];

const wholeEuro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Kurz für Hinweise: 4900 → „49 €“, 4950 → „49,50 €“ */
export function formatPriceShort(cents: number) {
  return cents % 100 === 0 ? wholeEuro.format(cents / 100) : formatPrice(cents);
}

/**
 * Versandregeln aus den Einstellungen (alle Beträge in Cent) – überall gleich ausgewertet:
 * - Standardversand 0 € → Versand immer kostenlos
 * - „Kostenlos ab“ 0 → kein kostenloser Versand ab einem Bestellwert
 * - Express 0 → kein Express-Versand
 */
export function shippingRules(s: Shipping) {
  const alwaysFree = !(s.cost > 0);
  return {
    /** Standardversand in Cent (0 = kostenlos) */
    cost: alwaysFree ? 0 : s.cost,
    alwaysFree,
    /** Ab diesem Bestellwert kostenlos (null = keine Grenze) */
    freeFrom: !alwaysFree && s.freeFrom > 0 ? s.freeFrom : null,
    /** Express-Versand in Cent (null = wird nicht angeboten) */
    express: s.express > 0 ? s.express : null,
  };
}

/** „Kostenloser Versand ab 49 €“ bzw. „Kostenloser Versand“ – oder null, wenn es keinen gibt */
export function freeShippingLabel(s: Shipping): string | null {
  const r = shippingRules(s);
  if (r.alwaysFree) return "Kostenloser Versand";
  return r.freeFrom ? `Kostenloser Versand ab ${formatPriceShort(r.freeFrom)}` : null;
}

/* ───────────────────────── Vertrauens-Elemente ───────────────────────── */

/** Kleine Deutschland-Flagge (CSS, kein Emoji – sieht überall gleich aus) */
export function FlagDE({ className = "h-3 w-[18px]" }: { className?: string }) {
  return (
    <span aria-label="Deutschland" className={`inline-flex shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/20 ${className}`} role="img">
      <span className="flex-1 bg-black" />
      <span className="flex-1 bg-[#dd0000]" />
      <span className="flex-1 bg-[#ffce00]" />
    </span>
  );
}

export type TrustItem = { icon: IconName | "de"; title: string; text?: string };

export const TRUST: TrustItem[] = [
  { icon: "de", title: "Händler aus Deutschland", text: "Aus Deutschland · NRW" },
  { icon: "versand", title: "Versand aus Deutschland", text: "In 1–3 Werktagen bei dir" },
  { icon: "nachhaltig", title: "Fairer Pfandpreis", text: "0,25 € je Dose/Flasche, separat ausgewiesen" },
  { icon: "antibakteriell", title: "Sicher bezahlen", text: "PayPal, Klarna, Karte – SSL-verschlüsselt" },
];

export function TrustIcon({ icon, className = "size-5" }: { icon: TrustItem["icon"]; className?: string }) {
  return icon === "de" ? <FlagDE className="h-3.5 w-[21px]" /> : <FeatureIcon className={className} draw={false} name={icon} />;
}

/** Aktions-Hinweis: kleines Farb-Etikett + Text (auch für die Vorschau im Dashboard) */
export function AnnouncementText({ text }: { text: string }) {
  return (
    <>
      <span className="mr-2.5 inline-block rounded-full bg-gradient-to-r from-lilac via-peach to-sky px-2 py-px align-[1px] font-semibold text-[10.5px] text-black uppercase leading-[1.5] tracking-[0.12em]">
        Aktion
      </span>
      <span className="font-medium text-white">{text}</span>
    </>
  );
}

type BarItem = { icon: TrustItem["icon"]; label: string };

function BarEntry({ item, divider }: { item: BarItem; divider?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {divider ? <DropIcon className="mr-4 h-2.5 w-auto text-white/35 xl:mr-6" /> : null}
      <TrustIcon className="size-4 text-white/80" icon={item.icon} />
      {item.label}
    </span>
  );
}

/**
 * Schwarze Leiste ganz oben.
 * Liest Versandkosten und Aktions-Hinweis aus den Shop-Daten – wird daher nur in Client-Komponenten
 * (Header) verwendet.
 */
export function TopBar() {
  const { settings } = useShopData();
  const freeLabel = freeShippingLabel(settings.shipping);
  const announcement = settings.announcement?.trim();

  const items: BarItem[] = [
    { icon: "de", label: "Händler aus Deutschland" },
    { icon: "versand", label: "Versand aus Deutschland" },
    { icon: "nachhaltig", label: "0,25 € Pfand je Dose/Flasche" },
    { icon: "saugstark", label: freeLabel ?? "Versand in 1–3 Werktagen" },
    { icon: "antibakteriell", label: "Sicher bezahlen" },
  ];

  // Mit Aktions-Hinweis: Hinweis groß in der Mitte, links/rechts je ein Vertrauens-Punkt (nur breit)
  if (announcement) {
    return (
      <div className="bg-black text-[13px] text-white/85">
        <div className="mx-auto hidden h-9 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 xl:grid">
          <BarEntry item={items[0]} />
          <p className="min-w-0 truncate text-center" title={announcement}>
            <AnnouncementText text={announcement} />
          </p>
          <span className="justify-self-end">
            <BarEntry item={freeLabel ? items[3] : items[4]} />
          </span>
        </div>
        <p className="mx-auto flex min-h-9 max-w-2xl items-center justify-center px-4 py-2 text-center leading-snug xl:hidden">
          <span>
            <AnnouncementText text={announcement} />
          </span>
        </p>
      </div>
    );
  }

  const row = (
    <>
      {items.map((it, i) => (
        <BarEntry divider={i > 0} item={it} key={it.label} />
      ))}
    </>
  );
  return (
    <div className="overflow-hidden bg-black text-[13px] text-white/85">
      {/* Desktop: ruhig nebeneinander */}
      <div className="mx-auto hidden h-9 max-w-7xl items-center justify-between gap-6 px-6 xl:flex">{row}</div>
      {/* Mobil & Tablet: Laufband */}
      <div className="flex h-9 w-max animate-marquee items-center gap-10 whitespace-nowrap xl:hidden">
        {row}
        {row}
        {row}
      </div>
    </div>
  );
}

/** Vertrauensleiste unter dem Slider */
export function TrustStrip() {
  return (
    <section aria-label="Darauf kannst du dich verlassen" className="mx-auto max-w-7xl px-3 pt-3 sm:px-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TRUST.map((t) => (
          <div className="group flex items-center gap-3 rounded-[1.5rem] border border-line bg-card p-4 sm:p-5" key={t.title}>
            <span className="icon-hover flex size-11 shrink-0 items-center justify-center rounded-full bg-cream">
              <TrustIcon className="size-6" icon={t.icon} />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-[15px] leading-tight">{t.title}</span>
              {t.text ? <span className="t-small mt-0.5 hidden text-muted sm:block">{t.text}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
