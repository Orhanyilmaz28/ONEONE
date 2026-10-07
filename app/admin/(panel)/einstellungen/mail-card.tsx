"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Card, btn, btnSecondary, input, label } from "@/components/admin/ui";
import type { MailSettings } from "@/lib/mail-settings";
import { type MailFormState, saveMailSettings, sendTestMail } from "./mail-actions";

type Props = {
  settings: MailSettings;
  status: { provider: "brevo" | "resend" | "outbox" | "none"; ready: boolean; from: string | null; webhook: boolean; listId: boolean };
  fallbackEmail: string;
};

function Toggle({ name, title, text, defaultChecked }: { name: string; title: string; text: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 transition hover:border-ink/30 has-focus-visible:ring-4 has-focus-visible:ring-ink/15">
      <input defaultChecked={defaultChecked} className="mt-0.5 size-[18px] shrink-0 accent-ink" name={name} type="checkbox" value="1" />
      <span>
        <span className="block font-medium text-[15px]">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted leading-snug">{text}</span>
      </span>
    </label>
  );
}

export function MailCard({ settings, status, fallbackEmail }: Props) {
  const [state, action, pending] = useActionState<MailFormState, FormData>(saveMailSettings, {});
  const [test, setTest] = useState<MailFormState>({});
  const [testing, startTest] = useTransition();
  const providerName = { brevo: "Brevo", resend: "Resend", outbox: "Lokal (nur Test, landet in .data/outbox)", none: "–" }[status.provider];

  return (
    <div className="mt-8" id="emails">
      <Card actions={status.ready ? <Badge tone="green">Eingerichtet</Badge> : <Badge tone="amber">Noch nicht eingerichtet</Badge>} title="E-Mails">
        <dl className="mb-5 grid gap-3 text-[14px] sm:grid-cols-3">
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Versand über</dt>
            <dd className="mt-0.5 font-medium">{providerName}</dd>
          </div>
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Absender</dt>
            <dd className="mt-0.5 truncate font-medium">{status.from ?? "– (MAIL_FROM fehlt)"}</dd>
          </div>
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Stripe-Webhook</dt>
            <dd className="mt-0.5 font-medium">{status.webhook ? "Verbunden" : "Fehlt (optional, empfohlen)"}</dd>
          </div>
        </dl>

        {!status.ready ? (
          <p className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
            Damit der Shop selbst E-Mails verschickt, in Vercel <b>BREVO_API_KEY</b> und <b>MAIL_FROM</b> eintragen – Schritt für Schritt in der Anleitung „E-Mail-Versand
            einrichten“. Bis dahin: Bestellbestätigung über Stripe, Versand-E-Mail über dein E-Mail-Programm.
          </p>
        ) : null}

        <form action={action} className="space-y-3">
          <Toggle
            defaultChecked={settings.orderConfirmation}
            name="orderConfirmation"
            text="Mit Bestellübersicht, Lieferadresse und Widerrufsbelehrung. Tipp: Dann in Stripe die eigene Zahlungsbestätigung ausschalten, sonst kommen zwei E-Mails."
            title="Bestellbestätigung an Kund:innen"
          />
          <Toggle defaultChecked={settings.adminNotify} name="adminNotify" text="Bei jeder neuen Bestellung eine kurze Info mit Link ins Dashboard." title="Info an mich bei neuen Bestellungen" />
          <Toggle
            defaultChecked={settings.shippingNotice}
            name="shippingNotice"
            text="Beim Status „Versendet“ ist das Häkchen „Versand-E-Mail schicken“ schon gesetzt (mit Link zur Sendungsverfolgung)."
            title="Versand-E-Mail vorschlagen"
          />
          <div className="pt-2">
            <label className={label} htmlFor="adminEmail">
              Adresse für Benachrichtigungen <span className="font-normal text-muted">(leer = {fallbackEmail || "E-Mail aus den Firmendaten"})</span>
            </label>
            <input className={input} defaultValue={settings.adminEmail} id="adminEmail" name="adminEmail" placeholder={fallbackEmail || "du@exstase-energy.de"} type="email" />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button className={btn} disabled={pending} type="submit">
              {pending ? "Speichern …" : "Speichern"}
            </button>
            <button
              className={btnSecondary}
              disabled={testing || !status.ready}
              onClick={() => startTest(async () => setTest(await sendTestMail()))}
              title={status.ready ? undefined : "Erst den E-Mail-Versand einrichten"}
              type="button"
            >
              {testing ? "Wird verschickt …" : "Test-E-Mail an mich"}
            </button>
            <p aria-live="polite" className="text-[14px]" role="status">
              {state.error ? <span className="text-red-700">{state.error}</span> : state.message ? <span className="text-emerald-800">✓ {state.message}</span> : null}
            </p>
          </div>
          {test.error || test.message ? (
            <p className={`rounded-2xl px-4 py-3 text-[14px] ${test.error ? "bg-red-50 text-red-900" : "bg-emerald-50 text-emerald-900"}`} role="status">
              {test.error ?? `✓ ${test.message}`}
            </p>
          ) : null}
        </form>

        <p className="mt-5 border-line border-t pt-4 text-[13px] text-muted leading-relaxed">
          Außerdem automatisch, sobald der Versand eingerichtet ist: <b>Bestätigungs-E-Mail für den Newsletter</b> (Double-Opt-In) und <b>„Passwort vergessen“</b> für
          Kundenkonten.{status.listId ? " Bestätigte Newsletter-Adressen kommen automatisch in deine Brevo-Liste." : ""}
        </p>
      </Card>
    </div>
  );
}
