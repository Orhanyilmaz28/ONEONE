import type { Metadata } from "next";
import { requireCustomer } from "@/lib/customer-auth";
import { AccountHeader } from "../account-nav";
import { DeleteForm, PasswordForm, ProfileForm } from "../forms";

export const metadata: Metadata = { title: "Meine Daten" };

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });

export default async function AccountDataPage() {
  const c = await requireCustomer("/konto/daten");
  return (
    <>
      <AccountHeader active="/konto/daten" name={c.name} title="Meine Daten" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="profil" className="rounded-[1.75rem] border border-line bg-white p-6 sm:p-8">
          <h2 className="t-h3 mb-5" id="profil">
            Name & Adresse
          </h2>
          <ProfileForm
            initial={{
              name: c.name,
              email: c.email,
              line1: c.address?.line1 ?? "",
              line2: c.address?.line2 ?? "",
              postalCode: c.address?.postalCode ?? "",
              city: c.address?.city ?? "",
              country: c.address?.country ?? "DE",
            }}
          />
        </section>
        <div className="space-y-6">
          <section aria-labelledby="pw" className="rounded-[1.75rem] border border-line bg-white p-6 sm:p-8">
            <h2 className="t-h3 mb-5" id="pw">
              Passwort ändern
            </h2>
            <PasswordForm />
          </section>
          <section aria-labelledby="loeschen" className="rounded-[1.75rem] border border-line bg-white p-6 sm:p-8">
            <h2 className="t-h3" id="loeschen">
              Konto löschen
            </h2>
            <p className="mt-2 mb-5 text-[15px] text-muted">Konto seit {dateFmt.format(new Date(c.createdAt))}. Du kannst es jederzeit selbst löschen.</p>
            <DeleteForm />
          </section>
        </div>
      </div>
    </>
  );
}
