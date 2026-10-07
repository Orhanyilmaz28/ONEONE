import Link from "next/link";
import { AI_MEDIA_FILES, SITE_MEDIA, aiMediaType, isAi } from "@/lib/ai-media";
import { getAiOverrides } from "@/lib/ai-media-store";
import { getProducts } from "@/lib/catalog";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import type { Collection } from "@/lib/types";
import { DropIcon, Logo, LogoMark } from "./logo";
import { Newsletter } from "./newsletter";
import { FlagDE } from "./trust";

export async function Footer({ brand, collections }: { brand: string; logo?: string; collections: Collection[] }) {
  // Firmendaten aus dem Dashboard (Einstellungen)
  const [{ company }, products, aiMedia] = await Promise.all([getSettings(), getProducts(), getAiOverrides()]);
  // Allgemeiner KI-Hinweis nur, wenn im Shop wirklich KI-Medien gekennzeichnet sind
  const hasAiMedia =
    SITE_MEDIA.some((m) => isAi(aiMediaType(m.src, undefined, aiMedia))) ||
    Object.keys(AI_MEDIA_FILES).some((k) => isAi(aiMediaType(k, undefined, aiMedia))) ||
    products.some((p) => [...p.images, ...(p.videos ?? [])].some((m) => isAi(aiMediaType(m.src, m.type, aiMedia))));
  // „47638 Straelen“ → „Straelen“; „(NRW)“ nur beim hinterlegten Standard-Ort, damit nichts Falsches dasteht
  const town = company.city.replace(/^\s*\d{4,5}\s+/, "").trim();
  const region = company.city === DEFAULT_SETTINGS.company.city ? " (NRW)" : "";
  return (
    <footer className="relative mt-16 overflow-hidden border-line border-t bg-paper">
      {/* Großer Marken-Tropfen als Wasserzeichen */}
      <LogoMark className="pointer-events-none absolute -right-16 -bottom-20 h-[24rem] w-auto text-ink/[0.035] sm:-right-8" />
      <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-24 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo className="h-10 w-auto" title={brand} />
            <p className="t-small mt-5 max-w-sm text-muted">
              EXSTASE Energy – Energy Drinks für jeden Moment. Pure Ekstase in jeder Dose.
            </p>
            <p className="t-small mt-5 flex items-center gap-2 font-medium">
              <FlagDE /> Händler aus Deutschland{town ? ` · Versand aus ${town}${region}` : ""}
            </p>
            <p className="t-small mt-8 mb-3 font-medium">Newsletter · 10 % auf deine erste Bestellung</p>
            <Newsletter />
          </div>
          <FooterCol
            links={[
              { href: "/products", label: "Alle Produkte" },
              ...collections.map((c) => ({ href: `/collections/${c.handle}`, label: c.title })),
            ]}
            title="Shop"
          />
          <FooterCol
            links={[
              { href: "/#faq", label: "Häufige Fragen" },
              { href: "/versand", label: "Versand & Lieferung" },
              { href: "/widerruf", label: "Rückgabe & Widerruf" },
              { href: "/kontakt", label: "Kontakt" },
            ]}
            title="Hilfe"
          />
          <FooterCol
            links={[
              { href: "/impressum", label: "Impressum" },
              { href: "/datenschutz", label: "Datenschutz" },
              { href: "/agb", label: "AGB" },
            ]}
            title="Rechtliches"
          />
        </div>

        <div className="t-small mt-16 flex flex-col justify-between gap-3 border-line border-t pt-8 text-muted sm:flex-row">
          <p className="flex items-start gap-2">
            <DropIcon className="mt-[5px] h-3 w-auto" />
            <span>
              © {new Date().getFullYear()} {company.brand || brand} – eine Marke der {company.name}
            </span>
          </p>
          <p>Alle Preise inkl. MwSt., zzgl. Pfand · PayPal, Klarna, Karte, Apple Pay</p>
        </div>
        {hasAiMedia ? (
          <p className="t-small mt-3 text-muted" id="ki-hinweis">
            Einzelne Bild- und Videodarstellungen auf dieser Website wurden mithilfe künstlicher Intelligenz erstellt oder bearbeitet. Sie sind am Medium
            gekennzeichnet.
          </p>
        ) : null}
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="t-eyebrow mb-4">{title}</p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link className="text-[15px] transition hover:text-muted" href={l.href}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
