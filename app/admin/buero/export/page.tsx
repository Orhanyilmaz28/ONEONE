import type { Metadata } from "next";
import { Card, Notice, PageHeader, btn, label } from "@/components/admin/ui";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { requireOffice } from "@/lib/admin-auth";
import { EXPORT_TYPES } from "@/lib/office/export";
import { filterParams } from "@/lib/office/filters";
import { parseExportRequest, preview } from "@/lib/office/service";
import { FilterFields, FormButtons, RangeFields, type SearchParams, paramsOf, productOptions } from "../shared";

export const metadata: Metadata = { title: "Excel-Export · Büro" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/admin/buero/export";

export default async function ExportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOffice("office.export");
  const p = await paramsOf(searchParams);
  const products = await productLookup();
  const parsed = parseExportRequest(p, Date.now());
  const show = p.vorschau === "1" || Object.keys(p).some((k) => k !== "fehler");
  const pv = show && parsed.ok ? await preview(parsed.req) : null;
  const type = parsed.ok ? parsed.req.type : "voll";
  const lock = type === "haendler" || type === "privat";

  return (
    <>
      <PageHeader description="Zeitraum, Filter und Exportart wählen, Vorschau prüfen, dann herunterladen. Exportiert werden immer alle passenden Bestellungen." title="Excel-Export" />

      {p.fehler ? (
        <div className="mb-6">
          <Notice title="Export nicht erstellt" tone="red">
            {p.fehler.slice(0, 300)}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <form action={BASE} className="space-y-5" method="get">
          <input name="vorschau" type="hidden" value="1" />
          <fieldset>
            <legend className={label}>Exportart</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {EXPORT_TYPES.map((t) => (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-line px-4 py-3 text-[14px] has-[:checked]:border-ink/50 has-[:checked]:bg-ink/[0.03]" key={t.key}>
                  <input className="mt-1" defaultChecked={t.key === type} name="art" type="radio" value={t.key} />
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-[12px] text-muted">{t.sheets.join(", ")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <RangeFields p={p} />
          <FilterFields lockChannel={lock} p={p} products={productOptions(products)} />
          {lock ? <p className="text-[12px] text-muted">Bei „{type === "haendler" ? "Händlerbestellungen" : "Privatkundenbestellungen"}“ ist die Kundenart festgelegt.</p> : null}
          <FormButtons reset={BASE} submit="Vorschau anzeigen" />
        </form>
      </Card>

      {!parsed.ok ? (
        <Notice title="Zeitraum ungültig" tone="red">
          {parsed.error}
        </Notice>
      ) : pv ? (
        <Card title="Vorschau">
          <dl className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted">Exportart</dt>
            <dd>{pv.typeLabel}</dd>
            <dt className="text-muted">Zeitraum</dt>
            <dd>{pv.range}</dd>
            <dt className="text-muted">Filter</dt>
            <dd>{pv.filters.join(" · ")}</dd>
            <dt className="text-muted">Bestellungen</dt>
            <dd className="font-medium tabular-nums">{pv.orders}</dd>
            <dt className="text-muted">Artikelpositionen</dt>
            <dd className="tabular-nums">{pv.lines}</dd>
            <dt className="text-muted">Format</dt>
            <dd>
              {pv.format} · Tabellenblätter: {pv.sheets.join(", ")}
            </dd>
          </dl>
          {pv.changedAfterRelease.length ? (
            <div className="mt-4">
              <Notice title={`${pv.changedAfterRelease.length} ${pv.changedAfterRelease.length === 1 ? "Bestellung wurde" : "Bestellungen wurden"} nach der Versandfreigabe geändert`}>
                {pv.changedAfterRelease.slice(0, 20).join(", ")}
                {pv.changedAfterRelease.length > 20 ? " …" : ""} – bitte die Freigabe prüfen. Der Export enthält den aktuellen Stand.
              </Notice>
            </div>
          ) : null}
          {!pv.complete ? (
            <div className="mt-4">
              <Notice title="Export gesperrt – Daten unvollständig" tone="red">
                {pv.errors.join(" ")} Bitte später erneut versuchen.
              </Notice>
            </div>
          ) : (
            <form action="/api/admin/buero/export" className="mt-5" method="post">
              <input name="art" type="hidden" value={parsed.req.type} />
              <input name="zeitraum" type="hidden" value={parsed.req.preset} />
              {(["tag", "kw", "monat", "jahr", "von", "bis"] as const).map((k) => (p[k] ? <input key={k} name={k} type="hidden" value={p[k]} /> : null))}
              {Object.entries(filterParams(parsed.req.filters)).map(([k, v]) => (
                <input key={k} name={k} type="hidden" value={v} />
              ))}
              <button className={btn} disabled={pv.orders === 0} type="submit">
                Excel herunterladen ({pv.orders} {pv.orders === 1 ? "Bestellung" : "Bestellungen"})
              </button>
              <p className="mt-2 text-[12px] text-muted">Die Datei wird nur an dich ausgeliefert und nirgends öffentlich gespeichert. Der Export wird protokolliert.</p>
            </form>
          )}
        </Card>
      ) : null}
    </>
  );
}
