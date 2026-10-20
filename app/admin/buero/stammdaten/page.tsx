import type { Metadata } from "next";
import Link from "next/link";
import { productLookup } from "@/app/admin/(panel)/bestellungen/data";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { MASTER_LABEL, type MasterIssueKind, checkMasterData } from "@/lib/office/master-data";

export const metadata: Metadata = { title: "Artikelstammdaten prüfen · Büro" };
export const dynamic = "force-dynamic";

const TONE: Record<MasterIssueKind, "red" | "amber" | "orange"> = { sku_fehlt: "amber", sku_doppelt: "red", einheit_fehlt: "red", sorte_fehlt: "amber", tray_widerspruch: "orange", mix_unvollstaendig: "red" };

export default async function MasterDataPage() {
  const me = await requireOffice();
  const products = [...new Map([...(await productLookup()).values()].map((p) => [p.handle, p])).values()];
  const issues = checkMasterData(products);
  const kinds = Object.keys(MASTER_LABEL) as MasterIssueKind[];
  const admin = me.role === "admin";
  return (
    <>
      <PageHeader description={`${products.length} Produkte geprüft. Diese Seite ändert nichts – Korrekturen bitte in der Produktverwaltung bzw. mit dem Hersteller klären.`} title="Artikelstammdaten prüfen" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kinds.map((k) => (
          <div className="rounded-3xl border border-line bg-card p-4" key={k}>
            <p className="text-[12px] text-muted">{MASTER_LABEL[k]}</p>
            <p className="mt-1 font-medium text-[22px] tabular-nums">{issues.filter((i) => i.kind === k).length}</p>
          </div>
        ))}
      </div>
      {issues.length === 0 ? (
        <EmptyState title="Keine Auffälligkeiten">Alle Produkte haben Artikelnummer, Einheit, Sorte und stimmige Tray-Angaben.</EmptyState>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto px-6 pb-1">
            <Table head={["Produkt", "Problem", "Feld", "Details", "Empfohlene Korrektur", ""]}>
              {issues.map((i, n) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
                <tr key={n}>
                  <td className="py-3 pr-4 align-top font-medium">{i.product}</td>
                  <td className="py-3 pr-4 align-top">
                    <Badge tone={TONE[i.kind]}>{MASTER_LABEL[i.kind]}</Badge>
                  </td>
                  <td className="py-3 pr-4 align-top text-[13px]">{i.field}</td>
                  <td className="py-3 pr-4 align-top text-[13px] text-muted">{i.detail}</td>
                  <td className="py-3 pr-4 align-top text-[13px]">{i.fix}</td>
                  <td className="whitespace-nowrap py-3 pr-4 align-top text-[13px]">
                    {admin ? (
                      <Link className="underline underline-offset-4" href={`/admin/produkte/${encodeURIComponent(i.handle)}`}>
                        Produkt öffnen
                      </Link>
                    ) : (
                      <span className="text-muted">Administrator</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      )}
      <p className="mt-4 text-[12px] text-muted">Artikelnummern und Paletten stehen in den Artikelpässen (im Code hinterlegt). Fehlende Werte werden nie automatisch ergänzt oder geraten.</p>
    </>
  );
}
