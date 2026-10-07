import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckIcon } from "@/components/icons";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Registrieren" };

const BENEFITS = ["Alle Bestellungen und Lieferstatus auf einen Blick", "Lieferadresse speichern", "Konto jederzeit selbst löschen"];

export default async function RegisterPage() {
  if (await getCurrentCustomer()) redirect("/konto");
  return (
    <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-[1fr_26rem] lg:gap-14">
      <div>
        <p className="t-eyebrow">Mein Konto</p>
        <h1 className="t-h1 mt-3">Konto anlegen</h1>
        <p className="t-lead mt-4 text-ink/75">Kostenlos und in einer Minute erledigt. Bestellen kannst du natürlich weiterhin auch ohne Konto.</p>
        <ul className="mt-8 space-y-3">
          {BENEFITS.map((b) => (
            <li className="flex items-start gap-3" key={b}>
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <CheckIcon className="size-3.5" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="rounded-[1.75rem] border border-line bg-white p-6 sm:p-8">
          <RegisterForm />
        </div>
        <p className="mt-6 text-center text-[15px] text-ink/80">
          Schon registriert?{" "}
          <Link className="font-medium underline underline-offset-4" href="/konto/anmelden">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
