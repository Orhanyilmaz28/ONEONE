"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Card, Notice, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { companyView } from "@/components/legal-page";
import { AnnouncementText, freeShippingLabel, formatPriceShort, shippingRules } from "@/components/trust";
import { formatPrice } from "@/lib/format";
import { RETURN_COST_SENTENCE, type ReturnCostPayer, type Settings, missingCompanyFields } from "@/lib/settings-defaults";
import { type SettingsFormState, saveSettings } from "./actions";
import {
  ANNOUNCEMENT_MAX,
  COMPANY_FIELDS,
  type CompanyKey,
  type SettingsInput,
  centsToInput,
  checkSettings,
  cleanAnnouncement,
  cleanText,
  fieldName,
  isMissingValue,
  normalizeVatId,
  parseEuro,
  toInput,
} from "./validate";

/** Kleinere Variante des Zweit-Knopfs */
const btnSecondarySm = btnSecondary.replace("px-5 py-2.5", "px-4 py-2");

const fieldId = (name: string) => `f-${name.replace(/\./g, "-")}`;

type Props = {
  settings: Settings;
  /** Standard-Versandkosten (für „Standardwerte einsetzen“) */
  defaults: Settings["shipping"];
  /** false, wenn online noch kein Datenspeicher verbunden ist */
  canSave: boolean;
};

export function SettingsForm({ settings, defaults, canSave }: Props) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSettings, {});

  const initial = useMemo(() => toInput(settings), [settings]);
  const initialKey = JSON.stringify(initial);
  const [values, setValues] = useState(initial);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState<string>();
  // Meldung ausblenden, sobald weiter bearbeitet wird (ein neues Ergebnis erscheint automatisch wieder)
  const [dismissed, setDismissed] = useState<SettingsFormState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach dem Speichern kommt ein neuer Stand vom Server → Felder daran anpassen
  if (syncedKey !== initialKey) {
    setSyncedKey(initialKey);
    setValues(initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
  }

  const showResult = dismissed !== state;
  const check = useMemo(() => checkSettings(values), [values]);
  const errorCount = Object.keys(check.errors).length;
  const dirty = JSON.stringify(values) !== initialKey;

  /** Fehlermeldung eines Feldes – erst nach dem Verlassen des Feldes oder dem Speichern-Versuch */
  function errorFor(name: string) {
    const local = submitted || touched[name] ? check.errors[name] : undefined;
    return local ?? (showResult ? state.fieldErrors?.[name] : undefined);
  }

  // Warnung beim Verlassen der Seite mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ── Ändern ── */
  function edit(change: (v: SettingsInput) => SettingsInput) {
    setValues(change);
    setDismissed(state);
    setLocalError(undefined);
  }
  const setCompany = (key: CompanyKey, value: string) => edit((v) => ({ ...v, company: { ...v.company, [key]: value } }));
  const setShipping = (patch: Partial<SettingsInput["shipping"]>) => edit((v) => ({ ...v, shipping: { ...v.shipping, ...patch } }));
  const touch = (name: string) => setTouched((t) => ({ ...t, [name]: true }));

  /** Beim Verlassen eines Feldes aufräumen: Leerzeichen, „de 123 …“ → „DE123…“ */
  function blurCompany(key: CompanyKey) {
    const raw = values.company[key];
    const clean = key === "vatId" ? normalizeVatId(raw) : cleanText(raw);
    if (clean !== raw) setValues((v) => ({ ...v, company: { ...v.company, [key]: clean } }));
    touch(fieldName.company(key));
  }
  /** Beim Verlassen eines Betragsfeldes „4,9“ schön als „4,90“ schreiben */
  function blurAmount(key: "cost" | "freeFrom" | "express") {
    const parsed = parseEuro(values.shipping[key]);
    if (!parsed.error && parsed.cents !== null) {
      const text = centsToInput(parsed.cents);
      if (text !== values.shipping[key]) setValues((v) => ({ ...v, shipping: { ...v.shipping, [key]: text } }));
    }
    touch(fieldName[key]);
  }

  function discard() {
    setValues(initial);
    setTouched({});
    setSubmitted(false);
    setLocalError(undefined);
    setDismissed(state);
  }

  function focusField(name: string) {
    const el = document.getElementById(fieldId(name));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  /* ── Speichern ── */
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    // Selbst absenden statt nur über `action`: React setzt Formulare nach einer Action sonst zurück.
    e.preventDefault();
    if (pending || !canSave) return;
    setSubmitted(true);
    if (errorCount) {
      setLocalError(errorCount === 1 ? "Bitte korrigiere das rot markierte Feld." : `Bitte korrigiere die ${errorCount} rot markierten Felder.`);
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setLocalError(undefined);
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  /* ── Live-Werte für die Vorschauen ── */
  const liveCompany = useMemo(() => {
    const c = {} as Settings["company"];
    for (const f of COMPANY_FIELDS) c[f.key] = f.key === "vatId" ? normalizeVatId(values.company[f.key]) : cleanText(values.company[f.key]);
    return c;
  }, [values.company]);
  const liveShipping = useMemo(() => {
    const amount = (raw: string) => parseEuro(raw).cents;
    const cost = amount(values.shipping.cost);
    const freeFrom = values.shipping.freeEnabled ? amount(values.shipping.freeFrom) : 0;
    const express = values.shipping.expressEnabled ? amount(values.shipping.express) : 0;
    return cost === null || freeFrom === null || express === null ? null : { cost, freeFrom, express };
  }, [values.shipping]);

  // Was ist im gespeicherten Stand noch offen? (gelbe Hinweis-Box oben)
  const savedMissing = missingCompanyFields(settings);

  /* ── Statuszeile unten ── */
  let status: { tone: "neutral" | "amber" | "red" | "green"; text: string };
  if (!canSave) status = { tone: "amber", text: "Speichern geht erst, wenn ein Datenspeicher verbunden ist (siehe Hinweis oben)." };
  else if (pending) status = { tone: "neutral", text: "Wird gespeichert …" };
  else if (localError) status = { tone: "red", text: localError };
  else if (showResult && state.error) status = { tone: "red", text: state.error };
  else if (dirty) status = { tone: "amber", text: "Ungespeicherte Änderungen" };
  else if (showResult && state.message) status = { tone: "green", text: state.message };
  else status = { tone: "neutral", text: "Alles gespeichert" };
  const barSticky = dirty || pending || status.tone === "red" || status.tone === "green";

  const usingDefaults =
    values.shipping.cost === centsToInput(defaults.cost) &&
    values.shipping.freeEnabled === defaults.freeFrom > 0 &&
    values.shipping.freeFrom === centsToInput(defaults.freeFrom) &&
    values.shipping.expressEnabled === defaults.express > 0 &&
    values.shipping.express === centsToInput(defaults.express);

  return (
    <form action={action} className="relative" noValidate onSubmit={onSubmit} ref={formRef}>
      {/* Sprungmarken */}
      <nav aria-label="Bereiche" className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1">
        {[
          { href: "#firmendaten", label: "Firmendaten" },
          { href: "#versand", label: "Versand" },
          { href: "#ruecksendung", label: "Rücksendung" },
          { href: "#hinweis", label: "Aktions-Hinweis" },
        ].map((l) => (
          <a
            className="shrink-0 rounded-full border border-line bg-white px-4 py-2 text-[14px] text-ink/80 transition hover:border-ink/30 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
            href={l.href}
            key={l.href}
          >
            {l.label}
          </a>
        ))}
      </nav>

      {savedMissing.length ? (
        <div className="mb-6">
          <Notice title="Pflichtangaben fürs Impressum fehlen">
            <p>
              Bitte ergänze{" "}
              {savedMissing.map((key, i) => (
                <span key={key}>
                  {i > 0 ? (i === savedMissing.length - 1 ? " und " : ", ") : null}
                  <button
                    className="rounded font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    onClick={() => focusField(fieldName.company(key))}
                    type="button"
                  >
                    {COMPANY_FIELDS.find((f) => f.key === key)?.label ?? key}
                  </button>
                </span>
              ))}
              . Bis dahin steht im Impressum an diesen Stellen ein gelb markierter Platzhalter – ein Impressum mit Lücken kann abgemahnt werden.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {/* ───────────── Firmendaten ───────────── */}
        <div className="scroll-mt-6" id="firmendaten">
          <Card
            actions={
              <a className="whitespace-nowrap text-[13px] text-ink/70 underline-offset-4 hover:text-ink hover:underline" href="/impressum" rel="noopener" target="_blank">
                Impressum ansehen ↗
              </a>
            }
            title="Firmendaten (Impressum)"
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="grid content-start gap-x-5 gap-y-5 sm:grid-cols-2">
                {COMPANY_FIELDS.map((f) => (
                  <TextField
                    autoComplete={f.autoComplete}
                    error={errorFor(fieldName.company(f.key))}
                    help={f.help}
                    key={f.key}
                    label={f.label}
                    missing={isMissingValue(cleanText(values.company[f.key]))}
                    name={fieldName.company(f.key)}
                    onBlur={() => blurCompany(f.key)}
                    onChange={(v) => setCompany(f.key, v)}
                    placeholder={f.placeholder}
                    type={f.type}
                    value={values.company[f.key]}
                    wide={f.wide}
                  />
                ))}
              </div>
              <ImprintPreview company={liveCompany} />
            </div>
          </Card>
        </div>

        {/* ───────────── Versand ───────────── */}
        <div className="scroll-mt-6" id="versand">
          <Card
            actions={
              <a className="whitespace-nowrap text-[13px] text-ink/70 underline-offset-4 hover:text-ink hover:underline" href="/versand" rel="noopener" target="_blank">
                Versandseite ansehen ↗
              </a>
            }
            title="Versand"
          >
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <AmountField
                  error={errorFor(fieldName.cost)}
                  help="Pro Bestellung, inkl. MwSt. – 0 heißt: Versand immer kostenlos."
                  label="Standardversand (DHL)"
                  name={fieldName.cost}
                  onBlur={() => blurAmount("cost")}
                  onChange={(cost) => setShipping({ cost })}
                  value={values.shipping.cost}
                />

                <SwitchGroup
                  checked={values.shipping.freeEnabled}
                  description="Ab diesem Warenwert zahlen Kund:innen keinen Standardversand. Im Warenkorb zeigt ein Balken, wie viel noch fehlt."
                  label="Kostenloser Versand ab einem Bestellwert"
                  name={fieldName.freeEnabled}
                  onChange={(freeEnabled) => setShipping({ freeEnabled })}
                >
                  <AmountField
                    error={errorFor(fieldName.freeFrom)}
                    label="Kostenlos ab"
                    name={fieldName.freeFrom}
                    onBlur={() => blurAmount("freeFrom")}
                    onChange={(freeFrom) => setShipping({ freeFrom })}
                    placeholder="z. B. 49,00"
                    value={values.shipping.freeFrom}
                  />
                  {liveShipping && liveShipping.cost === 0 ? (
                    <p className="mt-2 text-[13px] text-muted">Da der Standardversand 0 € kostet, ist der Versand sowieso immer kostenlos.</p>
                  ) : null}
                </SwitchGroup>

                <SwitchGroup
                  checked={values.shipping.expressEnabled}
                  description="Kund:innen können an der Kasse schnelleren Versand (nächster Werktag) dazubuchen."
                  label="Express-Versand anbieten"
                  name={fieldName.expressEnabled}
                  onChange={(expressEnabled) => setShipping({ expressEnabled })}
                >
                  <AmountField
                    error={errorFor(fieldName.express)}
                    label="Express (DHL Express)"
                    name={fieldName.express}
                    onBlur={() => blurAmount("express")}
                    onChange={(express) => setShipping({ express })}
                    placeholder="z. B. 12,90"
                    value={values.shipping.express}
                  />
                </SwitchGroup>

                {usingDefaults ? null : (
                  <div>
                    <button
                      className={btnSecondarySm}
                      onClick={() =>
                        setShipping({
                          cost: centsToInput(defaults.cost),
                          freeEnabled: defaults.freeFrom > 0,
                          freeFrom: centsToInput(defaults.freeFrom),
                          expressEnabled: defaults.express > 0,
                          express: centsToInput(defaults.express),
                        })
                      }
                      type="button"
                    >
                      Standardwerte einsetzen ({formatPrice(defaults.cost)} · kostenlos ab {formatPriceShort(defaults.freeFrom)} · Express {formatPrice(defaults.express)})
                    </button>
                  </div>
                )}
              </div>
              <ShippingPreview shipping={liveShipping} />
            </div>
          </Card>
        </div>

        {/* ───────────── Rücksendung (Widerruf) ───────────── */}
        <div className="scroll-mt-6" id="ruecksendung">
          <Card
            actions={
              <a className="whitespace-nowrap text-[13px] text-ink/70 underline-offset-4 hover:text-ink hover:underline" href="/widerruf" rel="noopener" target="_blank">
                Widerrufsbelehrung ansehen ↗
              </a>
            }
            title="Rücksendung bei Widerruf"
          >
            <ReturnsField
              changed={values.returns.paidBy !== settings.returns.paidBy}
              error={errorFor(fieldName.returnsPaidBy)}
              onChange={(paidBy) => edit((v) => ({ ...v, returns: { paidBy } }))}
              value={values.returns.paidBy}
            />
          </Card>
        </div>

        {/* ───────────── Aktions-Hinweis ───────────── */}
        <div className="scroll-mt-6" id="hinweis">
          <Card title="Aktions-Hinweis">
            <AnnouncementField
              error={errorFor(fieldName.announcement)}
              onBlur={() => {
                const clean = cleanAnnouncement(values.announcement);
                if (clean !== values.announcement) setValues((v) => ({ ...v, announcement: clean }));
                touch(fieldName.announcement);
              }}
              onChange={(announcement) => edit((v) => ({ ...v, announcement }))}
              shipping={liveShipping}
              value={values.announcement}
            />
          </Card>
        </div>
      </div>

      {/* ── Speichern-Leiste (bleibt beim Scrollen unten sichtbar) ── */}
      <div className={`${barSticky ? "sticky bottom-3" : ""} z-20 mt-6`}>
        <div
          className={`flex flex-col gap-3 rounded-2xl border bg-white/95 p-3 shadow-[0_10px_30px_-12px_rgba(20,20,20,0.25)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:pl-5 ${dirty ? "border-ink/25" : "border-line"}`}
        >
          <p aria-live="polite" className="flex min-w-0 items-center gap-2.5 px-2 text-[14px] sm:px-0" role="status">
            <StatusDot tone={status.tone} />
            <span className={status.tone === "red" ? "text-red-700" : status.tone === "green" ? "text-emerald-800" : "text-ink/80"}>{status.text}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            {dirty ? (
              <button className={`${btnSecondary} flex-1 sm:flex-none`} disabled={pending} onClick={discard} type="button">
                Verwerfen
              </button>
            ) : null}
            <button className={`${btn} flex-1 sm:min-w-32 sm:flex-none`} disabled={pending || !dirty || !canSave} type="submit">
              {pending ? <Spinner /> : null}
              {pending ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

/* ───────────────────────── Vorschauen ───────────────────────── */

function PreviewBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside aria-label={title} className="h-fit rounded-2xl border border-line bg-paper p-4 text-[13px] leading-relaxed lg:sticky lg:top-6">
      <p className="mb-3 font-medium text-[12px] text-muted uppercase tracking-[0.1em]">{title}</p>
      {children}
    </aside>
  );
}

/** So erscheinen die Firmendaten im Impressum (fehlende Angaben gelb) */
function ImprintPreview({ company }: { company: Settings["company"] }) {
  const c = companyView(company);
  return (
    <PreviewBox title="Vorschau Impressum">
      <div className="space-y-3 text-ink/80 [&_mark]:text-[12px]">
        <p>
          <span className="font-medium text-ink">{c.name}</span>
          <br />
          {c.street}
          <br />
          {c.city}
          <br />
          {c.country}
        </p>
        <p>
          <span className="text-muted">Vertreten durch</span>
          <br />
          {c.owner}
        </p>
        <p>
          Telefon: {c.phone}
          <br />
          E-Mail: {c.email}
        </p>
        <p>
          USt-IdNr.: {c.vatId}
          <br />
          {c.register}
        </p>
        <p className="text-muted">
          {c.brand} ist eine Marke der {c.name}.
        </p>
      </div>
    </PreviewBox>
  );
}

/** So rechnet der Shop mit den eingegebenen Versandkosten */
function ShippingPreview({ shipping }: { shipping: Settings["shipping"] | null }) {
  if (!shipping) {
    return (
      <PreviewBox title="So sieht es im Shop aus">
        <p className="text-muted">Sobald alle Beträge stimmen, siehst du hier, wie der Shop rechnet.</p>
      </PreviewBox>
    );
  }
  const r = shippingRules(shipping);
  const free = freeShippingLabel(shipping);
  // Beispiel-Bestellung unter der Grenze (ca. 60 %, auf volle Euro abgerundet)
  const below = r.freeFrom ? Math.max(100, Math.floor((r.freeFrom * 0.6) / 100) * 100) : 0;
  const rows: { label: string; value: string }[] = r.alwaysFree
    ? [{ label: "Jede Bestellung", value: "kostenlos" }]
    : r.freeFrom
      ? [
          { label: `Bestellung über ${formatPriceShort(below)}`, value: `${formatPrice(r.cost)} Versand` },
          { label: `Bestellung ab ${formatPriceShort(r.freeFrom)}`, value: "kostenlos" },
        ]
      : [{ label: "Jede Bestellung", value: `${formatPrice(r.cost)} Versand` }];
  rows.push({ label: "Express an der Kasse", value: r.express ? `+ ${formatPrice(r.express)}` : "nicht angeboten" });

  return (
    <PreviewBox title="So sieht es im Shop aus">
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0" key={row.label}>
            <dt className="text-ink/70">{row.label}</dt>
            <dd className={`shrink-0 text-right font-medium tabular-nums ${row.value === "kostenlos" ? "text-emerald-700" : ""}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-muted">
        Hinweis oben im Shop: <span className="text-ink">„{free ?? "Versand in 1–3 Werktagen"}“</span>
      </p>
    </PreviewBox>
  );
}

/* ───────────────────────── Felder ───────────────────────── */

function errorClass(error?: string, missing?: boolean) {
  if (error) return "border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100";
  if (missing) return "border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-100";
  return "";
}

function FieldMessage({ id, error, help }: { id: string; error?: string; help?: string }) {
  if (error)
    return (
      <p className="mt-1.5 flex gap-1.5 text-[13px] text-red-700 leading-snug" id={id}>
        <svg aria-hidden className="mt-[3px] size-3.5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </svg>
        {error}
      </p>
    );
  return help ? (
    <p className="mt-1.5 text-[12.5px] text-muted leading-snug" id={id}>
      {help}
    </p>
  ) : null;
}

type TextFieldProps = {
  name: string;
  label: string;
  help: string;
  placeholder: string;
  value: string;
  error?: string;
  /** Pflichtangabe fürs Impressum fehlt noch → gelb */
  missing?: boolean;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  wide?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
};

function TextField({ name, label: text, help, placeholder, value, error, missing, type = "text", autoComplete, wide, onChange, onBlur }: TextFieldProps) {
  const id = fieldId(name);
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <label className={label} htmlFor={id}>
          {text}
        </label>
        {missing && !error ? (
          <span className="mb-1.5">
            <Badge tone="amber">fehlt noch</Badge>
          </span>
        ) : null}
      </div>
      <input
        aria-describedby={`${id}-msg`}
        aria-invalid={error ? true : undefined}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoComplete={autoComplete ?? "off"}
        className={`${input} placeholder:text-ink/35 ${errorClass(error, missing)}`}
        id={id}
        maxLength={160}
        name={name}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type={type}
        value={value}
      />
      <FieldMessage error={error} help={help} id={`${id}-msg`} />
    </div>
  );
}

type AmountFieldProps = {
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
};

/** Eingabefeld für Euro-Beträge (Komma als Dezimaltrennzeichen, „€“ rechts) */
function AmountField({ name, label: text, help, placeholder = "0,00", value, error, onChange, onBlur }: AmountFieldProps) {
  const id = fieldId(name);
  return (
    <div className="min-w-0">
      <label className={label} htmlFor={id}>
        {text}
      </label>
      <div className="relative w-full max-w-44">
        <input
          aria-describedby={help || error ? `${id}-msg` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={`${input} pr-8 text-right tabular-nums placeholder:text-ink/35 ${errorClass(error)}`}
          id={id}
          inputMode="decimal"
          maxLength={20}
          name={name}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          type="text"
          value={value}
        />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[14px] text-muted">
          €
        </span>
      </div>
      <FieldMessage error={error} help={help} id={`${id}-msg`} />
    </div>
  );
}

/** Schalter mit Erklärung; ist er an, erscheint darunter das zugehörige Feld */
function SwitchGroup({ name, label: text, description, checked, onChange, children }: { name: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className={`rounded-2xl border transition ${checked ? "border-ink/20 bg-white" : "border-line bg-paper/60"}`}>
      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl p-4 has-focus-visible:ring-4 has-focus-visible:ring-ink/15" htmlFor={id}>
        <span className="min-w-0">
          <span className="block font-medium text-[15px]">{text}</span>
          <span className="mt-0.5 block text-[13px] text-muted leading-snug">{description}</span>
        </span>
        {/* Rückfallwert „0“, damit der Server „aus“ sicher erkennt */}
        <input name={name} type="hidden" value="0" />
        <input checked={checked} className="peer sr-only" id={id} name={name} onChange={(e) => onChange(e.target.checked)} role="switch" type="checkbox" value="1" />
        <span
          aria-hidden
          className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink/15 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.25)] after:transition-transform after:content-[''] peer-checked:bg-ink peer-checked:after:translate-x-5"
        />
      </label>
      {/* Feld bleibt im Formular (auch wenn ausgeblendet), damit der Wert beim Wieder-Einschalten noch da ist */}
      <div className={checked ? "px-4 pb-4" : "hidden"}>{children}</div>
    </div>
  );
}

const RETURN_OPTIONS: { value: ReturnCostPayer; title: string; description: string }[] = [
  {
    value: "kunde",
    title: "Kund:innen zahlen das Porto",
    description: "Wer etwas zurückschickt, frankiert das Paket selbst. So machen es viele kleine Shops – du sparst dir die Kosten für Rücksendungen.",
  },
  {
    value: "haendler",
    title: "Ich zahle das Porto (kostenlose Rücksendung)",
    description: "Du übernimmst die Kosten, z. B. mit einem Rücksende-Etikett. Das ist besonders kundenfreundlich, kostet dich aber jede Rücksendung.",
  },
];

/** Auswahl „Wer zahlt die Rücksendung?“ – jede Möglichkeit zeigt den Satz, der dann in der Widerrufsbelehrung steht */
function ReturnsField({ value, error, changed, onChange }: { value: ReturnCostPayer | ""; error?: string; changed: boolean; onChange: (v: ReturnCostPayer) => void }) {
  const id = fieldId(fieldName.returnsPaidBy);
  return (
    <fieldset aria-describedby={`${id}-intro${error ? ` ${id}-msg` : ""}`} className="min-w-0">
      <legend className="font-medium text-[15px]">Wer zahlt die Rücksendung?</legend>
      <p className="mt-1 max-w-3xl text-[13.5px] text-muted leading-relaxed" id={`${id}-intro`}>
        Kund:innen dürfen ihre Bestellung 14 Tage lang ohne Angabe von Gründen widerrufen und zurückschicken. In der Widerrufsbelehrung muss stehen, wer dann das
        Porto für die Rücksendung bezahlt. Fehlt dieser Satz, musst du die Kosten immer selbst tragen.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {RETURN_OPTIONS.map((o, i) => {
          const checked = value === o.value;
          // Erste Möglichkeit trägt die Feld-ID, damit „Fehler anklicken → Feld fokussieren“ funktioniert
          const inputId = i === 0 ? id : `${id}-${o.value}`;
          const tone = error ? "border-red-300 bg-red-50/30" : checked ? "border-ink/40 bg-white shadow-[0_1px_2px_rgba(20,20,20,0.06)]" : "border-line bg-paper/60 hover:border-ink/25";
          return (
            <label
              className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition has-focus-visible:ring-4 has-focus-visible:ring-ink/15 ${tone}`}
              htmlFor={inputId}
              key={o.value}
            >
              <input
                aria-describedby={`${id}-${o.value}-desc ${id}-${o.value}-sentence`}
                aria-labelledby={`${id}-${o.value}-title`}
                aria-invalid={error ? true : undefined}
                checked={checked}
                className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-ink focus-visible:outline-none"
                id={inputId}
                name={fieldName.returnsPaidBy}
                onChange={() => onChange(o.value)}
                type="radio"
                value={o.value}
              />
              <span className="min-w-0">
                <span className="block font-medium text-[15px] leading-snug" id={`${id}-${o.value}-title`}>
                  {o.title}
                </span>
                <span className="mt-1 block text-[13px] text-muted leading-snug" id={`${id}-${o.value}-desc`}>
                  {o.description}
                </span>
                <span className={`mt-3 block rounded-xl px-3 py-2.5 text-[13px] leading-snug ring-1 ${checked ? "bg-paper text-ink ring-line" : "bg-white/70 text-ink/70 ring-line/70"}`} id={`${id}-${o.value}-sentence`}>
                  <span className="mb-0.5 block text-[11.5px] text-muted uppercase tracking-[0.08em]">Satz in der Widerrufsbelehrung</span>„{RETURN_COST_SENTENCE[o.value]}“
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <FieldMessage error={error} id={`${id}-msg`} />
      ) : (
        <p className="mt-3 text-[12.5px] text-muted leading-snug">
          {changed
            ? "Nach dem Speichern steht der neue Satz sofort in der Widerrufsbelehrung und auf Seite 2 des Lieferscheins. Für frühere Bestellungen gilt weiter, was beim Kauf dort stand."
            : "Der gewählte Satz steht in der Widerrufsbelehrung im Shop und auf Seite 2 jedes Lieferscheins."}
        </p>
      )}
    </fieldset>
  );
}

/** Aktions-Hinweis mit Zeichenzähler und Vorschau der schwarzen Leiste */
function AnnouncementField({ value, error, shipping, onChange, onBlur }: { value: string; error?: string; shipping: Settings["shipping"] | null; onChange: (v: string) => void; onBlur: () => void }) {
  const id = fieldId(fieldName.announcement);
  const clean = cleanAnnouncement(value);
  const length = clean.length;
  const free = shipping ? freeShippingLabel(shipping) : null;
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="min-w-0">
        <div className="flex items-end justify-between gap-3">
          <label className={label} htmlFor={id}>
            Text für die schwarze Leiste ganz oben <span className="font-normal text-muted">(optional)</span>
          </label>
          <span aria-hidden className={`mb-1.5 shrink-0 text-[12.5px] tabular-nums ${length > ANNOUNCEMENT_MAX ? "text-red-700" : length > ANNOUNCEMENT_MAX - 15 ? "text-amber-700" : "text-muted"}`}>
            {length}/{ANNOUNCEMENT_MAX}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-describedby={`${id}-msg ${id}-count`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            className={`${input} min-w-0 flex-1 placeholder:text-ink/35 ${errorClass(error)}`}
            id={id}
            maxLength={ANNOUNCEMENT_MAX}
            name={fieldName.announcement}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
            placeholder="z. B. Nur bis Sonntag: 15 % auf alle Sets"
            type="text"
            value={value}
          />
          {value ? (
            <button className={`${btnSecondary} shrink-0`} onClick={() => onChange("")} type="button">
              Hinweis entfernen
            </button>
          ) : null}
        </div>
        <span className="sr-only" id={`${id}-count`}>
          {length} von {ANNOUNCEMENT_MAX} Zeichen
        </span>
        <FieldMessage
          error={error}
          help="Für Aktionen oder wichtige Infos, z. B. „Betriebsferien: Versand ab 7. Januar“. Leer lassen = kein Hinweis. Ein Rabatt-Code muss in Stripe angelegt sein, sonst funktioniert er an der Kasse nicht."
          id={`${id}-msg`}
        />
      </div>

      <div className="min-w-0">
        <p className="mb-2 font-medium text-[12px] text-muted uppercase tracking-[0.1em]">Vorschau</p>
        <div aria-hidden className="overflow-hidden rounded-2xl ring-1 ring-line">
          <div className="flex min-h-10 items-center justify-center bg-black px-4 py-2.5 text-center text-[13px] text-white/85 leading-snug">
            {clean ? (
              <span>
                <AnnouncementText text={clean} />
              </span>
            ) : (
              <span className="min-w-0 truncate text-white/70">Händler aus Deutschland · Versand aus Deutschland · {free ?? "Versand in 1–3 Werktagen"} · …</span>
            )}
          </div>
          <div className="flex h-10 items-center gap-3 bg-paper px-4">
            <span className="h-2.5 w-20 rounded-full bg-ink/15" />
            <span className="ml-auto h-2.5 w-10 rounded-full bg-ink/10" />
            <span className="h-2.5 w-10 rounded-full bg-ink/10" />
            <span className="h-6 w-16 rounded-full bg-ink" />
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          {clean
            ? "So erscheint der Hinweis ganz oben auf jeder Shop-Seite – auf dem Handy statt des Laufbands."
            : "Ohne Hinweis zeigt die Leiste wie bisher die Vorteile deines Shops."}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── Kleinteile ───────────────────────── */

function StatusDot({ tone }: { tone: "neutral" | "amber" | "red" | "green" }) {
  const color = { neutral: "bg-ink/25", amber: "bg-amber-500", red: "bg-red-600", green: "bg-emerald-500" }[tone];
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
