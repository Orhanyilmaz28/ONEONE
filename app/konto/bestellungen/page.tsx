import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer-auth";
import { listCustomerOrders } from "@/lib/orders";
import { AccountHeader } from "../account-nav";
import { OrdersList } from "../orders-list";

export const metadata: Metadata = { title: "Bestellungen" };

export default async function AccountOrdersPage() {
  const customer = await requireCustomer("/konto/bestellungen");
  const { orders, error } = await listCustomerOrders(customer.email);
  return (
    <>
      <AccountHeader active="/konto/bestellungen" name={customer.name} title="Meine Bestellungen" />
      {error ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{error}</p> : null}
      {orders.length ? (
        <>
          <OrdersList orders={orders} />
          <p className="mt-6 text-[14px] text-muted">
            Hier stehen alle Bestellungen der letzten zwei Jahre mit der Adresse {customer.email}. Rechnung oder Rücksendung?{" "}
            <Link className="underline underline-offset-2" href="/kontakt">
              Schreib uns
            </Link>
            .
          </p>
        </>
      ) : (
        <div className="rounded-[1.75rem] border border-line border-dashed bg-card p-8 text-center">
          <p className="font-medium">Noch keine Bestellungen</p>
          <p className="mt-1 text-[15px] text-muted">Bestellungen mit der Adresse {customer.email} erscheinen hier automatisch.</p>
        </div>
      )}
    </>
  );
}
