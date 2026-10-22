"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Badge, Card, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { MAIL_GROUPS, MAIL_TYPES, type MailType } from "@/lib/mail-types";
import { type MailFormState, saveMailSettings, sendTestMail } from "./actions";

type Props = {
  /** Kurzname → eingeschaltet */
  enabled: Record<string, boolean>;
  adminEmail: string;
  status: { provider: "brevo" | "resend" | "smtp" | "outbox" | "none"; ready: boolean; from: string | null; webhook: boolean };
  fallbackEmail: string;
};

function Row({ type, on }: { type: MailType; on: boolean }) {
  const preview = (
    <Link className="shrink-0 font-medium text-[13px] text-ink underline underline-offset-4 hover:text-ink/70" href={`/admin/emails/vorschau/${type.tag}`}>
      Vorschau
    </Link>
  );
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block font-medium text-[15px]">{type.label}</span>
      <span className="mt-0.5 block text-[13px] text-muted leading-snug">{type.when}</span>
      {type.note ? <span className="mt-0.5 block text-[12.5px] text-muted/90 italic leading-snug">{type.note}</span> : null}
    </span>
  );
  if (!type.switchable) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line p-4">
        <span className="mt-0.5 shrink-0">
          <Badge tone="neutral">{type.manual ? "Von Hand" : "Immer an"}</Badge>
        </span>
        {text}
        {preview}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line p-4 transition hover:border-ink/30 has-focus-visible:ring-4 has-focus-visible:ring-ink/15">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input defaultChecked={on} className="mt-0.5 size-[18px] shrink-0 accent-ink" name={`on:${type.tag}`} type="checkbox" value="1" />
        {text}
      </label>
      {preview}
    </div>
  );
}

export function MailCard({ enabled, adminEmail, status, fallbackEmail }: Props) {
  const [state, action, pending] = useActionState<MailFormState, FormData>(saveMailSettings, {});
  const [test, setTest] = useState<MailFormState>({});
  const [testing, startTest] = useTransition();
  const providerName = { brevo: "Brevo", resend: "Resend", smtp: "Eigenes Postfach (SMTP)", outbox: "Lokal (nur Test, landet in .data/outbox)", none: "–" }[status.provider];

  return (
    <>
      <Card actions={status.ready ? <Badge tone="green">Eingerichtet</Badge> : <Badge tone="amber">Noch nicht eingerichtet</Badge>} title="Versand">
        <dl className="grid gap-3 text-[14px] sm:grid-cols-3">
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Versand über</dt>
            <dd className="mt-0.5 font-medium">{providerName}</dd>
          </div>
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Absender</dt>
            <dd className="mt-0.5 truncate font-medium">{status.from ?? "– (noch keiner)"}</dd>
          </div>
          <div className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
            <dt className="text-[12px] text-muted">Stripe-Webhook</dt>
            <dd className="mt-0.5 font-medium">{status.webhook ? "Verbunden" : "Fehlt (optional, empfohlen)"}</dd>
          </div>
        </dl>
        {!status.ready ? (
          <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
            Damit der Shop selbst E-Mails verschickt, in Vercel den Zugang zum Postfach eintragen: <b>SMTP_HOST</b>, <b>SMTP_USER</b> und <b>SMTP_PASS</b> (z. B. Strato) –
            oder alternativ <b>BREVO_API_KEY</b> und <b>MAIL_FROM</b>.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className={btnSecondary}
            disabled={testing || !status.ready}
            onClick={() => startTest(async () => setTest(await sendTestMail()))}
            title={status.ready ? undefined : "Erst den E-Mail-Versand einrichten"}
            type="button"
          >
            {testing ? "Wird verschickt …" : "Test-E-Mail an mich"}
          </button>
          {test.error || test.message ? (
            <p className={`text-[14px] ${test.error ? "text-red-700" : "text-emerald-800"}`} role="status">
              {test.error ?? `✓ ${test.message}`}
            </p>
          ) : null}
        </div>
      </Card>

      <form action={action} className="mt-6">
        <Card title="Welche E-Mails der Shop verschickt">
          <p className="mb-5 text-[14px] text-muted leading-relaxed">
            Haken weg = diese E-Mail wird nicht mehr verschickt (im Protokoll steht dann „aus“). Mit „Vorschau“ siehst du jede E-Mail mit Beispieldaten und kannst sie dir schicken.
          </p>
          <div className="space-y-7">
            {MAIL_GROUPS.map((g) => (
              <section key={g.key}>
                <h3 className="mb-2.5 text-[12px] text-muted uppercase tracking-[0.1em]">{g.label}</h3>
                <div className="space-y-2.5">
                  {MAIL_TYPES.filter((t) => t.group === g.key).map((t) => (
                    <Row key={t.tag} on={enabled[t.tag] !== false} type={t} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-7 border-line border-t pt-5">
            <label className={label} htmlFor="adminEmail">
              Adresse für Mails „An dich“ <span className="font-normal text-muted">(leer = {fallbackEmail || "E-Mail aus den Firmendaten"})</span>
            </label>
            <input className={input} defaultValue={adminEmail} id="adminEmail" name="adminEmail" placeholder={fallbackEmail || "du@beispiel.de"} type="email" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className={btn} disabled={pending} type="submit">
              {pending ? "Speichern …" : "Speichern"}
            </button>
            <p aria-live="polite" className="text-[14px]" role="status">
              {state.error ? <span className="text-red-700">{state.error}</span> : state.message ? <span className="text-emerald-800">✓ {state.message}</span> : null}
            </p>
          </div>
        </Card>
      </form>
    </>
  );
}
