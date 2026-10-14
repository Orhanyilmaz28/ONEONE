import { TierBadge } from "@/components/tier-badge";
import { getProducts } from "@/lib/catalog";
import { DEALER_GROUPS } from "@/lib/dealer-catalog";
import { requireDealer } from "@/lib/dealer-auth";
import { dealerRows } from "@/lib/dealer-rows";
import { OrderForm } from "./order-form";

export const metadata = { title: "Bestellen" };

export default async function OrderPage() {
  const dealer = await requireDealer();
  const { rows, tierName } = await dealerRows(dealer, await getProducts());
  const groups = DEALER_GROUPS.map((g) => ({ key: g.key, title: g.title })).filter((g) => rows.some((r) => r.group === g.key));
  return (
    <div className="mx-auto max-w-6xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <h1 className="t-h1">Bestellen</h1>
        <TierBadge name={tierName} />
      </div>
      <p className="t-lead mt-3 max-w-2xl">
        Menge in Trays eintragen und absenden – zu deinen Händlerpreisen. Ab 2 Trays gilt der Staffelpreis, ganze Paletten werden automatisch zum Palettenpreis
        berechnet. Wir bestätigen die Bestellung und schicken dir die Rechnung.
      </p>
      <p className="mt-2 text-muted text-sm">
        Lieferadresse: {dealer.company}, {dealer.street}, {dealer.zip} {dealer.city} – abweichende Adresse bitte unten als Anmerkung.
      </p>
      <OrderForm groups={groups} rows={rows} />
    </div>
  );
}
