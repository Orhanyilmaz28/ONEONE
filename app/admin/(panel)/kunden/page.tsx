import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, Table, btn, btnDanger, btnSecondary, formatDay } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getAccountsConfig, getCustomers } from "@/lib/customers";
import { storeKind } from "@/lib/store";
import { removeCustomer, setAccountsEnabled, unlockCustomer } from "./actions";

export const metadata: Metadata = { title: "Kunden" };

const DAY = 86_400_000;

export default async function CustomersPage() {
  await requireAdmin();
  const [config, all] = await Promise.all([getAccountsConfig(), getCustomers()]);
  const customers = Object.values(all).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = Date.now();
  const last30 = customers.filter((c) => now - Date.parse(c.createdAt) <= 30 * DAY).length;
  const active30 = customers.filter((c) => c.lastLoginAt && now - Date.parse(c.lastLoginAt) <= 30 * DAY).length;

  const checks = [
    { ok: storeKind() !== "none", title: "Datenspeicher verbunden", text: "Konten werden in Upstash gespeichert – wie Bewertungen und Newsletter." },
    {
      ok: Boolean(process.env.SESSION_SECRET),
      title: "Eigener Sitzungs-Schlüssel (empfohlen)",
      text: "In Vercel die Variable SESSION_SECRET mit einer langen Zufallszeichenfolge anlegen. Ohne sie werden beim Ändern des Admin-Passworts alle Kund:innen abgemeldet.",
    },
    {
      ok: false,
      manual: true,
      title: "Datenschutzerklärung prüfen lassen",
      text: "Sobald Kundenkonten an sind, erscheint dort automatisch der Abschnitt „Kundenkonto“. Bitte mit den übrigen Rechtstexten prüfen lassen.",
    },
    {
      ok: false,
      manual: true,
      title: "„Passwort vergessen“ läuft per E-Mail an dich",
      text: "Es gibt noch keinen automatischen E-Mail-Versand. Wer sein Passwort vergisst, schreibt dir – du hilfst mit „Sperre aufheben“ oder löschst das Konto, damit es neu angelegt werden kann.",
    },
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <Link className={btnSecondary} href="/konto/registrieren" target="_blank">
              Registrierung ansehen ↗
            </Link>
            <Link className={btnSecondary} href="/konto" target="_blank">
              Kundenbereich ansehen ↗
            </Link>
          </>
        }
        description="Kund:innen können sich registrieren, ihre Bestellungen ansehen und ihre Lieferadresse speichern. Bestellen ohne Konto bleibt immer möglich."
        title="Kunden"
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Kundenkonten im Shop">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {config.enabled ? <Badge tone="green">Eingeschaltet</Badge> : <Badge>Ausgeschaltet (vorbereitet)</Badge>}
              </div>
              <p className="mt-2 max-w-xl text-[14px] text-ink/80 leading-relaxed">
                {config.enabled
                  ? `Seit ${formatDay(config.enabledAt ?? new Date().toISOString())} sehen Kund:innen oben im Shop das Konto-Symbol und können sich registrieren.`
                  : "Im Shop ist davon noch nichts zu sehen. Du kannst den Kundenbereich aber schon ausprobieren – über die Knöpfe oben (nur du siehst ihn, solange du hier angemeldet bist)."}
              </p>
            </div>
            <form action={setAccountsEnabled}>
              <input name="enabled" type="hidden" value={config.enabled ? "0" : "1"} />
              <button className={config.enabled ? btnSecondary : btn} type="submit">
                {config.enabled ? "Ausschalten" : "Kundenkonten einschalten"}
              </button>
            </form>
          </div>
          {config.enabled ? (
            <p className="mt-4 text-[13px] text-muted">Ausschalten versteckt den Bereich wieder. Bestehende Konten bleiben gespeichert.</p>
          ) : null}
        </Card>

        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <Stat label="Konten" value={customers.length} />
          <Stat label="Neu (30 Tage)" value={last30} />
          <Stat label="Aktiv (30 Tage)" value={active30} />
        </div>
      </div>

      <Card className="mb-6" title="Bevor du einschaltest">
        <ul className="space-y-4">
          {checks.map((c) => (
            <li className="flex gap-3" key={c.title}>
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] ${c.ok ? "bg-emerald-100 text-emerald-700" : c.manual ? "bg-ink/5 text-ink/60" : "bg-amber-100 text-amber-800"}`}
              >
                {c.ok ? "✓" : c.manual ? "i" : "!"}
              </span>
              <div>
                <p className="font-medium text-[15px]">
                  {c.title}
                  <span className="sr-only">{c.ok ? " – erledigt" : c.manual ? " – zur Info" : " – offen"}</span>
                </p>
                <p className="mt-0.5 text-[14px] text-muted leading-relaxed">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {customers.length === 0 ? (
        <EmptyState title="Noch keine Kundenkonten">
          {config.enabled ? "Sobald sich jemand registriert, erscheint das Konto hier." : "Zum Ausprobieren kannst du über „Registrierung ansehen“ ein Testkonto anlegen und es danach hier wieder löschen."}
        </EmptyState>
      ) : (
        <Card padded={false} title={`Alle Konten (${customers.length})`}>
          <div className="px-6 pb-1">
            <Table head={["Name", "E-Mail", "Registriert", "Zuletzt angemeldet", <span className="sr-only" key="a">Aktionen</span>]}>
              {customers.map((c) => {
                const locked = c.lockedUntil && Date.parse(c.lockedUntil) > now;
                return (
                  <tr className="border-line border-b last:border-0" key={c.id}>
                    <td className="py-3 pr-4 align-middle font-medium">
                      {c.name} {locked ? <Badge tone="red">gesperrt</Badge> : null}
                    </td>
                    <td className="py-3 pr-4 align-middle">
                      <a className="underline-offset-4 hover:underline" href={`mailto:${encodeURIComponent(c.email).replace(/%40/g, "@")}`}>
                        {c.email}
                      </a>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 align-middle text-ink/80">{formatDay(c.createdAt)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 align-middle text-ink/80">{c.lastLoginAt ? formatDay(c.lastLoginAt) : "–"}</td>
                    <td className="py-3 text-right align-middle">
                      <div className="flex justify-end gap-2">
                        {locked ? (
                          <form action={unlockCustomer}>
                            <input name="id" type="hidden" value={c.id} />
                            <button className={btnSecondary.replace("px-5 py-2.5", "px-3.5 py-1.5")} type="submit">
                              Sperre aufheben
                            </button>
                          </form>
                        ) : null}
                        <details className="relative">
                          <summary className={`${btnDanger.replace("px-4 py-2", "px-3.5 py-1.5")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Löschen</summary>
                          <form action={removeCustomer} className="absolute right-0 z-10 mt-2 w-64 rounded-2xl border border-line bg-card p-4 text-left shadow-lg">
                            <input name="id" type="hidden" value={c.id} />
                            <p className="text-[13px] text-ink/80">Konto von {c.name} endgültig löschen? Bestellungen bei Stripe bleiben erhalten.</p>
                            <button className="mt-3 w-full rounded-full bg-red-700 px-4 py-2 font-medium text-sm text-white hover:bg-red-800" type="submit">
                              Ja, löschen
                            </button>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </Card>
      )}

      {!config.enabled && customers.length > 0 ? (
        <div className="mt-6">
          <Notice title="Hinweis" tone="blue">
            Die Konten oben sind wahrscheinlich Testkonten aus der Vorschau. Lösche sie am besten, bevor du Kundenkonten einschaltest.
          </Notice>
        </div>
      ) : null}
    </>
  );
}
