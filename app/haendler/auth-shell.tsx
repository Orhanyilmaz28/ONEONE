import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Rahmen für Händler-Login und Aktivierung: eigene Bühne ohne Shop-Kopfzeile */
export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="-z-10 pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 size-[40rem] rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute -right-20 bottom-0 size-[32rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <div className="w-full max-w-md">
        <Link className="mx-auto block w-fit" href="/">
          <Logo className="h-20 w-auto" />
        </Link>
        <div className="mt-8 rounded-[2rem] border border-accent/30 bg-card/90 p-8 shadow-[0_30px_80px_-30px_rgba(168,230,82,0.25)] backdrop-blur sm:p-10">
          <p className="t-eyebrow text-center">{eyebrow}</p>
          <h1 className="t-h1 mt-3 mb-6 text-center">{title}</h1>
          {children}
        </div>
        <p className="mt-6 text-center text-muted text-xs">
          <Link className="underline" href="/">
            Zurück zum Shop
          </Link>
        </p>
      </div>
    </div>
  );
}
