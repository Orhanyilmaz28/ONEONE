import type { Metadata } from "next";
import Link from "next/link";
import { ActivateForm } from "../auth-form";
import { AuthShell } from "../auth-shell";
import { activationValid } from "../actions";

export const metadata: Metadata = { title: "Händlerzugang einrichten", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ id?: string; t?: string }> };

export default async function ActivatePage({ searchParams }: Props) {
  const { id = "", t = "" } = await searchParams;
  const info = await activationValid(id, t);
  if (!info) {
    return (
      <AuthShell eyebrow="Händlerzugang" title="Link nicht mehr gültig.">
        <p className="text-center text-muted">Dieser Link ist abgelaufen oder wurde schon benutzt. Schreib uns kurz – wir schicken dir einen neuen.</p>
        <Link className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border border-accent font-bold text-accent" href="/haendler/login">
          Zum Login
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Freigeschaltet" title={`Willkommen, ${info.contact.split(" ")[0]}!`}>
      <p className="mb-6 text-center text-muted">
        <b className="text-ink">{info.company}</b> ist als Händler freigeschaltet. Lege jetzt dein Passwort fest – danach landest du direkt in deinem Händlerbereich.
      </p>
      <ActivateForm id={id} token={t} />
    </AuthShell>
  );
}
