import { formatPrice } from "@/lib/format";

/** Schlichtes Säulendiagramm: Provision je Monat (letzte 12 Monate), ohne Zusatzbibliothek */
export function CommissionChart({ months }: { months: { month: string; amount: number; orders: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.amount));
  const label = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("de-DE", { month: "short", timeZone: "Europe/Berlin" }).replace(".", "");
  return (
    <figure className="rounded-[1.5rem] border border-line bg-card p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-bold">Provision je Monat</span>
        <span className="text-muted text-xs">letzte 12 Monate</span>
      </figcaption>
      <ol className="mt-5 flex h-40 items-end gap-1.5 sm:gap-2">
        {months.map((m) => (
          <li className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" key={m.month}>
            <span className="pointer-events-none absolute -top-1 hidden whitespace-nowrap rounded-lg bg-black px-2 py-1 text-[11px] text-ink shadow group-hover:block">
              {formatPrice(m.amount)} · {m.orders} Best.
            </span>
            <span
              aria-label={`${label(m.month)}: ${formatPrice(m.amount)}, ${m.orders} Bestellungen`}
              className={`w-full rounded-t-md ${m.amount ? "bg-accent" : "bg-white/10"}`}
              role="img"
              style={{ height: `${Math.max(3, (m.amount / max) * 100)}%` }}
            />
            <span className="text-[10px] text-muted">{label(m.month)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
