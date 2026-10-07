import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "@/components/icons";
import { confirmAction } from "../actions";

export const metadata: Metadata = { title: "Newsletter bestätigen", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ConfirmPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const token = one(sp.t);
  const status = one(sp.status);
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      {status === "ok" ? (
        <>
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-sage/30 text-ink">
            <CheckIcon className="size-8" />
          </div>
          <h1 className="t-h1 mt-8">Du bist dabei!</h1>
          <p className="t-lead mt-4 text-ink/75">Danke für deine Bestätigung. Ab jetzt bekommst du unseren Newsletter – diskret und ohne Spam.</p>
          <p className="mt-6 text-[14px] text-muted">
            Abmelden kannst du dich jederzeit über den Link in jedem Newsletter
            {token ? (
              <>
                {" "}
                oder{" "}
                <Link className="underline underline-offset-2" href={`/newsletter/abmelden?t=${encodeURIComponent(token)}`}>
                  hier
                </Link>
              </>
            ) : null}
            .
          </p>
        </>
      ) : status === "ungueltig" || !token ? (
        <>
          <h1 className="t-h1">Link ungültig</h1>
          <p className="t-lead mt-4 text-ink/75">Dieser Bestätigungs-Link ist abgelaufen oder wurde schon verwendet. Melde dich einfach noch einmal an – unten auf jeder Seite.</p>
        </>
      ) : (
        <>
          <h1 className="t-h1">Newsletter bestätigen</h1>
          <p className="t-lead mt-4 text-ink/75">Ein Klick noch – dann bist du angemeldet.</p>
          <form action={confirmAction} className="mt-8">
            <input name="t" type="hidden" value={token} />
            <button className="inline-flex h-12 items-center rounded-full bg-accent px-7 font-medium text-black transition hover:bg-accent-dark" type="submit">
              Anmeldung bestätigen
            </button>
          </form>
        </>
      )}
      <Link className="mt-10 inline-block text-[15px] underline underline-offset-4" href="/">
        Zur Startseite
      </Link>
    </div>
  );
}
