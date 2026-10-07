import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoStacked } from "@/components/logo";
import { getSiteLock, safeTarget } from "@/lib/site-lock";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Bald geöffnet", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccessPage({ searchParams }: Props) {
  const sp = await searchParams;
  const target = safeTarget(Array.isArray(sp.weiter) ? sp.weiter[0] : sp.weiter);
  const lock = await getSiteLock();
  // Schutz ist aus → direkt in den Shop
  if (!lock.enabled) redirect(target);
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="anim-blob absolute -top-32 -left-24 size-96 rounded-full bg-lilac/40 blur-3xl" />
        <div className="anim-blob absolute -right-24 -bottom-32 size-96 rounded-full bg-peach/40 blur-3xl [animation-delay:-6s]" />
      </div>
      <div className="w-full max-w-sm text-center">
        <LogoStacked className="mx-auto h-24 w-auto" title="EXSTASE" />
        <h1 className="t-h2 mt-10">Bald geöffnet</h1>
        <p className="mt-3 text-ink/70 leading-relaxed">{lock.message?.trim() || "Unser Shop ist gerade noch in Vorbereitung. Mit dem Passwort kannst du schon einen Blick hineinwerfen."}</p>
        <UnlockForm target={target} />
      </div>
    </div>
  );
}
