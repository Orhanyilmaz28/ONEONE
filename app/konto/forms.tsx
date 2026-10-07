"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useId, useState } from "react";
import { PASSWORD_MIN } from "@/lib/customer-rules";
import { type FormState, changePassword, deleteAccount, login, register, requestPasswordReset, saveProfile, setNewPassword } from "./actions";

const field =
  "w-full rounded-xl border border-line bg-white px-4 py-3 outline-none transition placeholder:text-ink/35 focus:border-ink focus-visible:ring-4 focus-visible:ring-ink/5 aria-[invalid=true]:border-red-300 aria-[invalid=true]:bg-red-50/40";
const primary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-medium text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/20 disabled:opacity-60";

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
  required,
  maxLength = 200,
  placeholder,
  extra,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  hint?: ReactNode;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  extra?: ReactNode;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <label className="font-medium text-[14px]" htmlFor={id}>
          {label}
        </label>
        {extra}
      </div>
      <div className="relative">
        <input
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          className={`${field} ${isPassword ? "pr-24" : ""}`}
          defaultValue={defaultValue}
          id={id}
          maxLength={maxLength}
          name={name}
          placeholder={placeholder}
          required={required}
          type={isPassword && show ? "text" : type}
        />
        {isPassword ? (
          <button
            aria-pressed={show}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[13px] text-ink/70 transition hover:bg-ink/5 hover:text-ink"
            onClick={() => setShow((s) => !s)}
            type="button"
          >
            {show ? "Verbergen" : "Anzeigen"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] text-red-700" id={`${id}-msg`}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted" id={`${id}-msg`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Alert({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800" role="alert">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900" role="status">
        {state.message}
      </p>
    );
  return null;
}

/* ───────── Anmelden ───────── */

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input name="weiter" type="hidden" value={next} />
      <Alert state={state} />
      <Field autoComplete="email" defaultValue={state.values?.email} label="E-Mail-Adresse" name="email" required type="email" />
      <Field
        autoComplete="current-password"
        extra={
          <Link className="text-[13px] text-ink/70 underline underline-offset-2 hover:text-ink" href="/konto/passwort-vergessen">
            Passwort vergessen?
          </Link>
        }
        label="Passwort"
        maxLength={201}
        name="password"
        required
        type="password"
      />
      <button className={`${primary} w-full`} disabled={pending} type="submit">
        {pending ? "Moment …" : "Anmelden"}
      </button>
    </form>
  );
}

/* ───────── Registrieren ───────── */

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alert state={state} />
      <Field autoComplete="name" defaultValue={state.values?.name} error={e.name} label="Vor- und Nachname" maxLength={80} name="name" required />
      <Field autoComplete="email" defaultValue={state.values?.email} error={e.email} label="E-Mail-Adresse" name="email" required type="email" />
      <Field
        autoComplete="new-password"
        error={e.password}
        hint={`Mindestens ${PASSWORD_MIN} Zeichen. Am sichersten: ein ganzer Satz, den du dir gut merken kannst.`}
        label="Passwort"
        maxLength={201}
        name="password"
        required
        type="password"
      />
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input autoComplete="off" name="website" tabIndex={-1} type="text" />
      </div>
      <div>
        <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed">
          <input aria-invalid={e.consent ? true : undefined} className="mt-1 size-[18px] shrink-0 accent-ink" name="consent" type="checkbox" value="1" />
          <span>
            Ich habe die{" "}
            <Link className="underline underline-offset-2" href="/datenschutz" target="_blank">
              Datenschutzerklärung
            </Link>{" "}
            gelesen. Meine Angaben werden für mein Kundenkonto gespeichert; ich kann das Konto jederzeit selbst löschen.
          </span>
        </label>
        {e.consent ? <p className="mt-1.5 text-[13px] text-red-700">{e.consent}</p> : null}
      </div>
      <button className={`${primary} w-full`} disabled={pending} type="submit">
        {pending ? "Moment …" : "Konto anlegen"}
      </button>
    </form>
  );
}

/* ───────── Meine Daten ───────── */

export type ProfileValues = { name: string; email: string; line1: string; line2: string; postalCode: string; city: string; country: string };

const COUNTRIES: [string, string][] = [
  ["DE", "Deutschland"],
  ["AT", "Österreich"],
  ["NL", "Niederlande"],
  ["BE", "Belgien"],
  ["LU", "Luxemburg"],
  ["FR", "Frankreich"],
  ["IT", "Italien"],
  ["DK", "Dänemark"],
];

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, {});
  const e = state.fieldErrors ?? {};
  const id = useId();
  const v = { ...initial, ...state.values };
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alert state={state} />
      <Field autoComplete="name" defaultValue={v.name} error={e.name} label="Name" maxLength={80} name="name" required />
      <div>
        <p className="mb-1.5 font-medium text-[14px]">E-Mail-Adresse</p>
        <p className="rounded-xl border border-line bg-paper px-4 py-3 text-ink/80">{initial.email}</p>
        <p className="mt-1.5 text-[13px] text-muted">Zum Ändern der Adresse schreib uns kurz – sie ist mit deinen Bestellungen verknüpft.</p>
      </div>
      <fieldset className="space-y-4 border-line border-t pt-4">
        <legend className="pt-4 font-medium">Lieferadresse (optional)</legend>
        <Field autoComplete="address-line1" defaultValue={v.line1} error={e.line1} label="Straße und Hausnummer" maxLength={120} name="line1" />
        <Field autoComplete="address-line2" defaultValue={v.line2} label="Adresszusatz" maxLength={120} name="line2" />
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field autoComplete="postal-code" defaultValue={v.postalCode} error={e.postalCode} label="PLZ" maxLength={12} name="postalCode" />
          <Field autoComplete="address-level2" defaultValue={v.city} error={e.city} label="Ort" maxLength={80} name="city" />
        </div>
        <div>
          <label className="mb-1.5 block font-medium text-[14px]" htmlFor={`${id}-country`}>
            Land
          </label>
          <select autoComplete="country" className={field} defaultValue={v.country || "DE"} id={`${id}-country`} name="country">
            {COUNTRIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          {e.country ? <p className="mt-1.5 text-[13px] text-red-700">{e.country}</p> : null}
        </div>
      </fieldset>
      <button className={primary} disabled={pending} type="submit">
        {pending ? "Speichern …" : "Speichern"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" key={state.at}>
      <Alert state={state} />
      <Field autoComplete="current-password" error={e.current} label="Aktuelles Passwort" maxLength={201} name="current" required type="password" />
      <Field autoComplete="new-password" error={e.next} hint={`Mindestens ${PASSWORD_MIN} Zeichen.`} label="Neues Passwort" maxLength={201} name="next" required type="password" />
      <button className={primary} disabled={pending} type="submit">
        {pending ? "Moment …" : "Passwort ändern"}
      </button>
    </form>
  );
}

export function DeleteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="rounded-full border border-red-200 px-5 py-2.5 font-medium text-[15px] text-red-700 transition hover:bg-red-50" onClick={() => setOpen(true)} type="button">
        Konto löschen …
      </button>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-red-200 bg-red-50/50 p-4">
      <p className="text-[14px] text-red-900 leading-relaxed">
        Dein Konto und deine gespeicherten Angaben werden sofort gelöscht. Bestellungen, die wir aus rechtlichen Gründen aufbewahren müssen (z. B. für das
        Finanzamt), bleiben davon unberührt.
      </p>
      <Alert state={state.fieldErrors ? {} : state} />
      <Field autoComplete="current-password" error={state.fieldErrors?.password} label="Zur Sicherheit: dein Passwort" maxLength={201} name="password" required type="password" />
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex h-11 items-center rounded-full bg-red-700 px-5 font-medium text-white transition hover:bg-red-800 disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Wird gelöscht …" : "Ja, Konto endgültig löschen"}
        </button>
        <button className="h-11 rounded-full px-5 text-[15px] text-ink/70 hover:text-ink" onClick={() => setOpen(false)} type="button">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

/* ───────── Passwort vergessen ───────── */

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.message) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900 leading-relaxed" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <Alert state={state} />
      <Field autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} label="E-Mail-Adresse deines Kontos" name="email" required type="email" />
      <button className={`${primary} w-full`} disabled={pending} type="submit">
        {pending ? "Moment …" : "Link zum Zurücksetzen schicken"}
      </button>
    </form>
  );
}

export function NewPasswordForm({ id, token }: { id: string; token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setNewPassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input name="u" type="hidden" value={id} />
      <input name="t" type="hidden" value={token} />
      <Alert state={state} />
      <Field autoComplete="new-password" error={state.fieldErrors?.password} hint={`Mindestens ${PASSWORD_MIN} Zeichen.`} label="Neues Passwort" maxLength={201} name="password" required type="password" />
      <button className={`${primary} w-full`} disabled={pending} type="submit">
        {pending ? "Moment …" : "Passwort speichern & anmelden"}
      </button>
    </form>
  );
}
