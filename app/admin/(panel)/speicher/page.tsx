import type { Metadata } from "next";
import { measureAction } from "./actions";
import { LimitForm } from "./limit-form";
import { Card, Notice, PageHeader, Stat, btn, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { LIMIT_PRESETS, formatBytes, getLimitMb, measureStorage } from "@/lib/storage-usage";
import { storeKind } from "@/lib/store";

export const metadata: Metadata = { title: "Speicher" };
export const dynamic = "force-dynamic";

const tone = (pct: number) => (pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500");

export default async function StoragePage() {
  await requireAdmin();
  const kind = storeKind();
  if (kind === "none") {
    return (
      <>
        <PageHeader title="Speicher" />
        <Notice title="Kein Datenspeicher verbunden">In Vercel unter „Storage“ eine Upstash-Redis-Datenbank verbinden – danach erscheint hier die Belegung.</Notice>
      </>
    );
  }
  const [usage, limitMb] = await Promise.all([measureStorage().catch(() => null), getLimitMb()]);
  const limit = limitMb * 1024 * 1024;
  if (!usage) {
    return (
      <>
        <PageHeader title="Speicher" />
        <Notice title="Messung fehlgeschlagen" tone="red">
          Der Datenspeicher hat nicht geantwortet. Bitte gleich noch einmal versuchen.
        </Notice>
      </>
    );
  }
  const pct = Math.min(100, (usage.usedBytes / limit) * 100);
  const free = Math.max(0, limit - usage.usedBytes);
  return (
    <>
      <PageHeader
        description={`So viel Platz belegen Bilder, Bestellungen, Händlerdaten und Einstellungen in deinem Datenspeicher (${kind === "redis" ? "Upstash Redis" : "lokale Testdatei"}). Gemessen ${formatDateTime(usage.measuredAt)}.`}
        title="Speicher"
        actions={
          <form action={measureAction}>
            <button className={btn} type="submit">
              Neu messen
            </button>
          </form>
        }
      />

      {pct >= 90 ? (
        <div className="mb-6">
          <Notice title="Der Speicher ist fast voll" tone="red">
            Bitte alte Bilder löschen oder den Upstash-Tarif erhöhen – wenn der Speicher voll ist, können keine Bestellungen, Händler oder Bilder mehr gespeichert werden.
          </Notice>
        </div>
      ) : pct >= 70 ? (
        <div className="mb-6">
          <Notice title="Der Speicher füllt sich">Behalte die Belegung im Blick; Bilder belegen am meisten Platz.</Notice>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[15px]">
            <b className="text-[28px] tracking-tight">{formatBytes(usage.usedBytes)}</b> von {formatBytes(limit)} belegt
          </p>
          <p className="font-medium text-[15px]">
            {formatBytes(free)} frei · {pct.toLocaleString("de-DE", { maximumFractionDigits: pct < 1 ? 2 : 0 })} %
          </p>
        </div>
        <div aria-label={`${pct.toFixed(0)} Prozent belegt`} className="mt-3 h-4 overflow-hidden rounded-full bg-ink/5" role="img">
          <div className={`h-full rounded-full ${tone(pct)}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
        </div>
        <div className="mt-6 border-line border-t pt-5">
          <LimitForm current={limitMb} presets={LIMIT_PRESETS} />
          <p className="mt-2 text-[12px] text-muted">Das genaue Limit deines Tarifs steht im Upstash-Dashboard unter deiner Datenbank → „Usage“ (Max Data Size). Die Werte hier sind eine Messung der gespeicherten Daten (ca.).</p>
        </div>
      </Card>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Einträge" value={usage.keys.toLocaleString("de-DE")} />
        <Stat label="Größter Bereich" value={usage.categories[0]?.label ?? "–"} hint={usage.categories[0] ? formatBytes(usage.categories[0].bytes) : undefined} />
        <Stat label="Noch frei" value={formatBytes(free)} />
      </section>

      <Card className="mt-6" title="Aufteilung">
        <ul className="grid gap-3">
          {usage.categories.map((c) => (
            <li key={c.label}>
              <div className="flex justify-between gap-3 text-[14px]">
                <span>
                  {c.label} <span className="text-muted">· {c.count.toLocaleString("de-DE")} {c.count === 1 ? "Eintrag" : "Einträge"}</span>
                </span>
                <span className="tabular-nums">{formatBytes(c.bytes)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/5">
                <div className="h-full rounded-full bg-ink/60" style={{ width: `${Math.max(0.5, (c.bytes / Math.max(1, usage.usedBytes)) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6" title="Größte Einträge">
        <ul className="divide-y divide-line text-[14px]">
          {usage.largest.map((l) => (
            <li className="flex justify-between gap-3 py-2" key={l.key}>
              <span className="min-w-0 truncate">
                {l.label} <span className="text-[12px] text-muted">{l.key}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatBytes(l.bytes)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-muted">Tipp: Produktbilder vor dem Hochladen verkleinern. Gewerbenachweise werden gelöscht, wenn du den Händler unter „Händler → Anfragen“ löschst. Die Zahl der Befehle pro Monat (Free: 500.000) zeigt nur Upstash selbst.</p>
      </Card>
    </>
  );
}
