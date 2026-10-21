import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Stat, btn, btnDanger, btnSecondary, formatDateTime, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { commissionStats, getCommissions, getStatements } from "@/lib/commissions";
import { SITE_URL, formatPrice } from "@/lib/format";
import { type InfluencerStatus, getInfluencers } from "@/lib/influencers";
import { deleteInfluencerAction, renewInfluencerActivationAction, setInfluencerStatusAction } from "./actions";
import { TermsForm } from "./terms-form";

export const metadata: Metadata = { title: "Influencer" };

const TONE: Record<InfluencerStatus, "amber" | "green" | "red"> = { neu: "amber", freigegeben: "green", abgelehnt: "red" };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function InfluencerAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = first(sp.q).trim().toLowerCase().slice(0, 100);
  const status = ["neu", "freigegeben", "abgelehnt"].includes(first(sp.status)) ? first(sp.status) : "";
  const [all, commissions, statements] = await Promise.all([getInfluencers(), getCommissions(), getStatements()]);
  const list = all.filter((i) => (!status || i.status === status) && (!q || [i.name, i.alias, i.email, i.code ?? "", i.wishCode, i.city, i.platform].some((v) => v.toLowerCase().includes(q))));
  const count = (s: InfluencerStatus) => all.filter((i) => i.status === s).length;
  const total = commissionStats(commissions, statements);
  const takenCodes = new Set(all.map((i) => i.code).filter(Boolean));
  return (
    <>
      <PageHeader
        description="Bewerbungen von /influencer. Code und Konditionen festlegen, freischalten – Provisionen und Monatsgutschriften je Influencer in der Detailansicht."
        title="Influencer"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Neu" value={count("neu")} />
        <Stat label="Freigegeben" value={count("freigegeben")} />
        <Stat hint="noch nicht abgerechnet (netto)" label="Provision offen" value={formatPrice(Math.max(0, total.pendingUnbilled))} />
        <Stat hint="abgerechnet, nicht ausgezahlt" label="Auszahlung offen" value={formatPrice(total.unpaid)} />
      </div>
      <Form action="/admin/influencer" className="mb-6 flex flex-wrap items-center gap-2">
        <input aria-label="Influencer suchen" className={`${input} max-w-sm`} defaultValue={q} name="q" placeholder="Suchen: Name, Kanal, E-Mail, Code …" type="search" />
        <select aria-label="Status" className={`${input} w-auto!`} defaultValue={status} name="status">
          <option value="">Alle Status</option>
          <option value="neu">Neu</option>
          <option value="freigegeben">Freigegeben</option>
          <option value="abgelehnt">Abgelehnt</option>
        </select>
        <button className={btn} type="submit">
          Suchen
        </button>
        {q || status ? (
          <Link className={btnSecondary} href="/admin/influencer">
            Zurücksetzen
          </Link>
        ) : null}
        <span className="ml-auto text-[14px] text-muted">
          {list.length} von {all.length}
        </span>
      </Form>
      {list.length === 0 ? (
        <EmptyState title={all.length ? "Nichts gefunden" : "Noch keine Bewerbungen"}>{all.length ? "Zu dieser Suche gibt es keinen Influencer." : "Sobald sich jemand unter /influencer bewirbt, erscheint die Bewerbung hier."}</EmptyState>
      ) : (
        <div className="grid gap-4">
          {list.map((i) => {
            const mine = commissions.filter((c) => c.influencerId === i.id && c.status === "vorgemerkt");
            return (
              <Card
                actions={
                  <span className="flex items-center gap-2">
                    {i.status === "freigegeben" && !i.active ? <Badge tone="amber">Code pausiert</Badge> : null}
                    <Badge tone={TONE[i.status]}>{i.status}</Badge>
                  </span>
                }
                key={i.id}
                title={
                  <>
                    {i.alias} {i.code ? <span className="font-black text-accent-dark">· {i.code}</span> : null} <span className="font-normal text-muted">· {formatDateTime(i.createdAt)}</span>
                  </>
                }
              >
                <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
                  {(
                    [
                      ["Name", i.name],
                      ["E-Mail", i.email],
                      ["Telefon", i.phone || "–"],
                      ["Kanal", i.channelUrl],
                      ["Plattform", `${i.platform} · ${i.followers} Follower`],
                      ["Wunsch-Code", `${i.wishCode}${i.code !== i.wishCode && takenCodes.has(i.wishCode) ? " (vergeben)" : ""}`],
                      ["Adresse", `${i.street}, ${i.zip} ${i.city}`],
                      ["Steuer", `${i.smallBusiness ? "Kleinunternehmer (§ 19)" : "zzgl. 19 % USt."}${i.vatId ? ` · ${i.vatId}` : i.taxNo ? ` · St.-Nr. ${i.taxNo}` : ""}`],
                      ["Bank", i.iban ? `${i.iban} (${i.accountHolder})` : "noch nicht hinterlegt"],
                      ["Bestellungen", `${mine.length} · Umsatz netto ${formatPrice(mine.reduce((n, c) => n + c.goodsNet, 0))} · Provision ${formatPrice(mine.reduce((n, c) => n + c.amount, 0))}`],
                      ["Werbung per E-Mail", i.marketing?.granted ? `Ja – ${formatDateTime(i.marketing.at)}` : "Nein"],
                    ] as const
                  ).map(([k, v]) => (
                    <div className="flex gap-2" key={k}>
                      <dt className="w-32 shrink-0 text-muted">{k}</dt>
                      <dd className="min-w-0 break-words">
                        {k === "E-Mail" ? (
                          <a className="underline" href={`mailto:${i.email}`}>
                            {v}
                          </a>
                        ) : k === "Kanal" && /^https?:\/\//.test(v) ? (
                          <a className="underline" href={v} rel="noreferrer noopener" target="_blank">
                            {v}
                          </a>
                        ) : (
                          v
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {i.message ? <p className="mt-4 whitespace-pre-line rounded-2xl bg-ink/5 p-4 text-[14px]">{i.message}</p> : null}
                {i.status !== "abgelehnt" ? (
                  <TermsForm active={i.active} approve={i.status === "neu"} code={i.code ?? i.wishCode} commissionPct={i.commissionPct} discountPct={i.discountPct} id={i.id} />
                ) : null}
                {i.status === "freigegeben" ? (
                  <div className="mt-4 rounded-2xl border border-line p-4 text-[14px]">
                    {i.passwordHash ? (
                      <p>
                        <b>Zugang aktiv</b>
                        <span className="text-muted"> · {i.lastLoginAt ? `letzter Login ${formatDateTime(i.lastLoginAt)}` : "noch nicht angemeldet"}</span>
                      </p>
                    ) : i.activationToken && i.activationExpires && Date.parse(i.activationExpires) > Date.now() ? (
                      <>
                        <p className="font-medium">Zugangs-Link – schick ihn dem Influencer (läuft {formatDateTime(i.activationExpires)} ab):</p>
                        <input className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 font-mono text-[12px]" readOnly value={`${SITE_URL}/influencer/aktivieren?id=${i.id}&t=${i.activationToken}`} />
                      </>
                    ) : (
                      <p className="text-muted">Der Zugangs-Link ist abgelaufen oder fehlt – unten einen neuen erzeugen.</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link className={btn} href={`/admin/influencer/${i.id}`}>
                        Provisionen & Gutschriften
                      </Link>
                      <form action={renewInfluencerActivationAction.bind(null, i.id)}>
                        <button className={btnSecondary} type="submit">
                          {i.passwordHash ? "Neuen Link (Passwort zurücksetzen)" : "Neuen Link erzeugen"}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {i.status === "freigegeben" ? (
                    <form action={setInfluencerStatusAction.bind(null, i.id, "abgelehnt")}>
                      <button className={btnSecondary} type="submit">
                        Sperren
                      </button>
                    </form>
                  ) : null}
                  {i.status === "neu" ? (
                    <form action={setInfluencerStatusAction.bind(null, i.id, "abgelehnt")}>
                      <button className={btnSecondary} type="submit">
                        Ablehnen
                      </button>
                    </form>
                  ) : null}
                  {i.status === "abgelehnt" ? (
                    <form action={setInfluencerStatusAction.bind(null, i.id, "neu")}>
                      <button className={btnSecondary} type="submit">
                        Zurück auf neu
                      </button>
                    </form>
                  ) : null}
                  {mine.length === 0 ? (
                    <form action={deleteInfluencerAction.bind(null, i.id)}>
                      <button className={btnDanger} type="submit">
                        Löschen
                      </button>
                    </form>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
