import type { Metadata } from "next";
import { removePassAction } from "./actions";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { Badge, Notice, PageHeader, btnDanger, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { getDealerPasses } from "@/lib/dealer-data";

export const metadata: Metadata = { title: "Artikelpässe" };

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function PassesAdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const [products, passes] = await Promise.all([getProducts({ includeHidden: true }), getDealerPasses()]);
  const items = [{ key: "katalog", title: "Gesamtkatalog", group: "Allgemein" }, ...DEALER_GROUPS.filter((g) => g.key !== "mix" && g.key !== "palette").flatMap((g) => products.filter(g.test).map((p) => ({ key: p.handle, title: p.title, group: g.title })))];
  const have = items.filter((i) => passes[i.key]).length;
  return (
    <>
      <PageHeader description="PDF-Datenblätter je Artikel. Nur freigegebene Händler können sie in ihrem Händlerbereich öffnen. Pro Datei höchstens 4 MB." title="Händler" />
      <DealerTabs active="/admin/haendler/artikelpaesse" />
      {sp.ok ? <Notice title={`${sp.ok} Artikelpass hochgeladen`} tone="green" /> : null}
      {sp.error ? <div className="mt-3"><Notice title="Das hat nicht geklappt" tone="red">{sp.error}</Notice></div> : null}

      <form action="/admin/haendler/artikelpaesse/upload" className="my-6 rounded-3xl border border-line bg-card p-6" encType="multipart/form-data" method="post">
        <h2 className="font-medium text-[15px]">Mehrere Pässe auf einmal hochladen</h2>
        <p className="mt-1 text-[13px] text-muted">Benenne jede Datei wie das Produkt: <code>classic.pdf</code>, <code>xtea-peach.pdf</code>, <code>wasser-still.pdf</code> … und <code>katalog.pdf</code> für den Gesamtkatalog.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input accept="application/pdf,.pdf" className="text-[14px]" multiple name="file" required type="file" />
          <button className={btnSecondary} type="submit">
            Hochladen
          </button>
        </div>
      </form>

      <p className="mb-3 text-[14px] text-muted">
        {have} von {items.length} Pässen hochgeladen.
      </p>
      <div className="overflow-hidden rounded-3xl border border-line bg-card">
        <ul className="divide-y divide-line">
          {items.map((i) => {
            const p = passes[i.key];
            return (
              <li className="flex flex-wrap items-center gap-3 px-5 py-3" key={i.key}>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[14px]">{i.title}</span>
                  <span className="block text-[12px] text-muted">{i.group} · {i.key}.pdf</span>
                </span>
                {p ? <Badge tone="green">{kb(p.size)} · {formatDateTime(p.updatedAt)}</Badge> : <Badge tone="amber">fehlt</Badge>}
                <form action="/admin/haendler/artikelpaesse/upload" className="flex items-center gap-2" encType="multipart/form-data" method="post">
                  <input name="key" type="hidden" value={i.key} />
                  <input accept="application/pdf,.pdf" aria-label={`PDF für ${i.title}`} className="w-48 text-[12px]" name="file" required type="file" />
                  <button className={btnSecondary} type="submit">
                    {p ? "Ersetzen" : "Hochladen"}
                  </button>
                </form>
                {p ? (
                  <form action={removePassAction.bind(null, i.key)}>
                    <button className={btnDanger} type="submit">
                      Löschen
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
