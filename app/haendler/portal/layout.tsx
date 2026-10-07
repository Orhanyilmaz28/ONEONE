import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalNav } from "./portal-nav";
import { dealerLogoutAction } from "../actions";
import { Logo } from "@/components/logo";
import { TierBadge } from "@/components/tier-badge";
import { requireDealer } from "@/lib/dealer-auth";
import { getTiers } from "@/lib/dealer-data";

export const metadata: Metadata = { title: { default: "Händlerbereich", template: "%s · Händlerbereich" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Eigene Bühne für freigegebene Händler: Seitenleiste statt Shop-Kopfzeile */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const dealer = await requireDealer();
  const tiers = await getTiers();
  const tierName = (tiers.find((t) => t.id === dealer.tierId) ?? tiers[0]).name;
  return (
    <div className="relative isolate min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <div aria-hidden className="-z-10 pointer-events-none absolute inset-x-0 top-0 h-[40rem] bg-[radial-gradient(ellipse_at_top_left,rgba(168,230,82,0.14),transparent_60%)]" />
      <aside className="border-line border-b p-4 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:p-6">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link href="/haendler/portal">
            <Logo className="h-14 w-auto lg:h-20" />
          </Link>
          <p className="rounded-full border border-accent/50 px-3 py-1 font-black text-[10px] text-accent uppercase tracking-[0.25em] lg:mt-4 lg:w-fit">Händlerbereich</p>
        </div>
        <div className="mt-4 lg:mt-6">
          <TierBadge name={tierName} />
        </div>
        <PortalNav />
        <div className="mt-4 hidden border-line border-t pt-4 text-sm lg:absolute lg:right-6 lg:bottom-6 lg:left-6 lg:block">
          <p className="truncate font-bold">{dealer.company}</p>
          <p className="truncate text-muted text-xs">{dealer.email}</p>
          <form action={dealerLogoutAction} className="mt-3">
            <button className="text-muted text-sm underline transition hover:text-accent" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        {children}
        <form action={dealerLogoutAction} className="mt-12 lg:hidden">
          <button className="text-muted text-sm underline" type="submit">
            Abmelden ({dealer.company})
          </button>
        </form>
      </div>
    </div>
  );
}
