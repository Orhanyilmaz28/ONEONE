"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useState } from "react";
import { btn, btnSecondary, input, label } from "@/components/admin/ui";
import type { OrderStatus } from "@/lib/orders";
import { type SaveOrderState, saveOrder } from "./actions";
import { CARRIERS, DEFAULT_CARRIER, STATUS_HINT, STATUS_LABEL, STATUS_ORDER, isValidTracking, mailtoHref, normalizeTracking, shippingMail, trackingUrl } from "./shipping";

const DOT: Record<OrderStatus, string> = {
  offen: "bg-amber-500",
  versendet: "bg-sky-500",
  erledigt: "bg-emerald-500",
  storniert: "bg-red-500",
};

type Props = {
  id: string;
  number: string;
  customer: { name: string; email: string };
  initial: { status: OrderStatus; tracking?: string; carrier?: string; note?: string };
  brand: string;
  companyName: string;
  /** E-Mail-Versand eingerichtet → Versand-E-Mail direkt aus dem Shop */
  mailReady?: boolean;
  /** Häkchen „Versand-E-Mail schicken“ vorausgewählt (Einstellung im Dashboard) */
  notifyDefault?: boolean;
  /** Wann die Versand-E-Mail schon einmal verschickt wurde */
  mailSentAt?: string;
};

/** Formular: Status, Versanddienst + Sendungsnummer, interne Notiz */
export function OrderForm({ id, number, customer, initial, brand, companyName, mailReady = false, notifyDefault = true, mailSentAt }: Props) {
  const [state, action, pending] = useActionState<SaveOrderState, FormData>(saveOrder, {});
  const [status, setStatus] = useState<OrderStatus>(initial.status);
  const [carrier, setCarrier] = useState(initial.carrier ?? DEFAULT_CARRIER);
  const [tracking, setTracking] = useState(initial.tracking ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [trackingTouched, setTrackingTouched] = useState(false);
  const alreadyMailed = Boolean(mailSentAt) || state.mailed === true;
  const [notify, setNotify] = useState(notifyDefault && !mailSentAt);
  // Nach dem Verschicken das Häkchen abnehmen, damit beim nächsten Speichern nicht doppelt gesendet wird
  useEffect(() => {
    if (state.mailed === true) setNotify(false);
  }, [state.mailed]);

  // Nach dem Speichern die bereinigte Sendungsnummer übernehmen (z. B. ohne Leerzeichen)
  useEffect(() => {
    if (state.saved) setTracking(state.saved.tracking ?? "");
  }, [state.saved]);

  const nr = normalizeTracking(tracking);
  const dirty =
    status !== initial.status ||
    nr !== (initial.tracking ?? "") ||
    note.trim() !== (initial.note ?? "") ||
    (nr.length > 0 && carrier !== (initial.carrier ?? DEFAULT_CARRIER));

  const link = trackingUrl(nr, carrier);
  const trackingInvalid = nr.length > 0 && !isValidTracking(nr);
  const showTrackingError = trackingInvalid && (trackingTouched || Boolean(state.fieldErrors?.tracking) || nr.length > 6);
  const trackingError = showTrackingError
    ? nr.length < 6
      ? "Die Sendungsnummer ist zu kurz (mindestens 6 Zeichen)."
      : "Bitte nur Buchstaben und Ziffern verwenden (höchstens 40 Zeichen)."
    : undefined;

  // Versand-E-Mail für die Erfolgsmeldung (mit den gespeicherten Werten)
  const mail =
    state.saved?.status === "versendet" && customer.email
      ? shippingMail({ order: { number, customer }, tracking: state.saved.tracking, carrier: state.saved.carrier, brand, companyName })
      : null;
  const firstName = customer.name.trim().split(/\s+/)[0];

  // Selbst absenden statt nur über `action`: React setzt Formulare nach einer Action sonst zurück –
  // dann würden die Status-Knöpfe wieder den alten Stand zeigen. `action` bleibt als Rückfall ohne JavaScript.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form action={action} className="space-y-6" onSubmit={onSubmit}>
      <input name="id" type="hidden" value={id} />

      <fieldset>
        <legend className={label}>Status</legend>
        <div className="grid grid-cols-2 gap-2 @[40rem]:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <label
              className="relative flex cursor-pointer flex-col gap-0.5 rounded-2xl border border-line bg-card px-3.5 py-3 transition hover:border-ink/30 has-checked:border-ink has-checked:bg-ink/[0.03] has-checked:shadow-[inset_0_0_0_1px_var(--color-ink)] has-focus-visible:ring-4 has-focus-visible:ring-ink/25"
              key={s}
            >
              <input checked={status === s} className="sr-only" name="status" onChange={() => setStatus(s)} type="radio" value={s} />
              <span className="flex items-center gap-2 font-medium text-[15px]">
                <span aria-hidden className={`size-2 rounded-full ${DOT[s]}`} />
                {STATUS_LABEL[s]}
              </span>
              <span className="text-[12.5px] text-muted leading-snug">{STATUS_HINT[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <div>
          <label className={label} htmlFor="carrier">
            Versand mit
          </label>
          <div className="relative">
            <select className={`${input} cursor-pointer appearance-none pr-10`} id="carrier" name="carrier" onChange={(e) => setCarrier(e.target.value)} value={carrier}>
              {CARRIERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <svg aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="tracking">
            Sendungsnummer
          </label>
          <input
            aria-describedby="tracking-hint"
            aria-invalid={trackingError ? true : undefined}
            autoComplete="off"
            className={`${input} font-mono text-[14px] tracking-wide placeholder:font-sans placeholder:tracking-normal ${trackingError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
            id="tracking"
            maxLength={60}
            name="tracking"
            onBlur={() => setTrackingTouched(true)}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="z. B. 00340434161094012345"
            spellCheck={false}
            value={tracking}
          />
          <div className="mt-1.5 min-h-5 text-[13px]" id="tracking-hint">
            {trackingError ? (
              <span className="text-red-700">{trackingError}</span>
            ) : link ? (
              <a className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4 hover:no-underline" href={link} rel="noreferrer" target="_blank">
                Sendung verfolgen ↗
              </a>
            ) : status === "versendet" ? (
              <span className="text-amber-800">Tipp: Trag die Sendungsnummer ein – dann kann die Kund:in ihr Paket verfolgen.</span>
            ) : (
              <span className="text-muted">Steht auf dem Paketschein (bei DHL meist 12 oder 20 Ziffern).</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="note">
          Interne Notiz <span className="font-normal text-muted">(sieht nur du, nicht die Kund:in)</span>
        </label>
        <textarea
          aria-describedby={state.fieldErrors?.note ? "note-error" : undefined}
          aria-invalid={state.fieldErrors?.note ? true : undefined}
          className={`${input} min-h-24 resize-y`}
          id="note"
          maxLength={2000}
          name="note"
          onChange={(e) => setNote(e.target.value)}
          placeholder="z. B. „Kundin hat angerufen – bitte Größe M statt L“"
          rows={3}
          value={note}
        />
        {state.fieldErrors?.note ? (
          <p className="mt-1.5 text-[13px] text-red-700" id="note-error">
            {state.fieldErrors.note}
          </p>
        ) : null}
      </div>

      {mailReady && status === "versendet" && customer.email ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm has-focus-visible:ring-4 has-focus-visible:ring-ink/15">
          <input checked={notify} className="mt-0.5 size-[18px] shrink-0 accent-ink" name="notify" onChange={(e) => setNotify(e.target.checked)} type="checkbox" value="1" />
          <span>
            <span className="block font-medium">{alreadyMailed ? "Versand-E-Mail erneut schicken" : "Versand-E-Mail an die Kund:in schicken"}</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Geht beim Speichern an {customer.email}
              {nr ? " – mit Link zur Sendungsverfolgung." : ". Tipp: vorher die Sendungsnummer eintragen."}
              {mailSentAt ? ` Zuletzt verschickt am ${new Date(mailSentAt).toLocaleDateString("de-DE")}.` : ""}
            </span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-col gap-3 border-line border-t pt-5 sm:flex-row sm:items-center">
        <button className={`${btn} sm:min-w-36`} disabled={pending} type="submit">
          {pending ? (
            <>
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Speichere …
            </>
          ) : (
            "Speichern"
          )}
        </button>
        <div aria-live="polite" className="min-w-0 text-sm">
          {pending ? null : state.error ? (
            <p className="text-red-700" role="alert">
              {state.error}
            </p>
          ) : dirty ? (
            <p className="text-muted">Du hast Änderungen, die noch nicht gespeichert sind.</p>
          ) : state.ok ? (
            <p className="flex items-center gap-2 font-medium text-emerald-800">
              <svg aria-hidden className="size-4 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="m5 12 5 5L20 7" />
              </svg>
              {state.message}
            </p>
          ) : null}
        </div>
      </div>

      {typeof state.mailed === "string" && !pending ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-red-900 text-sm" role="alert">
          Die Versand-E-Mail konnte nicht verschickt werden ({state.mailed}). Du kannst sie unten über dein E-Mail-Programm schicken.
        </p>
      ) : null}

      {/* Nach „Versendet“ ohne automatischen Versand: über das eigene E-Mail-Programm informieren */}
      {mail && state.ok && state.mailed !== true && !dirty && !pending ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed">
            <b className="font-medium">Letzter Schritt:</b> Sag {firstName && firstName !== "—" ? firstName : "der Kund:in"} Bescheid, dass das Paket unterwegs ist
            {state.saved?.tracking ? " – der Link zur Sendungsverfolgung steht schon im Text." : "."}
          </p>
          <a className={`${btnSecondary} shrink-0`} href={mailtoHref(customer.email, mail.subject, mail.body)}>
            Versand-E-Mail öffnen
          </a>
        </div>
      ) : null}
    </form>
  );
}
