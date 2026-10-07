import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import { listCustomerOrders } from "@/lib/orders";
import { AccountHeader } from "./account-nav";
import { OrdersList } from "./orders-list";

export const metadata: Metadata = { title: "Übersicht" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPage({ searchParams }: Props) {
  const customer = await requireCustomer("/konto");
  const sp = await searchParams;
  const welcome = sp.willkommen === "1";
  const newPassword = sp.passwort === "neu";
  const { orders, error } = await listCustomerOrders(customer.email, 3);
  const a = customer.address;
  return (
    <>
      <AccountHeader active="/konto" name={customer.name} title="Mein Konto" />
      {newPassword ? (
        <p className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900" role="status">
          Dein neues Passwort ist gespeichert. Auf anderen Geräten bist du jetzt abgemeldet.
        </p>
      ) : null}
      {welcome ? (
        <p className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900" role="status">
          Willkommen! Dein Konto ist angelegt. Bestellungen mit der Adresse <b>{customer.email}</b> erscheinen hier automatisch.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="letzte">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="t-h3" id="letzte">
              Letzte Bestellungen
            </h2>
            {orders.length ? (
              <Link className="text-[15px] underline underline-offset-4" href="/konto/bestellungen">
                Alle ansehen
              </Link>
            ) : null}
          </div>
          {error ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{error}</p> : null}
          {orders.length ? (
            <OrdersList orders={orders} />
          ) : (
            <div className="rounded-[1.75rem] border border-line border-dashed bg-card p-8 text-center">
              <p className="font-medium">Noch keine Bestellungen</p>
              <p className="mt-1 text-[15px] text-muted">Bestellungen mit deiner E-Mail-Adresse erscheinen hier automatisch.</p>
              <Link className="mt-5 inline-flex h-11 items-center rounded-full bg-accent px-5 font-medium text-black transition hover:bg-accent-dark" href="/products">
                Zum Shop
              </Link>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="rounded-[1.75rem] border border-line bg-card p-6">
            <h2 className="font-medium">Meine Daten</h2>
            <p className="mt-2 text-[15px] text-ink/80 leading-relaxed">
              {customer.name}
              <br />
              {customer.email}
            </p>
            <h3 className="mt-4 font-medium text-[15px]">Lieferadresse</h3>
            <p className="mt-1 text-[15px] text-ink/80 leading-relaxed">
              {a ? (
                <>
                  {a.line1}
                  {a.line2 ? (
                    <>
                      <br />
                      {a.line2}
                    </>
                  ) : null}
                  <br />
                  {a.postalCode} {a.city}
                </>
              ) : (
                <span className="text-muted">Noch keine gespeichert</span>
              )}
            </p>
            <Link className="mt-4 inline-block text-[15px] underline underline-offset-4" href="/konto/daten">
              Bearbeiten
            </Link>
          </div>
          <div className="rounded-[1.75rem] bg-cream/70 p-6 text-[14px] text-ink/80 leading-relaxed">
            Fragen zu einer Bestellung?{" "}
            <Link className="underline underline-offset-2" href="/kontakt">
              Schreib uns
            </Link>{" "}
            – persönlich.
          </div>
        </aside>
      </div>
    </>
  );
}
