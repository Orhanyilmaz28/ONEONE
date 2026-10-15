import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../haendler/auth-shell";
import { influencerActivationValid } from "../actions";
import { ActivateForm } from "../auth-form";

export const metadata: Metadata = { title: "Influencer-Zugang einrichten", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ id?: string; t?: string }> };

export default async function ActivatePage({ searchParams }: Props) {
  const { id = "", t = "" } = await searchParams;
  const info = await influencerActivationValid(id, t);
  if (!info) {
    return (
      <AuthShell eyebrow="Influencer-Zugang" title="Link nicht mehr gültig.">
        <p className="text-center text-muted">Dieser Link ist abgelaufen oder wurde schon benutzt. Schreib uns kurz – wir schicken dir einen neuen.</p>
        <Link className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border border-accent font-bold text-accent" href="/influencer/login">
          Zum Login
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Freigeschaltet" title={`Willkommen, ${info.name.split(" ")[0]}!`}>
      <p className="mb-6 text-center text-muted">
        <b className="text-ink">{info.alias}</b> ist freigeschaltet{info.code ? (
          <>
            {" "}– dein Code ist <b className="text-accent">{info.code}</b>
          </>
        ) : null}
        . Lege jetzt dein Passwort fest, danach landest du direkt in deinem Dashboard.
      </p>
      <ActivateForm id={id} token={t} />
    </AuthShell>
  );
}
