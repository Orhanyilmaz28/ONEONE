import Link from "next/link";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { catalog } from "@/lib/catalog";

/** 404-Seite: freundlich, mit Suche und den wichtigsten Wegen zurück in den Shop */
export default function NotFound() {
  const links = [
    ...catalog.collections.map((c) => ({ href: `/collections/${c.handle}`, label: c.title, text: c.description })),
    { href: "/kontakt", label: "Hilfe & Kontakt", text: "Wir beantworten deine Fragen – persönlich." },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-28">
      <LogoMark className="anim-bob mx-auto mb-6 h-20 w-auto text-ink/80" />
      <p aria-hidden className="t-display grad-text">
        404
      </p>
      <h1 className="t-h1 mt-4">Seite nicht gefunden</h1>
      <p className="t-lead mx-auto mt-4 max-w-md">
        Diese Seite gibt es nicht (mehr). Vielleicht hat sich ein Tippfehler eingeschlichen – oder du findest hier, was du suchst:
      </p>

      {/* Suche funktioniert auch ohne JavaScript: führt zur gefilterten Produktliste */}
      <form action="/products" className="mx-auto mt-8 flex max-w-md items-center gap-2 rounded-full border border-line bg-card p-1.5 pl-5 focus-within:border-ink" method="get" role="search">
        <SearchIcon className="size-5 shrink-0 text-muted" />
        <label className="sr-only" htmlFor="nf-suche">
          Produkte durchsuchen
        </label>
        <input className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" id="nf-suche" name="q" placeholder="z. B. Classic oder Zero" type="search" />
        <button className="inline-flex h-10 shrink-0 items-center rounded-full bg-accent px-5 font-medium text-sm text-black transition hover:bg-accent-dark" type="submit">
          Suchen
        </button>
      </form>

      <ul className="mt-12 grid gap-3 text-left sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link className="group flex h-full items-center justify-between gap-4 rounded-3xl border border-line bg-card p-5 transition hover:border-ink" href={l.href}>
              <span>
                <span className="block font-medium">{l.label}</span>
                {l.text ? <span className="t-small mt-0.5 block text-muted">{l.text}</span> : null}
              </span>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-black transition-transform duration-500 group-hover:-rotate-45">
                <ArrowIcon />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link className="mt-10 inline-flex h-12 items-center rounded-full bg-accent px-7 font-medium text-black transition hover:bg-accent-dark" href="/">
        Zur Startseite
      </Link>
    </div>
  );
}
