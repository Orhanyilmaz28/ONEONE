import { Fragment, type ReactNode } from "react";
import { company as staticCompany } from "@/lib/company";
import { RETURN_COST_SENTENCE, type ReturnCostPayer, type Settings } from "@/lib/settings-defaults";
import type { ImportedPage } from "@/lib/types";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="t-h1">{title}</h1>
      {/* Abstand zwischen aufeinanderfolgenden Absätzen und Listen (Abschnitte mit mehreren Absätzen, z. B. Datenschutz) */}
      <div className="legal mt-8 [&_li+li]:mt-1 [&_p+p]:mt-3 [&_p+ul]:mt-2 [&_ul+p]:mt-2">{children}</div>
    </div>
  );
}

/** Rechtstext, der per Import aus dem bisherigen Shopify-Shop übernommen wurde. */
export function ImportedLegalPage({ page }: { page: ImportedPage }) {
  return (
    <LegalPage title={page.title}>
      <div
        className="prose-shop"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: beim Import bereinigter Text aus dem eigenen Shop
        dangerouslySetInnerHTML={{ __html: page.html }}
      />
    </LegalPage>
  );
}

/* ───────────────────────── Firmendaten in Rechtstexten ───────────────────────── */

type CompanyKey = keyof Settings["company"];

/** Bezeichnung im gelben Platzhalter, z. B. „[Telefonnummer fehlt]“ */
const MISSING_LABEL: Record<CompanyKey, string> = {
  name: "Firmenname",
  brand: "Markenname",
  owner: "Vertretungsberechtigte Person",
  street: "Straße und Hausnummer",
  city: "PLZ und Ort",
  country: "Land",
  email: "E-Mail-Adresse",
  phone: "Telefonnummer",
  vatId: "USt-IdNr.",
  register: "Registereintrag",
};

/** Leer oder noch ein Platzhalter wie „[Telefonnummer]“? (gleiche Regel wie missingCompanyFields) */
export function isMissing(value: string | undefined | null) {
  return !value || /^\[.*\]$/.test(value.trim());
}

/** Deutlich sichtbarer Platzhalter im Rechtstext, z. B. „[Anbieter eintragen, z. B. Brevo]“ – muss vor dem Livegang ersetzt werden */
export function Placeholder({ children }: { children: ReactNode }) {
  return <mark className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-300/70">{children}</mark>;
}

/** Deutlich sichtbarer Platzhalter für eine fehlende Angabe – füllt der Shop-Betreiber im Dashboard aus */
export function MissingValue({ label }: { label: string }) {
  return (
    <mark className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-300/70" title="Bitte im Dashboard unter „Einstellungen“ ergänzen">
      [{label} fehlt]
    </mark>
  );
}

export type CompanyView = Record<CompanyKey, ReactNode> & {
  /** Domain des Shops (fest, z. B. exstase-energy.de) */
  domain: string;
  /** Name der verantwortlichen Person, z. B. „Christopher Walich“ aus „Geschäftsführer: Christopher Walich“ */
  person: ReactNode;
};

/**
 * Firmendaten aus den Einstellungen für Rechtstexte aufbereiten:
 * vorhandene Angaben als Text, fehlende als gelber Platzhalter „[… fehlt]“.
 */
export function companyView(company: Settings["company"]): CompanyView {
  const view = {} as Record<CompanyKey, ReactNode>;
  for (const key of Object.keys(MISSING_LABEL) as CompanyKey[]) {
    const value = String(company[key] ?? "").trim();
    view[key] = isMissing(value) ? <MissingValue label={MISSING_LABEL[key]} /> : value;
  }
  const owner = String(company.owner ?? "").trim();
  // „Geschäftsführer: Christopher Walich“ → „Christopher Walich“
  const person = isMissing(owner) ? <MissingValue label="Verantwortliche Person" /> : owner.replace(/^[^:]*:\s*/, "");
  return { ...view, domain: staticCompany.domain, person };
}

/* ───────────────────────── Widerrufsbelehrung & Muster-Widerrufsformular ───────────────────────── */

/**
 * Kontaktangaben für Widerrufsbelehrung und Formular.
 * Fehlende Angaben entweder weglassen (Lieferschein) oder als gelben Platzhalter übergeben (Shop-Seite).
 */
export type WithdrawalContact = {
  /** Name, Straße, PLZ und Ort, Land */
  address: ReactNode[];
  email?: ReactNode;
  phone?: ReactNode;
};

/** Kontaktangaben aus den Einstellungen – fehlende erscheinen als gelber Platzhalter (für die Shop-Seite) */
export function withdrawalContact(c: CompanyView): WithdrawalContact {
  return { address: [c.name, c.street, c.city, c.country], email: c.email, phone: c.phone };
}

/** Teile mit „, “ verbinden (leere weglassen) */
function joinParts(parts: ReactNode[]) {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== false && p !== "")
    .map((p, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
      <Fragment key={i}>
        {i > 0 ? ", " : null}
        {p}
      </Fragment>
    ));
}

type Heading = "h2" | "h3";

/**
 * Widerrufsbelehrung für den Kauf von Waren – Wortlaut nach dem amtlichen Muster
 * (Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB). Der Satz zu den Rücksendekosten kommt aus den Einstellungen.
 */
export function WithdrawalInstructions({ contact, paidBy, heading: H = "h2" }: { contact: WithdrawalContact; paidBy: ReturnCostPayer; heading?: Heading }) {
  const reach = joinParts([
    ...contact.address,
    contact.email ? <>E-Mail: {contact.email}</> : null,
    contact.phone ? <>Telefon: {contact.phone}</> : null,
  ]);
  return (
    <>
      <H>Widerrufsrecht</H>
      <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
      <p>
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz
        genommen haben bzw. hat.
      </p>
      <p>
        Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({reach}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail)
        über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht
        vorgeschrieben ist.
      </p>
      <p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>
      <H>Folgen des Widerrufs</H>
      <p>
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der
        zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt
        haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns
        eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn,
        mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet. Wir können die
        Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben,
        je nachdem, welches der frühere Zeitpunkt ist.
      </p>
      <p>
        Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags
        unterrichten, an uns zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.{" "}
        {RETURN_COST_SENTENCE[paidBy]}
      </p>
      <p>
        Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und
        Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.
      </p>
    </>
  );
}

/**
 * Zeilen des amtlichen Formulars (Anlage 2 zu Art. 246a § 1 Abs. 2 Satz 1 Nr. 1 EGBGB) nach der Anschrift.
 * Für die Papierfassung: `inline` = Schreiblinie direkt hinter dem Text, `extra` = weitere Zeilen darunter.
 */
const FORM_LINES: { text: string; inline: boolean; extra: number }[] = [
  {
    text: "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)",
    inline: false,
    extra: 2,
  },
  { text: "Bestellt am (*)/erhalten am (*)", inline: true, extra: 0 },
  { text: "Name des/der Verbraucher(s)", inline: true, extra: 0 },
  { text: "Anschrift des/der Verbraucher(s)", inline: true, extra: 1 },
  { text: "Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)", inline: true, extra: 0 },
  { text: "Datum", inline: true, extra: 0 },
];

/** Gepunktete Schreiblinie */
function WriteLine({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block h-[6.5mm] border-ink/35 border-b border-dotted ${className}`} />;
}

/**
 * Muster-Widerrufsformular (Anlage 2 zu Art. 246a § 1 Abs. 2 Satz 1 Nr. 1 EGBGB).
 * `fillable`: mit Schreiblinien zum Ausfüllen auf Papier (Lieferschein).
 */
export function WithdrawalForm({ contact, heading: H = "h2", fillable = false }: { contact: WithdrawalContact; heading?: Heading; fillable?: boolean }) {
  const to = joinParts([...contact.address, contact.email]);
  return (
    <>
      <H>Muster-Widerrufsformular</H>
      <p>(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
      {fillable ? (
        <ul className="list-none">
          <li>— An {to}:</li>
          {FORM_LINES.map((line) => (
            <li key={line.text}>
              {line.inline ? (
                <span className="flex items-end gap-2">
                  {/* Text darf umbrechen (schmale Bildschirme); auf A4 passt er in eine Zeile */}
                  <span className="min-w-0">— {line.text}</span>
                  <WriteLine className="min-w-[25mm] flex-1" />
                </span>
              ) : (
                <>— {line.text}</>
              )}
              {Array.from({ length: line.extra }, (_, n) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: leere Schreiblinien
                <WriteLine key={n} />
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          <li>An {to}:</li>
          {FORM_LINES.map((line) => (
            <li key={line.text}>{line.text}</li>
          ))}
        </ul>
      )}
      <p>(*) Unzutreffendes streichen.</p>
    </>
  );
}
