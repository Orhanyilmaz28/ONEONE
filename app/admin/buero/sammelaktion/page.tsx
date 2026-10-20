import type { Metadata } from "next";
import Link from "next/link";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btn, btnSecondary, input, label } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { CHANNEL_LABEL, type OfficeOrder, officeUrl } from "@/lib/office/model";
import { loadOfficeOrder } from "@/lib/office/source";
import { ACTION_LABEL, type Check, MAX_REASON, OFFICE_STATUS_LABEL, handoverCheck, officeStatus, orderFingerprint, releaseCheck } from "@/lib/office/workflow";
import { BULK_ACTIONS, BULK_LABEL, KEY_RE, newOpId } from "@/lib/office/workflow-service";
import { MAX_BULK, readBulkResult } from "@/lib/office/workflow-store";
import { OfficeStatusBadge } from "../workflow-ui";

export const metadata: Metadata = { title: "Sammelaktion · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const BACK_RE = /^\/admin\/buero\/bestellungen(\?[A-Za-z0-9_=&%.:+-]{0,800})?$/;

function precheck(action: (typeof BULK_ACTIONS)[number], o: OfficeOrder, products: Awaited<ReturnType<typeof productLookup>>): Check & { repeat?: boolean } {
  if (action === "freigeben") return releaseCheck(o, o.office, products);
  if (action === "logistik") return { ...handoverCheck(o, o.office, products), repeat: Boolean(o.office?.handovers.length) };
  return officeStatus(o, o.office) === "neu" ? { blockers: [], warnings: [] } : { blockers: [`Nur neu eingegangene Bestellungen (aktuell „${OFFICE_STATUS_LABEL[officeStatus(o, o.office)]}“).`], warnings: [] };
}

export default async function BulkPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const me = await requireOffice("office.workflow");
  const sp = await searchParams;
  const backRaw = one(sp.zurueck);
  const back = BACK_RE.test(backRaw) ? backRaw : "/admin/buero/bestellungen";
  const fehler = one(sp.fehler).slice(0, 600);

  const resultId = one(sp.ergebnis);
  if (resultId) {
    const r = await readBulkResult(resultId, me);
    if (!r)
      return (
        <>
          <PageHeader title="Ergebnis der Sammelaktion" />
          <EmptyState action={{ href: "/admin/buero/bestellungen", label: "Zu den Bestellungen" }} title="Ergebnis nicht mehr verfügbar">
            Ergebnisse werden eine Stunde lang angezeigt. Der Stand jeder Bestellung steht in ihrem Änderungsprotokoll.
          </EmptyState>
        </>
      );
    const okCount = r.results.filter((x) => x.ok).length;
    return (
      <>
        <PageHeader description={`${ACTION_LABEL[r.action]} · ${okCount} von ${r.results.length} erfolgreich`} title="Ergebnis der Sammelaktion" />
        <Card className="mb-6" padded={false}>
          <div className="px-6 pb-1">
            <Table head={["Bestellung", "Ergebnis", "Details"]}>
              {r.results.map((x) => (
                <tr key={x.key}>
                  <td className="py-3 pr-4 align-top">
                    <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl(x)}>
                      {x.number || x.key}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 align-top">{x.ok ? <Badge tone="green">{x.duplicate ? "bereits erledigt" : "erledigt"}</Badge> : <Badge tone="red">nicht ausgeführt</Badge>}</td>
                  <td className="py-3 pr-4 align-top text-[13px]">{x.message}</td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <Link className={btnSecondary} href="/admin/buero/bestellungen">
          Zurück zu den Bestellungen
        </Link>
      </>
    );
  }

  const action = BULK_ACTIONS.find((a) => a === one(sp.aktion));
  const keys = [...new Set((Array.isArray(sp.auswahl) ? sp.auswahl : sp.auswahl ? [sp.auswahl] : []).filter((k) => KEY_RE.test(k)))];
  if (!action || !keys.length || keys.length > MAX_BULK) {
    return (
      <>
        <PageHeader title="Sammelaktion" />
        {fehler ? (
          <div className="mb-6">
            <Notice title="Nicht ausgeführt" tone="red">
              {fehler}
            </Notice>
          </div>
        ) : null}
        <EmptyState action={{ href: back, label: "Zurück zur Liste" }} title={keys.length > MAX_BULK ? `Höchstens ${MAX_BULK} Bestellungen auf einmal` : "Keine Bestellung ausgewählt"}>
          Bitte in der Liste „Alle Bestellungen“ Bestellungen ankreuzen und eine Aktion wählen.
        </EmptyState>
      </>
    );
  }

  const products = await productLookup();
  const rows: { key: string; o: OfficeOrder | null; error?: string; check: Check & { repeat?: boolean } }[] = [];
  for (const key of keys) {
    const { order, error } = await loadOfficeOrder(key, products);
    if (!order) rows.push({ key, o: null, error: error ?? "Bestellung nicht gefunden.", check: { blockers: [error ?? "Bestellung nicht gefunden."], warnings: [] } });
    else rows.push({ key, o: order, check: precheck(action, order, products) });
  }
  const ok = rows.filter((r) => r.o && !r.check.blockers.length);
  const anyWarnings = ok.some((r) => r.check.warnings.length);
  const anyRepeat = ok.some((r) => r.check.repeat);

  return (
    <>
      <p className="mb-3 text-sm">
        <Link className="text-muted hover:text-ink" href={back}>
          ← Zurück zur Liste
        </Link>
      </p>
      <PageHeader description={`${rows.length} ausgewählt · ${ok.length} können ausgeführt werden · ${rows.length - ok.length} mit Problemen`} title={`Sammelaktion: ${BULK_LABEL[action]}`} />
      {fehler ? (
        <div className="mb-6">
          <Notice title="Nicht ausgeführt" tone="red">
            {fehler}
          </Notice>
        </div>
      ) : null}
      {action === "logistik" ? <p className="mb-4 rounded-2xl bg-violet-50 px-4 py-3 text-[14px] text-violet-900">Die Weitergabe wurde außerhalb des Shops durchgeführt und soll jetzt dokumentiert werden. Der Shop überträgt nichts an die Logistik.</p> : null}
      <Card className="mb-6" padded={false}>
        <div className="px-6 pb-1">
          <Table head={["Bestellung", "Kunde", "Bürostatus", "Prüfung"]}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-3 pr-4 align-top">
                  {r.o ? (
                    <Link className="font-medium tabular-nums underline-offset-4 hover:underline" href={officeUrl(r.o)}>
                      {r.o.number}
                    </Link>
                  ) : (
                    r.key
                  )}
                  {r.o ? <span className="block text-[12px] text-muted">{CHANNEL_LABEL[r.o.channel]}</span> : null}
                </td>
                <td className="py-3 pr-4 align-top">{r.o ? r.o.company || r.o.customerName || "—" : "—"}</td>
                <td className="py-3 pr-4 align-top">{r.o ? <OfficeStatusBadge o={r.o} /> : "—"}</td>
                <td className="py-3 pr-4 align-top text-[13px]">
                  {r.check.blockers.length ? (
                    <>
                      <Badge tone="red">wird übersprungen</Badge>
                      <ul className="mt-1 list-disc pl-5">
                        {r.check.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      <Badge tone="green">bereit</Badge>
                      {r.check.warnings.length ? (
                        <ul className="mt-1 list-disc pl-5 text-amber-800">
                          {r.check.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
      {ok.length ? (
        <form action="/api/admin/buero/workflow" className="space-y-3" method="post">
          <input name="sammel" type="hidden" value="1" />
          <input name="aktion" type="hidden" value={action} />
          <input name="vorgang" type="hidden" value={newOpId()} />
          <input name="zurueck" type="hidden" value="/admin/buero/bestellungen" />
          <input name="bestaetigt" type="hidden" value="1" />
          {ok.map((r) => (
            <input key={r.key} name="eintrag" type="hidden" value={`${r.key}|${r.o?.office?.rev ?? 0}|${r.o ? orderFingerprint(r.o, products) : ""}`} />
          ))}
          {action !== "pruefen" ? (
            <div className="max-w-xl">
              <label className={label} htmlFor="b-bemerkung">
                Bemerkung (optional, gilt für alle)
              </label>
              <textarea className={`${input} min-h-16`} id="b-bemerkung" maxLength={MAX_REASON} name="bemerkung" />
            </div>
          ) : null}
          {anyRepeat ? (
            <div className="max-w-xl">
              <label className={label} htmlFor="b-grund">
                Begründung für erneute Weitergaben (Pflicht)
              </label>
              <textarea className={`${input} min-h-16`} id="b-grund" maxLength={MAX_REASON} minLength={3} name="grund" required />
            </div>
          ) : null}
          {anyWarnings ? (
            <label className="flex items-start gap-2.5 text-[14px]">
              <input className="mt-1" name="hinweise" required type="checkbox" value="1" />
              <span>Ich habe die Hinweise oben gelesen.</span>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link className={btnSecondary} href={back}>
              Abbrechen
            </Link>
            <button className={btn} type="submit">
              {action === "freigeben" ? `Verbindlich freigeben (${ok.length})` : action === "logistik" ? `Weitergabe dokumentieren (${ok.length})` : `In Prüfung nehmen (${ok.length})`}
            </button>
          </div>
          <p className="text-[12px] text-muted">Jede Bestellung wird beim Ausführen noch einmal einzeln geprüft. Hat sich eine inzwischen geändert, wird nur sie übersprungen – das Ergebnis zeigt es genau.</p>
        </form>
      ) : (
        <Notice title="Keine Bestellung kann ausgeführt werden" tone="red">
          Bitte die Probleme in den einzelnen Bestellungen klären.
        </Notice>
      )}
    </>
  );
}
