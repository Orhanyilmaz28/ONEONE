import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Gemeinsame Bausteine für das Dashboard – bitte überall diese verwenden,
 * damit alle Bereiche gleich aussehen.
 */

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-card px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50";
export const input =
  "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none transition focus:border-ink/50 focus:ring-4 focus:ring-ink/5";
export const label = "mb-1.5 block text-[13px] font-medium text-ink/70";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-medium text-[28px] tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, className = "", padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04)] ${className}`}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-3 border-line border-b px-6 py-4">
          <h2 className="font-medium text-[15px]">{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className={padded ? "p-6" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label: l, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{l}</span>
        {icon}
      </div>
      <div className="mt-2 font-medium text-[26px] tabular-nums tracking-[-0.02em]">{value}</div>
      {hint ? <div className="mt-1 text-[13px] text-muted">{hint}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-ink/5 text-ink/70",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200/60",
  blue: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/60",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium text-xs ${TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = "amber", title, children }: { tone?: "amber" | "blue" | "red" | "green"; title: ReactNode; children?: ReactNode }) {
  const t = { amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-sky-200 bg-sky-50 text-sky-900", red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return (
    <div className={`rounded-2xl border px-5 py-4 text-sm ${t}`}>
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 leading-relaxed opacity-90">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-3xl border border-line border-dashed bg-card/60 px-6 py-14 text-center">
      <p className="font-medium text-[17px]">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-[15px] text-muted">{children}</div> : null}
      {action ? (
        <Link className={`${btnSecondary} mt-5`} href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Tabelle mit einheitlichem Stil; auf dem Handy horizontal scrollbar */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="relative -mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
            {head.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Spaltenreihenfolge
              <th className="whitespace-nowrap py-3 pr-4 font-medium" key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export function formatDateTime(d: Date | string | number) {
  return dateFmt.format(new Date(d));
}
export function formatDay(d: Date | string | number) {
  return dayFmt.format(new Date(d));
}
