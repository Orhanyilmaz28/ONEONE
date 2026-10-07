import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/admin/ui";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/lib/orders";
import { Icon, type IconName } from "./icons";
import { timeAgo } from "./stats";

const MAX_ORDERS = 5;
const DAY_MS = 86_400_000;

const rowLink =
  "group flex items-center gap-3.5 px-6 py-3.5 outline-none transition hover:bg-paper focus-visible:bg-paper focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-inset";

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s-]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function itemCount(order: Order) {
  return order.items.reduce((n, i) => n + (i.quantity || 0), 0);
}

function Chevron() {
  return (
    <span className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-ink/60">
      <Icon className="size-4" name="chevron" strokeWidth={2} />
    </span>
  );
}

function TaskRow({ href, icon, title, hint, badge }: { href: string; icon: IconName; title: ReactNode; hint?: ReactNode; badge?: ReactNode }) {
  return (
    <li>
      <Link className={rowLink} href={href}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cream text-ink/70">
          <Icon className="size-[17px]" name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[14px]">{title}</span>
          {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
        </span>
        {badge}
        <Chevron />
      </Link>
    </li>
  );
}

export function TodoList({
  openOrders,
  now,
  pendingReviews,
  newsletter,
}: {
  openOrders: Order[];
  now: number;
  pendingReviews: number;
  newsletter: { total: number; recent: number };
}) {
  const shown = openOrders.slice(0, MAX_ORDERS);
  const tasks = openOrders.length + (pendingReviews > 0 ? 1 : 0);

  return (
    <Card
      actions={tasks ? <Badge tone="amber">{tasks === 1 ? "1 Aufgabe" : `${tasks} Aufgaben`}</Badge> : <Badge tone="green">Alles erledigt</Badge>}
      className="flex flex-col"
      padded={false}
      title="Zu erledigen"
    >
      {/* Versand */}
      <div className="flex items-baseline justify-between px-6 pt-5 pb-2">
        <h3 className="font-medium text-[12px] text-muted uppercase tracking-[0.1em]">Bestellungen versenden</h3>
        {openOrders.length ? <span className="text-[13px] text-muted tabular-nums">{openOrders.length} offen</span> : null}
      </div>

      {shown.length ? (
        <ul className="divide-y divide-line">
          {shown.map((o) => {
            const waitingDays = Math.floor((now - o.createdAt) / DAY_MS);
            const count = itemCount(o);
            return (
              <li key={o.id}>
                <Link className={rowLink} href={`/admin/bestellungen/${encodeURIComponent(o.id)}`}>
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent font-medium text-[12px] text-black tracking-wide">
                    {initials(o.customer.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-[14px]">{o.customer.name}</span>
                      {o.demo ? <Badge tone="blue">Beispiel</Badge> : null}
                    </span>
                    <span className="block text-[13px] text-muted">
                      {o.number} ·{" "}
                      <span className={waitingDays >= 2 ? "font-medium text-amber-700" : ""}>{timeAgo(o.createdAt, now)}</span>
                      {count ? ` · ${count} Artikel` : ""}
                    </span>
                  </span>
                  <span className="font-medium text-[14px] tabular-nums">{formatPrice(o.amountTotal)}</span>
                  <Chevron />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mx-6 mb-2 flex items-center gap-3 rounded-2xl bg-emerald-50/70 px-4 py-3.5 text-[14px] text-emerald-900 ring-1 ring-emerald-200/60">
          <Icon className="size-4 text-emerald-700" name="check" strokeWidth={2.2} />
          Alles verschickt – neue Bestellungen erscheinen hier.
        </div>
      )}

      {openOrders.length > MAX_ORDERS ? (
        <div className="px-6 pt-1 pb-3">
          <Link className="rounded-md font-medium text-[13px] text-ink underline decoration-ink/20 underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-2 focus-visible:ring-ink/30" href="/admin/bestellungen">
            Alle {openOrders.length} offenen Bestellungen ansehen
          </Link>
        </div>
      ) : null}

      {/* Weitere Aufgaben */}
      <div className="mt-3 border-line border-t px-6 pt-5 pb-2">
        <h3 className="font-medium text-[12px] text-muted uppercase tracking-[0.1em]">Kund:innen</h3>
      </div>
      <ul className="divide-y divide-line pb-2">
        <TaskRow
          badge={pendingReviews ? <Badge tone="amber">{pendingReviews}</Badge> : null}
          hint={pendingReviews ? "Lesen und freigeben, dann erscheinen sie im Shop." : "Neue Bewertungen erscheinen hier zur Freigabe."}
          href="/admin/bewertungen"
          icon="star"
          title={pendingReviews === 1 ? "1 Bewertung wartet auf Freigabe" : pendingReviews ? `${pendingReviews} Bewertungen warten auf Freigabe` : "Keine neuen Bewertungen"}
        />
        <TaskRow
          hint={newsletter.recent ? `${newsletter.recent} neu in den letzten 30 Tagen` : newsletter.total ? "In den letzten 30 Tagen niemand neu" : "Noch niemand angemeldet"}
          href="/admin/newsletter"
          icon="mail"
          title={`${newsletter.total.toLocaleString("de-DE")} Newsletter-${newsletter.total === 1 ? "Abonnent:in" : "Abonnent:innen"}`}
        />
      </ul>
    </Card>
  );
}
