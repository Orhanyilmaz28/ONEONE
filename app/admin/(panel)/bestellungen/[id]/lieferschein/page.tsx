import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, formatDay } from "@/components/admin/ui";
import { type WithdrawalContact, WithdrawalForm, WithdrawalInstructions } from "@/components/legal-page";
import { Logo, LogoMark } from "@/components/logo";
import { requireAdmin } from "@/lib/admin-auth";
import { company as staticCompany } from "@/lib/company";
import { getOrder, orderNumber } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "../../client-buttons";
import { productLookup, readableItems } from "../../data";
import { addressLines, carrierLabel, itemCount } from "../../shipping";

type Params = Promise<{ id: string }>;

const VALID_ID = /^cs_[A-Za-z0-9_]{4,200}$/;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: VALID_ID.test(id) ? `Lieferschein ${orderNumber(id)}` : "Lieferschein" };
}

/**
 * Druck-Stylesheet: Beim Drucken wird alles ausgeblendet, was nicht der Lieferschein ist
 * (Seitenleiste, Navigation, Knöpfe). Die Elemente drumherum verlieren Abstände und Rahmen.
 * Jedes Blatt (.ls-sheet) ist eine A4-Seite: Seite 1 Lieferschein, Seite 2 Widerrufsbelehrung + Formular.
 * Seitenrand 0 → der Browser druckt keine Kopf-/Fußzeilen (URL, Datum) mit.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #fff !important; }
  body *:not(:has(#lieferschein)):not(#lieferschein):not(#lieferschein *) { display: none !important; }
  body *:has(#lieferschein) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important;
    max-width: none !important; min-height: 0 !important; height: auto !important; border: 0 !important;
    box-shadow: none !important; background: transparent !important; overflow: visible !important;
  }
  #lieferschein { display: block !important; margin: 0 !important; padding: 0 !important; }
  #lieferschein .ls-sheet {
    width: 210mm !important; max-width: none !important; min-height: 296mm !important; margin: 0 !important;
    padding: 16mm 18mm 12mm !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
    break-after: page; page-break-after: always;
  }
  #lieferschein .ls-sheet:last-child { break-after: auto; page-break-after: auto; }
  #lieferschein .ls-sheet-dense { padding-top: 13mm !important; padding-bottom: 9mm !important; }
  #lieferschein tr, #lieferschein li { break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Blatt (A4) – auf dem Bildschirm als Karte, beim Drucken eine Seite */
const SHEET =
  "ls-sheet mx-auto flex w-full max-w-[210mm] flex-col rounded-2xl bg-white p-6 text-ink leading-relaxed shadow-[0_1px_2px_rgba(20,20,20,0.05),0_12px_40px_-12px_rgba(20,20,20,0.18)] ring-1 ring-line sm:min-h-[297mm] sm:p-[16mm]";

/** Angaben, die in der Widerrufsbelehrung stehen müssen (Name, Anschrift, Telefon, E-Mail) */
const WITHDRAWAL_FIELDS = [
  ["name", "Firmenname"],
  ["street", "Straße"],
  ["city", "PLZ und Ort"],
  ["phone", "Telefonnummer"],
  ["email", "E-Mail-Adresse"],
] as const;

/** Platzhalter wie „[Telefonnummer]“ nicht drucken */
function real(value?: string) {
  const v = value?.trim() ?? "";
  return v && !/^\[.*\]$/.test(v) ? v : "";
}

export default async function DeliveryNotePage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  if (!VALID_ID.test(id)) notFound();

  const [found, settings, products] = await Promise.all([getOrder(id), getSettings(), productLookup()]);
  if (!found) notFound();
  const order = { ...found, items: readableItems(found.items, products) };
  const c = settings.company;
  const brand = real(c.brand) || "EXSTASE Energy";
  const email = real(c.email);
  const phone = real(c.phone);
  const domain = staticCompany.domain;

  const senderLine = [real(c.name), real(c.street), real(c.city)].filter(Boolean).join(" · ");
  const recipient = order.shipping ? [order.shipping.name || order.customer.name, ...addressLines(order.shipping.address)] : [order.customer.name];
  const firstName = order.customer.name.trim().split(/\s+/)[0];
  const pieces = itemCount(order.items);
  const deliveryDate = order.meta.shippedAt ?? Date.now();
  const footer = [real(c.name), real(c.owner), real(c.register), real(c.vatId) ? `USt-IdNr. ${real(c.vatId).replace(/^USt-?IdNr\.?\s*/i, "")}` : ""].filter(Boolean);

  // Seite 2: Widerrufsbelehrung – fehlende Angaben werden nicht gedruckt, sondern oben als Hinweis gemeldet
  const withdrawalContact: WithdrawalContact = {
    address: [real(c.name), real(c.street), real(c.city), real(c.country)].filter(Boolean),
    email: email || undefined,
    phone: phone || undefined,
  };
  const withdrawalMissing = WITHDRAWAL_FIELDS.filter(([key]) => !real(c[key])).map(([, text]) => text);

  const info: [string, string][] = [
    ["Bestellnummer", order.number],
    ["Bestelldatum", formatDay(order.createdAt)],
    ["Lieferdatum", formatDay(deliveryDate)],
    ...(order.shippingMethod ? ([["Versandart", order.shippingMethod]] as [string, string][]) : []),
    ...(order.meta.tracking ? ([["Sendungsnr.", `${carrierLabel(order.meta.carrier)} ${order.meta.tracking}`]] as [string, string][]) : []),
  ];

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: festes, eigenes Druck-CSS */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            className="mb-2 inline-flex items-center gap-1.5 rounded-full text-muted text-sm transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
            href={`/admin/bestellungen/${encodeURIComponent(order.id)}`}
          >
            <span aria-hidden>←</span> Zurück zur Bestellung
          </Link>
          <h1 className="font-medium text-[28px] tracking-[-0.02em]">Lieferschein {order.number}</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
            Beide Seiten drucken und mit ins Paket legen: Seite 2 enthält die Widerrufsbelehrung mit Formular – so haben deine Kund:innen sie auch auf Papier. Im
            Druckfenster kannst du auch „Als PDF speichern“ wählen.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <PrintButton />
        </div>
      </div>

      {order.demo || withdrawalMissing.length ? (
        <div className="mb-6 flex flex-col gap-3">
          {order.demo ? (
            <Notice title="Beispieldaten" tone="blue">
              Dieser Lieferschein gehört zu einer Beispiel-Bestellung – so sieht er später für echte Bestellungen aus.
            </Notice>
          ) : null}
          {withdrawalMissing.length ? (
            <Notice title="Widerrufsbelehrung unvollständig">
              Auf Seite 2 fehlt noch: {withdrawalMissing.join(", ")}. Diese Angaben müssen in der Widerrufsbelehrung stehen. Bitte unter{" "}
              <Link className="font-medium underline underline-offset-2 hover:no-underline" href="/admin/einstellungen#firmendaten">
                Einstellungen → Firmendaten
              </Link>{" "}
              ergänzen – dann erscheinen sie hier automatisch.
            </Notice>
          ) : null}
        </div>
      ) : null}

      {/* Die Blätter (A4): Seite 1 Lieferschein, Seite 2 Widerrufsbelehrung */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex flex-col gap-4" id="lieferschein">
          <article aria-label={`Lieferschein ${order.number}`} className={`${SHEET} text-[13px]`}>
            {/* Kopf: Logo + Absender */}
            <header className="flex items-start justify-between gap-6">
              <Logo className="h-8 w-auto sm:h-9" title={brand} />
              <div className="text-right text-[11px] text-ink/70 leading-snug">
                {real(c.name) ? <p className="font-medium text-ink">{real(c.name)}</p> : null}
                {real(c.street) ? <p>{real(c.street)}</p> : null}
                {real(c.city) ? <p>{real(c.city)}</p> : null}
                {email ? <p className="mt-1.5">{email}</p> : null}
                {phone ? <p>{phone}</p> : null}
                <p>{domain}</p>
              </div>
            </header>

            {/* Anschrift + Bestelldaten */}
            <div className="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                {senderLine ? <p className="inline-block border-ink/25 border-b pb-0.5 text-[9.5px] text-ink/70">{senderLine}</p> : null}
                <address className="mt-3 text-[14px] not-italic leading-relaxed">
                  {recipient.map((line, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                    <span className="block" key={i}>
                      {line}
                    </span>
                  ))}
                </address>
              </div>
              <dl className="grid h-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[12px]">
                {info.map(([k, v]) => (
                  <div className="contents" key={k}>
                    <dt className="text-ink/70">{k}</dt>
                    <dd className="text-right font-medium tabular-nums sm:text-left">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <h2 className="mt-12 font-medium text-[26px] tracking-[-0.02em] sm:mt-16">Lieferschein</h2>
            <p className="mt-1.5 text-[13.5px] text-ink/75">
              {firstName && firstName !== "—" ? `Hallo ${firstName}, v` : "V"}ielen Dank für deine Bestellung! In diesem Paket findest du:
            </p>

            <table className="mt-6 w-full border-collapse text-left">
              <thead>
                <tr className="border-ink border-b text-[10.5px] text-ink/60 uppercase tracking-[0.08em]">
                  <th className="w-12 py-2 pr-3 font-medium" scope="col">
                    Pos.
                  </th>
                  <th className="py-2 pr-3 font-medium" scope="col">
                    Artikel
                  </th>
                  <th className="w-20 py-2 text-right font-medium" scope="col">
                    Menge
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Positionen haben keine eigene ID
                  <tr className="border-line border-b align-top" key={i}>
                    <td className="py-3 pr-3 text-ink/60 tabular-nums">{i + 1}</td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-[13.5px]">{it.name}</p>
                      {it.description ? <p className="text-[12px] text-ink/60">{it.description}</p> : null}
                    </td>
                    <td className="py-3 text-right font-medium text-[13.5px] tabular-nums">{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td className="pt-3 pr-3 text-right text-ink/60">Menge gesamt</td>
                  <td className="pt-3 text-right font-medium text-[13.5px] tabular-nums">{pieces}</td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-10 grid gap-3 text-[12px] leading-relaxed sm:grid-cols-2">
              <div className="rounded-xl bg-cream px-4 py-3.5">
                <p className="font-medium text-ink">Fragen zu deiner Bestellung?</p>
                <p className="text-ink/70">
                  {email ? `Schreib uns an ${email}` : `Melde dich über ${domain}/kontakt`} – wir helfen dir gern. Bitte gib dabei deine Bestellnummer <span className="whitespace-nowrap">{order.number}</span> an.
                </p>
              </div>
              <div className="rounded-xl bg-cream px-4 py-3.5">
                <p className="font-medium text-ink">Damit die Saugkraft lange hält</p>
                <p className="text-ink/70">Bei 40 °C waschen, ohne Weichspüler, an der Luft trocknen. Alles zu Widerruf und Rücksendung steht auf Seite 2.</p>
              </div>
            </div>

            <p className="mt-10 flex items-center gap-2 text-[14px]">
              <LogoMark className="h-4 w-auto shrink-0" />
              Danke, dass du dich für {brand} entschieden hast!
            </p>

            <SheetFooter items={footer} page="Seite 1 von 2" />
          </article>

          <p aria-hidden className="text-center text-[12px] text-muted uppercase tracking-[0.1em] print:hidden">Seite 2</p>

          {/* Seite 2: Widerrufsbelehrung + Muster-Widerrufsformular (dauerhafter Datenträger) */}
          <article aria-label="Widerrufsbelehrung und Muster-Widerrufsformular" className={`${SHEET} ls-sheet-dense text-[10.5px]`}>
            <header className="flex items-start justify-between gap-6">
              <Logo className="h-7 w-auto" title={brand} />
              <p className="text-right text-[10.5px] text-ink/60 leading-snug">
                Zu deiner Bestellung <span className="font-medium text-ink">{order.number}</span>
                <br />
                vom {formatDay(order.createdAt)}
              </p>
            </header>

            <h2 className="mt-6 font-medium text-[21px] tracking-[-0.02em]">Widerrufsbelehrung</h2>
            <div className="mt-1 text-ink/85 leading-[1.5] [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-[12px] [&_h3]:text-ink [&_p]:mt-1.5">
              <WithdrawalInstructions contact={withdrawalContact} heading="h3" paidBy={settings.returns.paidBy} />
            </div>

            {/* Zum Ausschneiden */}
            <div aria-hidden className="mt-5 flex items-center gap-2 text-[11px] text-ink/40">
              <span>✂</span>
              <span className="flex-1 border-ink/25 border-t border-dashed" />
            </div>

            <section className="mt-3 rounded-xl border border-ink/20 px-5 pt-1 pb-4 text-ink/85 leading-[1.5] [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-[12.5px] [&_h3]:text-ink [&_li]:mt-2 [&_p]:mt-1.5">
              <WithdrawalForm contact={withdrawalContact} fillable heading="h3" />
            </section>

            <SheetFooter className="pt-4" items={footer} page="Seite 2 von 2" />
          </article>
        </div>
      </div>

      <p className="mt-5 text-center text-[13px] text-muted">
        Tipp: Firmendaten und wer die Rücksendung bezahlt änderst du unter{" "}
        <Link className="text-ink underline underline-offset-4 hover:no-underline" href="/admin/einstellungen">
          Einstellungen
        </Link>
        .
      </p>
    </>
  );
}

/** Fußzeile eines Blatts: Firmenangaben + Seitenzahl */
function SheetFooter({ items, page, className = "pt-6" }: { items: string[]; page: string; className?: string }) {
  return (
    <footer className={`mt-auto ${className}`}>
      <p className="flex flex-wrap justify-center gap-x-2 border-line border-t pt-3 text-center text-[9.5px] text-ink/70">
        {items.map((f, i) => (
          <span key={f}>
            {i > 0 ? <span aria-hidden className="mr-2">·</span> : null}
            {f}
          </span>
        ))}
        <span>
          {items.length ? <span aria-hidden className="mr-2">·</span> : null}
          {page}
        </span>
      </p>
    </footer>
  );
}
