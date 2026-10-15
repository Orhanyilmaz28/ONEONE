"use client";

import { useActionState } from "react";
import type { InfluencerProfile } from "@/lib/influencers";
import { type FormState, influencerProfileAction } from "../../actions";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

type Props = { inf: Pick<InfluencerProfile, "name" | "phone" | "street" | "zip" | "city" | "smallBusiness" | "taxNo" | "vatId" | "iban" | "accountHolder"> };

export function ProfileForm({ inf }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(influencerProfileAction, undefined);
  // Nach dem Absenden setzt React das Formular zurück – bei Fehlern mit den eben eingegebenen Werten
  const v = { ...inf, ...(state?.values as Partial<Props["inf"]> | undefined) };
  return (
    <form action={action} className="mt-8 grid gap-4 rounded-[1.5rem] border border-line bg-card p-5 sm:grid-cols-2 sm:p-6">
      <h2 className="font-bold sm:col-span-2">Anschrift</h2>
      <label className="grid gap-1.5 text-sm">
        Vor- und Nachname
        <input autoComplete="name" className={field} defaultValue={v.name} maxLength={100} name="name" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Telefon (optional)
        <input autoComplete="tel" className={field} defaultValue={v.phone} maxLength={40} name="phone" type="tel" />
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Straße und Hausnummer
        <input autoComplete="street-address" className={field} defaultValue={v.street} maxLength={120} name="street" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        PLZ
        <input autoComplete="postal-code" className={field} defaultValue={v.zip} inputMode="numeric" maxLength={5} name="zip" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Ort
        <input autoComplete="address-level2" className={field} defaultValue={v.city} maxLength={80} name="city" required />
      </label>

      <h2 className="mt-4 font-bold sm:col-span-2">Steuer</h2>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input className="mt-1 size-4 accent-accent" defaultChecked={v.smallBusiness} name="smallBusiness" type="checkbox" />
        <span>Ich bin Kleinunternehmer:in nach § 19 UStG (Gutschrift ohne Umsatzsteuer). Ohne Häkchen rechnen wir zzgl. 19 % USt. ab.</span>
      </label>
      <label className="grid gap-1.5 text-sm">
        Steuernummer
        <input className={field} defaultValue={v.taxNo} maxLength={30} name="taxNo" placeholder="12/345/67890" />
      </label>
      <label className="grid gap-1.5 text-sm">
        USt-IdNr. (falls vorhanden)
        <input className={field} defaultValue={v.vatId} maxLength={30} name="vatId" placeholder="DE123456789" />
      </label>

      <h2 className="mt-4 font-bold sm:col-span-2">Bankverbindung für die Auszahlung</h2>
      <label className="grid gap-1.5 text-sm">
        IBAN
        <input autoComplete="off" className={field} defaultValue={v.iban} maxLength={42} name="iban" placeholder="DE12 3456 7890 1234 5678 90" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Kontoinhaber:in
        <input className={field} defaultValue={v.accountHolder} maxLength={100} name="accountHolder" />
      </label>

      {state?.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm sm:col-span-2" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-accent text-sm sm:col-span-2" role="status">
          {state.ok}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button className="inline-flex h-12 items-center rounded-full bg-accent px-8 font-bold text-black transition hover:bg-accent-dark disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
