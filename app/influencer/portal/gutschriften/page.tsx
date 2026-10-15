import Link from "next/link";
import { getStatementsOf, monthLabel } from "@/lib/commissions";
import { formatPrice } from "@/lib/format";
import { requireInfluencer } from "@/lib/influencer-auth";

export const metadata = { title: "Gutschriften" };

export default async function StatementsPage() {
  const inf = await requireInfluencer();
  const statements = await getStatementsOf(inf.id);
  return (
    <div className="mx-auto max-w-4xl">
      <p className="t-eyebrow">Abrechnung</p>
      <h1 className="t-h1 mt-3">Gutschriften</h1>
      <p className="t-lead mt-3 max-w-2xl">Einmal im Monat rechnen wir deine Provision per Gutschrift ab – für deine Buchhaltung als PDF.</p>
      {statements.length === 0 ? (
        <p className="mt-10 rounded-[1.5rem] border border-line border-dashed bg-card px-6 py-12 text-center text-muted">Noch keine Gutschrift – die erste kommt nach dem ersten Monat mit Bestellungen.</p>
      ) : (
        <ul className="mt-10 grid gap-3">
          {statements.map((s) => (
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[1.5rem] border border-line bg-card p-5" key={s.id}>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{s.number}</span>
                <span className="block text-muted text-sm">
                  {monthLabel(s.month)} · {s.lines.length} {s.lines.length === 1 ? "Position" : "Positionen"}
                </span>
              </span>
              <span className={`rounded-full px-3 py-1 font-bold text-xs ${s.paid ? "bg-accent text-black" : "border border-amber-300/60 text-amber-300"}`}>{s.paid ? "Ausgezahlt" : "Auszahlung offen"}</span>
              <span className="font-bold tabular-nums">{formatPrice(s.gross)}</span>
              <Link className="inline-flex h-9 items-center rounded-full border border-accent px-4 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" href={`/influencer/portal/gutschriften/${s.id}`}>
                Ansehen / PDF
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
