import Link from "next/link";
import { logout } from "./actions";

const ITEMS = [
  { href: "/konto", label: "Übersicht" },
  { href: "/konto/bestellungen", label: "Bestellungen" },
  { href: "/konto/daten", label: "Meine Daten" },
] as const;

/** Kopf des Kundenbereichs: Begrüßung + Reiter + Abmelden */
export function AccountHeader({ active, name, title }: { active: (typeof ITEMS)[number]["href"]; name: string; title: string }) {
  return (
    <header className="mb-8">
      <p className="t-eyebrow">Hallo {name.split(" ")[0]}</p>
      <h1 className="t-h1 mt-3">{title}</h1>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Mein Konto" className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-full border border-line bg-white p-1">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  aria-current={item.href === active ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition ${item.href === active ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form action={logout}>
          <button className="rounded-full px-4 py-2 text-[15px] text-ink/70 underline-offset-4 transition hover:text-ink hover:underline" type="submit">
            Abmelden
          </button>
        </form>
      </div>
    </header>
  );
}
