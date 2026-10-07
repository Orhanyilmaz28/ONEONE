import Link from "next/link";
import { Notice } from "@/components/admin/ui";
import { Logo } from "@/components/logo";
import { requireAdmin } from "@/lib/admin-auth";
import { getSiteLock } from "@/lib/site-lock";
import { storeKind } from "@/lib/store";
import { logout } from "../actions";
import { AdminNav } from "./nav";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const store = storeKind();
  const lock = await getSiteLock();
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-5 lg:flex-row lg:gap-8 lg:px-6 lg:py-8">
      <aside className="lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:w-60 lg:shrink-0">
        <div className="flex h-full flex-col gap-5 rounded-[1.75rem] border border-line bg-card p-4 lg:p-5">
          <div className="flex items-center justify-between lg:block">
            <Link aria-label="EXSTASE Dashboard" href="/admin">
              <Logo className="h-11 w-auto" />
            </Link>
            <p className="hidden text-[12px] text-muted uppercase tracking-[0.12em] lg:mt-2 lg:block">Dashboard</p>
          </div>
          <AdminNav />
          <div className="mt-auto hidden flex-col gap-1 border-line border-t pt-4 text-sm lg:flex">
            <Link className="rounded-xl px-3 py-2 text-ink/70 hover:bg-ink/5 hover:text-ink" href="/" target="_blank">
              Shop ansehen ↗
            </Link>
            <form action={logout}>
              <button className="w-full rounded-xl px-3 py-2 text-left text-ink/70 hover:bg-ink/5 hover:text-ink" type="submit">
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {store === "none" ? (
          <div className="mb-6">
            <Notice title="Datenspeicher fehlt – Änderungen können nicht gespeichert werden">
              Verbinde in Vercel unter <b>Storage → Upstash (Redis)</b> eine kostenlose Datenbank mit diesem Projekt und stelle die Seite neu bereit.
              Die Anleitung „Online stellen“ erklärt jeden Klick.
            </Notice>
          </div>
        ) : null}
        {lock.enabled ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
            <span>
              🔒 <b className="font-medium">Der Shop ist passwortgeschützt.</b> Besucher:innen brauchen das Passwort – du siehst ihn trotzdem.
            </span>
            <Link className="font-medium underline underline-offset-4" href="/admin/einstellungen#seitenschutz">
              Ändern
            </Link>
          </div>
        ) : null}
        {children}
        <div className="mt-10 flex gap-4 text-sm lg:hidden">
          <Link className="text-ink/70" href="/" target="_blank">
            Shop ansehen ↗
          </Link>
          <form action={logout}>
            <button className="text-ink/70" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
