import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { ACTIVITY_KINDS, ACTIVITY_LABEL, type Activity, type ActivityKind, filterActivities, listActivities } from "@/lib/office/activity";
import { resolveRange } from "@/lib/office/time";
import { FormButtons, RangeFields, type SearchParams, paramsOf } from "../shared";

export const metadata: Metadata = { title: "Exporthistorie · Büro" };
export const dynamic = "force-dynamic";

const BASE = "/admin/buero/exporthistorie";
const PER_PAGE = 100;
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const MODE: Record<string, string> = { vorschau: "Vorschau", druck: "Druck", download: "Download", archiv: "Archivkopie" };
const modeLabel = (a: Activity) => (a.kind === "excel" ? `Excel (${a.mode || "?"})` : (MODE[a.mode] ?? a.mode));

function Detail({ a }: { a: Activity }) {
  const rows: [string, React.ReactNode][] = [
    ["Export-ID", <span className="font-mono text-[13px]" key="id">{a.id}</span>],
    ["Zeitpunkt", formatDateTime(a.at)],
    ["Benutzer", a.by || "unbekannt"],
    ["Vorgangsart", ACTIVITY_LABEL[a.kind]],
    ["Exporttyp / Modus", modeLabel(a)],
    ["Zeitraum", a.range || a.preset || (a.legacy ? "—" : "Einzelauswahl")],
    ["Filter", a.filters || "keine"],
    ["Anzahl Bestellungen", a.orders],
    ["Positionen", a.legacy ? "nicht erfasst" : a.positions],
    ["Ergebnis", a.result === "ok" ? "Erfolgreich" : `Fehler: ${a.error ?? ""}`],
  ];
  return (
    <Card className="mb-6" title={`Vorgang ${a.id}`}>
      {a.legacy ? (
        <div className="mb-4">
          <Notice title="Eingeschränkte historische Informationen" tone="blue">
            Dieser Vorgang stammt aus der Zeit vor Phase 3C. Damals wurden nur Benutzer, Art, Zeitraum-Kürzel und Anzahl im Sicherheitsprotokoll vermerkt – keine Bestellnummern und keine Positionen.
          </Notice>
        </div>
      ) : null}
      <dl className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[max-content_1fr]">
        {rows.map(([k, v]) => (
          <div className="contents" key={k}>
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {a.notes?.length ? (
          <>
            <dt className="text-muted">Lieferscheinnummern</dt>
            <dd className="tabular-nums">{a.notes.join(", ")}</dd>
          </>
        ) : null}
        {a.warnings?.length ? (
          <>
            <dt className="text-muted">Hinweise</dt>
            <dd>{a.warnings.join(" · ")}</dd>
          </>
        ) : null}
        <dt className="text-muted">Bestellungen</dt>
        <dd className="text-[13px] tabular-nums">{a.refs.length ? `${a.refs.join(", ")}${a.refsTruncated ? " … (gekürzt)" : ""}` : a.legacy ? "nicht erfasst" : "—"}</dd>
      </dl>
      <p className="mt-4 text-[12px] text-muted">Aus Datenschutzgründen werden keine Namen, Adressen, E-Mail-Adressen oder Suchtexte gespeichert.</p>
    </Card>
  );
}

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOffice("office.history");
  const p = await paramsOf(searchParams);
  const now = Date.now();
  const preset = p.zeitraum || "woche";
  const r = resolveRange({ preset, day: p.tag, week: p.kw, month: p.monat, year: p.jahr, from: p.von, to: p.bis }, now);
  let list: Activity[] | null = null;
  if (r.ok) {
    try {
      list = await listActivities(r.range.from, r.range.to);
    } catch {
      list = null;
    }
  }
  const kind = (ACTIVITY_KINDS as readonly string[]).includes(p.art) ? (p.art as ActivityKind) : "";
  const result = p.ergebnis === "ok" || p.ergebnis === "fehler" ? p.ergebnis : "";
  const users = [...new Set((list ?? []).map((a) => a.by).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  const filtered = list ? filterActivities(list, { user: users.includes(p.benutzer) ? p.benutzer : "", kind, result, order: (p.bestellung ?? "").slice(0, 40) }) : [];
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(p.seite) || 1));
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const detail = p.id ? (list ?? []).find((a) => a.id === p.id) : undefined;
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const k of ["zeitraum", "tag", "kw", "monat", "jahr", "von", "bis", "benutzer", "art", "ergebnis", "bestellung"]) if (p[k]) u.set(k, p[k]);
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    return u.toString();
  };

  return (
    <>
      <PageHeader description="Wer hat wann welche Excel-Exporte und PDF-Dokumente erstellt – auch fehlgeschlagene Versuche. Ohne Kundendaten." title="Exporthistorie" />
      {detail ? <Detail a={detail} /> : p.id ? <Notice title="Vorgang nicht gefunden">Der Vorgang liegt nicht im gewählten Zeitraum.</Notice> : null}

      <Card className="mb-6">
        <form action={BASE} className="space-y-4" method="get">
          <RangeFields defaultPreset="woche" p={{ ...p, zeitraum: preset }} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={label} htmlFor="h-benutzer">
                Benutzer
              </label>
              <select className={`${input} pr-8`} defaultValue={p.benutzer} id="h-benutzer" name="benutzer">
                <option value="">Alle</option>
                {users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="h-art">
                Vorgangsart
              </label>
              <select className={`${input} pr-8`} defaultValue={kind} id="h-art" name="art">
                <option value="">Alle</option>
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="h-ergebnis">
                Ergebnis
              </label>
              <select className={`${input} pr-8`} defaultValue={result} id="h-ergebnis" name="ergebnis">
                <option value="">Erfolg und Fehler</option>
                <option value="ok">Nur erfolgreiche</option>
                <option value="fehler">Nur Fehler</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="h-bestellung">
                Bestell- oder Lieferscheinnummer
              </label>
              <input className={input} defaultValue={p.bestellung} id="h-bestellung" maxLength={40} name="bestellung" placeholder="z. B. H-2026-0007" type="search" />
            </div>
          </div>
          <FormButtons reset={BASE} submit="Anzeigen" />
        </form>
      </Card>

      {!r.ok ? (
        <Notice title="Zeitraum ungültig" tone="red">
          {r.error}
        </Notice>
      ) : list === null ? (
        <Notice title="Historie gerade nicht lesbar" tone="red">
          Der Datenspeicher ist nicht erreichbar. Bitte später erneut versuchen.
        </Notice>
      ) : filtered.length === 0 ? (
        <EmptyState title="Keine Vorgänge">Im gewählten Zeitraum und mit diesen Filtern gibt es keine Exporte oder Dokumente.</EmptyState>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-muted" role="status">
            <b className="font-medium text-ink">{filtered.length}</b> Vorgänge · {r.range.label}
            {filtered.some((a) => a.legacy) ? " · ältere Einträge mit eingeschränkten historischen Informationen" : ""}
          </p>
          <Card padded={false}>
            <div className="overflow-x-auto px-6 pb-1">
              <Table head={["Datum", "Uhrzeit", "Mitarbeiter", "Vorgangsart", "Zeitraum", "Exporttyp", <span className="block text-right" key="b">Bestellungen</span>, <span className="block text-right" key="p">Positionen</span>, "Ergebnis", "Export-ID"]}>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums">{day(a.at)}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{time(a.at)}</td>
                    <td className="py-2.5 pr-4">{a.by || "—"}</td>
                    <td className="py-2.5 pr-4">
                      {ACTIVITY_LABEL[a.kind]}
                      {a.legacy ? <span className="block text-[11px] text-muted">eingeschränkte historische Informationen</span> : null}
                    </td>
                    <td className="py-2.5 pr-4 text-[13px] text-muted">{a.range || a.preset || "Einzelauswahl"}</td>
                    <td className="py-2.5 pr-4 text-[13px]">{modeLabel(a)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{a.orders}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{a.legacy ? "—" : a.positions}</td>
                    <td className="py-2.5 pr-4">{a.result === "ok" ? <Badge tone="green">Erfolg</Badge> : <Badge tone="red">Fehler</Badge>}</td>
                    <td className="py-2.5 pr-4">
                      <Link className="font-mono text-[12px] underline-offset-4 hover:underline" href={`${BASE}?${qs({ id: a.id, seite: String(page) })}`}>
                        {a.id}
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
          {pages > 1 ? (
            <nav aria-label="Seiten" className="mt-5 flex items-center justify-between gap-3 text-sm">
              {page > 1 ? (
                <Link className={btnSecondary} href={`${BASE}?${qs({ seite: String(page - 1) })}`}>
                  ← Zurück
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted">
                Seite {page} von {pages}
              </span>
              {page < pages ? (
                <Link className={btnSecondary} href={`${BASE}?${qs({ seite: String(page + 1) })}`}>
                  Weiter →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
      <p className="mt-6 text-[12px] text-muted">
        Bestellbezogene Bearbeitungsschritte (Freigabe, Weitergabe, Versand) stehen im Änderungsprotokoll der jeweiligen Bestellung, z. B.{" "}
        <Link className="underline underline-offset-4" href="/admin/buero/bestellungen">
          Alle Bestellungen
        </Link>
        .
      </p>
    </>
  );
}

