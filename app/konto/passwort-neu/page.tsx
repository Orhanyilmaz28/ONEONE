import type { Metadata } from "next";
import Link from "next/link";
import { checkPasswordReset } from "@/lib/customers";
import { NewPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Neues Passwort" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewPasswordPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const id = one(sp.u);
  const token = one(sp.t);
  const valid = await checkPasswordReset(id, token).catch(() => null);
  return (
    <div className="mx-auto max-w-md">
      <p className="t-eyebrow">Mein Konto</p>
      <h1 className="t-h1 mt-3">Neues Passwort</h1>
      <div className="mt-8 rounded-[1.75rem] border border-line bg-card p-6 sm:p-8">
        {valid ? (
          <NewPasswordForm id={id} token={token} />
        ) : (
          <div className="space-y-4 text-ink/80 leading-relaxed">
            <p>Dieser Link ist abgelaufen oder wurde schon benutzt.</p>
            <Link className="inline-flex h-12 items-center rounded-full bg-accent px-6 font-medium text-black transition hover:bg-accent-dark" href="/konto/passwort-vergessen">
              Neuen Link anfordern
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
