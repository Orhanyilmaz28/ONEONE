import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Rahmen der Anmeldeseiten (gleiches Aussehen wie die bisherige Anmeldung) */
export function AuthCard({ title, text, children, back = { href: "/", label: "← Zurück zum Shop" } }: { title: string; text: ReactNode; children: ReactNode; back?: { href: string; label: string } | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-[2rem] border border-line bg-card p-8 shadow-[0_30px_80px_-40px_rgba(20,20,20,0.35)]">
        <Logo className="h-16 w-auto" />
        <h1 className="mt-8 font-medium text-[22px] tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-[15px] text-muted">{text}</p>
        {children}
        {back ? (
          <Link className="mt-8 inline-block text-muted text-sm hover:text-ink" href={back.href}>
            {back.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
