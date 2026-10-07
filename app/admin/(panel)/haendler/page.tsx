import type { Metadata } from "next";
import Link from "next/link";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { Badge, Card, EmptyState, PageHeader, Stat, btnDanger, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { type DealerStatus, getDealers } from "@/lib/dealer-store";
import { SITE_URL } from "@/lib/format";
import { deleteDealerAction, renewActivationAction, setDealerStatusAction } from "./actions";

export const metadata: Metadata = { title: "Händler" };

const TONE: Record<DealerStatus, "amber" | "green" | "red"> = { neu: "amber", freigegeben: "green", abgelehnt: "red" };

export default async function HaendlerAdminPage() {
  await requireAdmin();
  const dealers = await getDealers();
  const count = (s: DealerStatus) => dealers.filter((d) => d.status === s).length;
  return (
    <>
      <PageHeader description="Anfragen von /haendler. Prüfe die Angaben, melde dich bei den Interessierten und setze den Status." title="Händler" />
      <DealerTabs active="/admin/haendler" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Neu" value={count("neu")} />
        <Stat label="Freigegeben" value={count("freigegeben")} />
        <Stat label="Abgelehnt" value={count("abgelehnt")} />
      </div>
      {dealers.length === 0 ? (
        <EmptyState title="Noch keine Anfragen">Sobald sich jemand unter /haendler registriert, erscheint die Anfrage hier.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {dealers.map((d) => (
            <Card
              actions={<Badge tone={TONE[d.status]}>{d.status}</Badge>}
              key={d.id}
              title={
                <>
                  {d.company} <span className="font-normal text-muted">· {formatDateTime(d.createdAt)}</span>
                </>
              }
            >
              <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
                {(
                  [
                    ["Ansprechperson", d.contact],
                    ["E-Mail", d.email],
                    ["Telefon", d.phone || "–"],
                    ["Adresse", `${d.street}, ${d.zip} ${d.city}`],
                    ["USt-IdNr.", d.vatId || "–"],
                    ["Branche", d.branch],
                    ["Geplante Menge", d.volume],
                  ] as const
                ).map(([k, v]) => (
                  <div className="flex gap-2" key={k}>
                    <dt className="w-32 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 break-words">{k === "E-Mail" ? <a className="underline" href={`mailto:${d.email}`}>{v}</a> : v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px]">
                {d.proof ? (
                  <a className={btnSecondary} href={`/admin/haendler/nachweis/${d.id}`} rel="noreferrer" target="_blank">
                    Gewerbenachweis ansehen ({d.proof.name})
                  </a>
                ) : (
                  <span className="text-muted">Kein Gewerbenachweis hinterlegt</span>
                )}
              </div>
              {d.status === "freigegeben" ? (
                <div className="mt-4 rounded-2xl border border-line p-4 text-[14px]">
                  {d.passwordHash ? (
                    <p>
                      <b>Zugang aktiv</b>
                      {d.lastLoginAt ? <span className="text-muted"> · letzter Login {formatDateTime(d.lastLoginAt)}</span> : <span className="text-muted"> · noch nicht angemeldet</span>}
                    </p>
                  ) : d.activationToken && d.activationExpires && Date.parse(d.activationExpires) > Date.now() ? (
                    <>
                      <p className="font-medium">Zugangs-Link – schick ihn dem Händler (läuft {formatDateTime(d.activationExpires)} ab):</p>
                      <input className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 font-mono text-[12px]" readOnly value={`${SITE_URL}/haendler/aktivieren?id=${d.id}&t=${d.activationToken}`} />
                    </>
                  ) : (
                    <p className="text-muted">Der Zugangs-Link ist abgelaufen oder fehlt – unten einen neuen erzeugen.</p>
                  )}
                  <Link className={`${btnSecondary} mt-3`} href={`/admin/haendler/${d.id}/preise`}>
                    Preise &amp; Stufe
                  </Link>
                  <form action={renewActivationAction.bind(null, d.id)} className="mt-3">
                    <button className={btnSecondary} type="submit">
                      {d.passwordHash ? "Neuen Link erzeugen (Passwort zurücksetzen)" : "Neuen Link erzeugen"}
                    </button>
                  </form>
                </div>
              ) : null}
              {d.message ? <p className="mt-4 whitespace-pre-line rounded-2xl bg-ink/5 p-4 text-[14px]">{d.message}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                {(["freigegeben", "abgelehnt", "neu"] as const)
                  .filter((s) => s !== d.status)
                  .map((s) => (
                    <form action={setDealerStatusAction.bind(null, d.id, s)} key={s}>
                      <button className={btnSecondary} type="submit">
                        {s === "freigegeben" ? "Freigeben" : s === "abgelehnt" ? "Ablehnen" : "Zurück auf neu"}
                      </button>
                    </form>
                  ))}
                <form action={deleteDealerAction.bind(null, d.id)}>
                  <button className={btnDanger} type="submit">
                    Löschen
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
