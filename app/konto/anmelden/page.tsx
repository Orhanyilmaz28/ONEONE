import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer, safeNext } from "@/lib/customer-auth";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Anmelden" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.weiter) ? sp.weiter[0] : sp.weiter);
  if (await getCurrentCustomer()) redirect(next);
  return (
    <div className="mx-auto max-w-md">
      <p className="t-eyebrow">Mein Konto</p>
      <h1 className="t-h1 mt-3">Anmelden</h1>
      {sp.abgemeldet ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900" role="status">
          Du bist abgemeldet. Bis bald!
        </p>
      ) : null}
      {sp.geloescht ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900" role="status">
          Dein Konto wurde gelöscht.
        </p>
      ) : null}
      <div className="mt-8 rounded-[1.75rem] border border-line bg-card p-6 sm:p-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-[15px] text-ink/80">
        Noch kein Konto?{" "}
        <Link className="font-medium underline underline-offset-4" href="/konto/registrieren">
          Jetzt registrieren
        </Link>
      </p>
      <p className="mt-3 text-center text-[13px] text-muted">Bestellen geht übrigens auch ohne Konto.</p>
    </div>
  );
}
