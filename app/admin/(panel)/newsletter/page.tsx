import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Stat, btn, formatDay, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { mailReady } from "@/lib/mail";
import { getSubscribers, statusKey } from "@/lib/newsletter-store";
import { SubscriberList } from "./subscriber-list";

export const metadata: Metadata = { title: "Newsletter" };

const BASE = "/admin/newsletter";
/** So viele Zeilen höchstens anzeigen – alle Adressen stehen im CSV-Export */
const SHOW = 500;
const DAY_MS = 86_400_000;

/** „heute“, „gestern“ oder „vor 5 Tagen“ (nach Kalendertagen in Berlin) */
function relativeDay(now: number, iso: string) {
  const day = (ms: number) => Math.floor((ms + berlinOffset(ms)) / DAY_MS);
  const diff = day(now) - day(Date.parse(iso));
  return diff <= 0 ? "heute" : diff === 1 ? "gestern" : `vor ${diff} Tagen`;
}

function berlinOffset(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(ms)
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(ms / 60_000) * 60_000;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewsletterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : (sp.q ?? "")).trim().toLowerCase().slice(0, 100);

  const all = await getSubscribers();
  const now = Date.now();
  const recent = all.filter((s) => now - Date.parse(s.createdAt) <= 30 * DAY_MS).length;
  const week = all.filter((s) => now - Date.parse(s.createdAt) <= 7 * DAY_MS).length;
  const filtered = q ? all.filter((s) => s.email.includes(q)) : all;
  const shown = filtered.slice(0, SHOW).map((s) => ({ email: s.email, createdAt: s.createdAt, status: statusKey(s) }));
  const doi = mailReady();
  const confirmed = all.filter((s) => s.status === "confirmed").length;
  const pendingCount = all.filter((s) => s.status === "pending").length;

  return (
    <>
      <PageHeader
        actions={
          all.length ? (
            <a className={btn} download href={`${BASE}/export`}>
              <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" />
              </svg>
              Als CSV exportieren
            </a>
          ) : null
        }
        description="Alle, die sich im Shop für den Newsletter eingetragen haben. Den Versand machst du mit einem Newsletter-Tool – der Export hilft dir dabei."
        title="Newsletter"
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {doi ? (
          <Stat
            hint={pendingCount ? `${pendingCount} warten noch auf Bestätigung` : `${all.length.toLocaleString("de-DE")} Adressen insgesamt`}
            label="Bestätigt (dürfen Newsletter bekommen)"
            value={confirmed.toLocaleString("de-DE")}
          />
        ) : (
          <Stat hint={all.length ? `seit ${formatDay(all[all.length - 1].createdAt)}` : "Noch niemand angemeldet"} label="Angemeldet insgesamt" value={all.length.toLocaleString("de-DE")} />
        )}
        <Stat hint={week ? `davon ${week} in den letzten 7 Tagen` : "in den letzten 7 Tagen niemand"} label="Neu in 30 Tagen" value={recent.toLocaleString("de-DE")} />
        <Stat hint={all.length ? relativeDay(now, all[0].createdAt) : "–"} label="Letzte Anmeldung" value={all.length ? formatDay(all[0].createdAt) : "–"} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {all.length ? (
            <>
              <Form action={BASE} className="mb-5 flex w-full gap-2 sm:max-w-md" role="search" scroll={false}>
                <div className="relative min-w-0 flex-1">
                  <svg aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <label className="sr-only" htmlFor="newsletter-search">
                    E-Mail-Adresse suchen
                  </label>
                  <input className={`${input} pl-10`} defaultValue={q} id="newsletter-search" name="q" placeholder="E-Mail-Adresse suchen" type="search" />
                </div>
                <button className={`${btn} shrink-0`} type="submit">
                  Suchen
                </button>
              </Form>

              {q ? (
                <p className="mb-4 text-muted text-sm" role="status">
                  {filtered.length === 1 ? "1 Treffer" : `${filtered.length.toLocaleString("de-DE")} Treffer`} für „<span className="text-ink">{q}</span>“ ·{" "}
                  <Link className="text-ink underline underline-offset-4 hover:no-underline" href={BASE} scroll={false}>
                    Suche löschen
                  </Link>
                </p>
              ) : null}
            </>
          ) : null}

          {/* Liste bleibt auch leer stehen, damit die Lösch-Meldung nicht verschwindet; key: nach neuer Suche frisch starten */}
          <SubscriberList
            empty={
              all.length ? (
                <EmptyState action={{ href: BASE, label: "Alle Adressen zeigen" }} title="Keine passende Adresse">
                  Versuch es mit einem anderen Teil der E-Mail-Adresse, z. B. dem Namen vor dem @.
                </EmptyState>
              ) : (
                <EmptyState title="Noch keine Anmeldungen">
                  Sobald sich jemand im Shop für den Newsletter einträgt (Startseite oder Fußzeile), erscheint die Adresse hier – ganz automatisch.
                </EmptyState>
              )
            }
            key={q}
            subscribers={shown}
          />

          {filtered.length > SHOW ? (
            <p className="mt-4 text-[13px] text-muted">
              Es werden die neuesten {SHOW.toLocaleString("de-DE")} von {filtered.length.toLocaleString("de-DE")} Adressen angezeigt. Im CSV-Export sind alle enthalten.
            </p>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8">
          {doi ? (
            <Card title="Double-Opt-In ist aktiv ✓">
              <div className="space-y-3 text-[14px] text-ink/80 leading-relaxed">
                <p>
                  Wer sich anmeldet, bekommt automatisch eine <b className="font-medium">Bestätigungs-E-Mail</b>. Erst nach dem Klick auf den Link steht die Adresse auf{" "}
                  <b className="font-medium">„Bestätigt“</b> – nur an diese Adressen darfst du Newsletter schicken.
                </p>
                <p>
                  {process.env.BREVO_LIST_ID
                    ? "Bestätigte Adressen kommen automatisch in deine Brevo-Liste. Dort schreibst und verschickst du den Newsletter."
                    : "Tipp: Trag in Vercel BREVO_LIST_ID ein (die Nummer deiner Brevo-Liste) – dann landen bestätigte Adressen automatisch in Brevo."}
                </p>
                <p className="text-[13px] text-muted">Unbestätigte Anmeldungen werden nach 7 Tagen automatisch gelöscht. Ältere Adressen ohne Bestätigung bitte nur nach eigener Bestätigung anschreiben.</p>
              </div>
            </Card>
          ) : null}
          <Card title="Wichtig: Double-Opt-In (DSGVO)">
            <div className="space-y-3 text-[14px] text-ink/80 leading-relaxed">
              <p>
                Der Shop <b className="font-medium">sammelt die Adressen nur</b> – er verschickt selbst keine Newsletter.
              </p>
              <p>
                Werbe-E-Mails darfst du nur an Personen schicken, die ihre Anmeldung per Klick in einer Bestätigungs-E-Mail bestätigt haben (<i>Double-Opt-In</i>).
                Bestätigung, Versand und Abmelde-Link übernimmt ein Newsletter-Tool.
              </p>
              <p>
                Wir empfehlen{" "}
                <a className="font-medium text-ink underline underline-offset-4 hover:no-underline" href="https://www.brevo.com/de/" rel="noreferrer" target="_blank">
                  Brevo ↗
                </a>
                : Anbieter aus der EU, deutsche Oberfläche, kostenloser Einstieg.
              </p>
            </div>
          </Card>
          <Card title="So kommen die Adressen zu Brevo">
            <ol className="space-y-3 text-[14px] text-ink/80 leading-relaxed">
              {[
                <>
                  Oben auf <b className="font-medium">„Als CSV exportieren“</b> klicken. Die Datei landet in deinem Download-Ordner (öffnet sich auch in Excel).
                </>,
                <>
                  In Brevo: <b className="font-medium">Kontakte → Kontakte importieren → Datei importieren</b> und die Datei hochladen. Die Spalte „EMAIL“ erkennt Brevo automatisch.
                </>,
                <>Den neuen Kontakten zuerst die Bestätigungs-E-Mail (Double-Opt-In) schicken. Erst wer bestätigt hat, bekommt Werbung.</>,
                <>Du kannst die Datei jedes Mal komplett importieren – doppelte Adressen erkennt Brevo selbst.</>,
              ].map((step, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                <li className="flex gap-3" key={i}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent font-medium text-[12px] text-white tabular-nums">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-line border-t pt-4 text-[13px] text-muted leading-relaxed">
              Möchte jemand gelöscht werden? Lösche die Adresse hier <i>und</i> in Brevo. Nenne Brevo außerdem in deiner Datenschutzerklärung.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
