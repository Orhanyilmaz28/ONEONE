import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAction } from "../actions";

export const metadata: Metadata = { title: "Newsletter abmelden", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const token = one(sp.t);
  const status = one(sp.status);
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      {status === "ok" ? (
        <>
          <h1 className="t-h1">Du bist abgemeldet</h1>
          <p className="t-lead mt-4 text-ink/75">Du bekommst keinen Newsletter mehr von uns. Schade – aber alles gut.</p>
        </>
      ) : status === "ungueltig" || !token ? (
        <>
          <h1 className="t-h1">Link ungültig</h1>
          <p className="t-lead mt-4 text-ink/75">
            Diese Adresse ist nicht (mehr) angemeldet. Fragen?{" "}
            <Link className="underline underline-offset-4" href="/kontakt">
              Schreib uns
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <h1 className="t-h1">Newsletter abmelden?</h1>
          <p className="t-lead mt-4 text-ink/75">Mit einem Klick bist du abgemeldet und deine Adresse wird gelöscht.</p>
          <form action={unsubscribeAction} className="mt-8">
            <input name="t" type="hidden" value={token} />
            <button className="inline-flex h-12 items-center rounded-full border border-ink px-7 font-medium transition hover:bg-ink hover:text-white" type="submit">
              Jetzt abmelden
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
