import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Badge, Card, EmptyState, Notice, PageHeader, Table, btn, formatDateTime, input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABEL, type Order, type OrderStatus, listOrders } from "@/lib/orders";
import { daysSince, productLookup, readableItems, stripePaymentsUrl } from "./data";
import { STATUS_ORDER, STATUS_TONE, isStatus, itemSummary } from "./shipping";

export const metadata: Metadata = { title: "Bestellungen" };

const BASE = "/admin/bestellungen";
const DAYS = 90;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Link mit Filter + Suche (leere Werte weglassen) */
function hrefWith(status: OrderStatus | "", q: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** Suche in Name, E-Mail, Bestellnummer, Ort und Sendungsnummer */
function matches(order: Order, q: string) {
  const needle = q.toLowerCase();
  const compact = needle.replace(/[\s-]/g, "");
  const haystack = [order.customer.name, order.customer.email, order.shipping?.name, order.shipping?.address.city, order.meta.tracking].filter(Boolean).join(" ").toLowerCase();
  const number = order.number.toLowerCase().replace(/-/g, "");
  return haystack.includes(needle) || (compact.length > 0 && (number.includes(compact) || order.id.toLowerCase() === needle));
}

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const statusParam = first(sp.status);
  const status: OrderStatus | "" = isStatus(statusParam) ? statusParam : "";
  const q = first(sp.q).trim().slice(0, 100);

  const [{ orders: raw, source, error }, products] = await Promise.all([listOrders({ days: DAYS }), productLookup()]);
  const orders = raw.map((o) => ({ ...o, items: readableItems(o.items, products) }));

  const searched = q ? orders.filter((o) => matches(o, q)) : orders;
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, searched.filter((o) => o.meta.status === s).length])) as Record<OrderStatus, number>;
  const visible = status ? searched.filter((o) => o.meta.status === status) : searched;
  const openTotal = orders.filter((o) => o.meta.status === "offen").length;

  const tabs: { key: OrderStatus | ""; label: string; count: number }[] = [
    { key: "", label: "Alle", count: searched.length },
    ...STATUS_ORDER.map((s) => ({ key: s, label: ORDER_STATUS_LABEL[s], count: counts[s] })),
  ];

  return (
    <>
      <PageHeader
        actions={source === "demo" ? <Badge tone="amber">Beispieldaten</Badge> : null}
        description={
          source === "none"
            ? "Hier siehst du später alle bezahlten Bestellungen aus deinem Shop."
            : `Alle bezahlten Bestellungen der letzten ${DAYS} Tage. Klick auf eine Bestellung, um sie zu versenden oder den Lieferschein zu drucken.`
        }
        title="Bestellungen"
      />

      {source === "demo" ? (
        <div className="mb-6">
          <Notice title="Beispieldaten – Stripe ist noch nicht verbunden" tone="blue">
            Das sind Beispiel-Bestellungen zum Ausprobieren. Du kannst alles testen: Status ändern, Sendungsnummer eintragen, Lieferschein drucken.
            Sobald dein Stripe-Schlüssel eingetragen ist, erscheinen hier automatisch deine echten Bestellungen.
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6">
          <Notice title="Bestellungen konnten nicht vollständig geladen werden" tone="red">
            {error} Prüfe in Vercel unter <b>Settings → Environment Variables</b> den Wert <code className="rounded bg-card/70 px-1">STRIPE_SECRET_KEY</code>.
          </Notice>
        </div>
      ) : null}

      {source === "none" ? (
        <EmptyState title="Stripe ist noch nicht verbunden">
          <p>
            Deine Bestellungen kommen direkt von Stripe – dort bezahlen deine Kund:innen. Trage den geheimen Stripe-Schlüssel (
            <code className="rounded bg-ink/5 px-1 text-[13px]">STRIPE_SECRET_KEY</code>) in Vercel ein. Die Anleitung „Online stellen“ zeigt dir jeden Klick.
          </p>
          <p className="mt-3">
            <a className="font-medium text-ink underline underline-offset-4 hover:no-underline" href="https://dashboard.stripe.com/apikeys" rel="noreferrer" target="_blank">
              Zum Stripe-Schlüssel ↗
            </a>
          </p>
        </EmptyState>
      ) : (
        <>
          {/* Hinweis auf wartende Bestellungen */}
          {openTotal > 0 && status !== "offen" && !q ? (
            <Link
              className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-amber-900 text-sm transition hover:border-amber-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
              href={hrefWith("offen", "")}
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
                <span>
                  <b className="font-medium">
                    {openTotal} {openTotal === 1 ? "Bestellung wartet" : "Bestellungen warten"}
                  </b>{" "}
                  auf den Versand.
                </span>
              </span>
              <span className="shrink-0 font-medium">Anzeigen →</span>
            </Link>
          ) : null}

          {/* Filter + Suche */}
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Nach Status filtern" className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <ul className="flex w-max gap-1 rounded-full border border-line bg-card p-1">
                {tabs.map((t) => {
                  const active = t.key === status;
                  return (
                    <li key={t.key || "alle"}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10 ${active ? "bg-accent text-white" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
                        href={hrefWith(t.key, q)}
                        scroll={false}
                      >
                        {t.label}
                        <span
                          className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${active ? "bg-white/20 text-white" : t.key === "offen" && t.count > 0 ? "bg-amber-100 text-amber-900" : "bg-ink/5 text-ink/60"}`}
                        >
                          {t.count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <Form action={BASE} className="flex w-full gap-2 lg:w-auto" role="search" scroll={false}>
              {status ? <input name="status" type="hidden" value={status} /> : null}
              <div className="relative min-w-0 flex-1 lg:w-80">
                <svg aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <label className="sr-only" htmlFor="order-search">
                  Bestellungen durchsuchen
                </label>
                <input className={`${input} pl-10`} defaultValue={q} id="order-search" name="q" placeholder="Name, E-Mail oder Nr." type="search" />
              </div>
              <button className={`${btn} shrink-0`} type="submit">
                Suchen
              </button>
            </Form>
          </div>

          {q ? (
            <p className="mb-4 text-muted text-sm" role="status">
              {visible.length === 1 ? "1 Treffer" : `${visible.length} Treffer`} für „<span className="text-ink">{q}</span>“ ·{" "}
              <Link className="text-ink underline underline-offset-4 hover:no-underline" href={hrefWith(status, "")} scroll={false}>
                Suche löschen
              </Link>
            </p>
          ) : null}

          {visible.length === 0 ? (
            orders.length === 0 ? (
              <EmptyState title="Noch keine Bestellungen">
                Sobald jemand in deinem Shop bezahlt, erscheint die Bestellung hier – ganz automatisch. Es werden die letzten {DAYS} Tage angezeigt.
              </EmptyState>
            ) : (
              <EmptyState action={{ href: BASE, label: "Alle Bestellungen zeigen" }} title="Keine passenden Bestellungen">
                {q ? "Versuch es mit einem anderen Namen, einer E-Mail-Adresse oder der Bestellnummer (z. B. EX-4F7K2Q)." : `Gerade gibt es keine Bestellungen mit dem Status „${status ? ORDER_STATUS_LABEL[status] : ""}“.`}
              </EmptyState>
            )
          ) : (
            <>
              {/* Handy: Karten */}
              <ul className="space-y-3 md:hidden">
                {visible.map((o) => (
                  <li key={o.id}>
                    <OrderCard order={o} />
                  </li>
                ))}
              </ul>

              {/* Ab Tablet: Tabelle */}
              <div className="hidden md:block">
                <Card padded={false}>
                  <div className="px-6 pb-1">
                    <Table head={["Bestellung", "Datum", "Kunde", "Artikel", <span className="block text-right" key="sum">Summe</span>, "Status"]}>
                      {visible.map((o) => (
                        <OrderRow key={o.id} order={o} />
                      ))}
                    </Table>
                  </div>
                </Card>
              </div>
            </>
          )}

          <p className="mt-5 text-[13px] text-muted">
            Es werden bezahlte Bestellungen der letzten {DAYS} Tage angezeigt.
            {source === "stripe" ? (
              <>
                {" "}
                Ältere findest du im{" "}
                <a className="text-ink underline underline-offset-4 hover:no-underline" href={stripePaymentsUrl()} rel="noreferrer" target="_blank">
                  Stripe-Dashboard ↗
                </a>
                .
              </>
            ) : null}
          </p>
        </>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

/** „wartet seit 3 Tagen“ bei offenen Bestellungen, die älter als 1 Tag sind */
function Waiting({ order }: { order: Order }) {
  const days = daysSince(order.createdAt);
  if (order.meta.status !== "offen" || days < 2) return null;
  return <span className="text-[12px] text-amber-800">wartet seit {days} Tagen</span>;
}

function OrderRow({ order: o }: { order: Order }) {
  return (
    <tr className="relative transition hover:bg-ink/[0.025]">
      <td className="py-3.5 pr-4 align-top">
        <Link
          className="font-medium tabular-nums after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink/30"
          href={`${BASE}/${encodeURIComponent(o.id)}`}
        >
          {o.number}
        </Link>
      </td>
      <td className="whitespace-nowrap py-3.5 pr-4 align-top text-ink/80 tabular-nums">{formatDateTime(o.createdAt)}</td>
      <td className="py-3.5 pr-4 align-top">
        <div className="max-w-[220px] truncate">{o.customer.name}</div>
        {o.customer.email ? <div className="max-w-[220px] truncate text-[13px] text-muted">{o.customer.email}</div> : null}
      </td>
      <td className="py-3.5 pr-4 align-top text-ink/80">
        <div className="max-w-[260px] truncate" title={o.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}>
          {itemSummary(o.items)}
        </div>
      </td>
      <td className="whitespace-nowrap py-3.5 pr-4 text-right align-top font-medium tabular-nums">{formatPrice(o.amountTotal)}</td>
      <td className="py-3.5 align-top">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={o.meta.status} />
          <Waiting order={o} />
        </div>
      </td>
    </tr>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  return (
    <Link
      className="block rounded-3xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:border-ink/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10"
      href={`${BASE}/${encodeURIComponent(o.id)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium tabular-nums">{o.number}</span>
        <StatusBadge status={o.meta.status} />
      </div>
      <div className="mt-2 truncate text-[15px]">{o.customer.name}</div>
      <div className="truncate text-muted text-sm">{itemSummary(o.items)}</div>
      <div className="mt-3 flex items-center justify-between gap-3 border-line border-t pt-3 text-sm">
        <span className="flex flex-col text-muted tabular-nums">
          {formatDateTime(o.createdAt)}
          <Waiting order={o} />
        </span>
        <span className="font-medium tabular-nums">{formatPrice(o.amountTotal)}</span>
      </div>
    </Link>
  );
}
