import type { Metadata } from "next";
import Link from "next/link";
import { mailReady } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default async function ForgotPage() {
  const ready = mailReady();
  const { company } = await getSettings();
  const email = /^\[.*\]$/.test(company.email.trim()) ? "" : company.email.trim();
  return (
    <div className="mx-auto max-w-md">
      <p className="t-eyebrow">Mein Konto</p>
      <h1 className="t-h1 mt-3">Passwort vergessen?</h1>
      <div className="mt-8 space-y-4 rounded-[1.75rem] border border-line bg-white p-6 text-ink/80 leading-relaxed sm:p-8">
        {ready ? (
          <>
            <p>Kein Problem. Gib deine E-Mail-Adresse ein – wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
            <ForgotForm />
          </>
        ) : (
          <>
            <p>Kein Problem. Schreib uns eine kurze E-Mail von der Adresse, mit der du registriert bist – wir helfen dir persönlich weiter.</p>
            {email ? (
              <a
                className="inline-flex h-12 items-center rounded-full bg-ink px-6 font-medium text-white transition hover:bg-black"
                href={`mailto:${email}?subject=${encodeURIComponent("Passwort vergessen")}`}
              >
                E-Mail an {email}
              </a>
            ) : (
              <Link className="underline underline-offset-4" href="/kontakt">
                Zur Kontaktseite
              </Link>
            )}
          </>
        )}
      </div>
      <p className="mt-6 text-center text-[15px]">
        <Link className="underline underline-offset-4" href="/konto/anmelden">
          Zurück zur Anmeldung
        </Link>
      </p>
    </div>
  );
}
