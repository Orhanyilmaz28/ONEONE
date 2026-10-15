import { requireInfluencer } from "@/lib/influencer-auth";
import { INFLUENCER_MARKETING_TEXT } from "@/lib/influencer-rules";
import { influencerMarketingAction } from "../../actions";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Konto & Auszahlung" };

export default async function AccountPage() {
  const inf = await requireInfluencer();
  const granted = Boolean(inf.marketing?.granted);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="t-eyebrow">Konto</p>
      <h1 className="t-h1 mt-3">Konto & Auszahlung</h1>
      <p className="t-lead mt-3">Diese Angaben stehen auf deiner monatlichen Gutschrift. Die Auszahlung geht an die hier hinterlegte Bankverbindung.</p>
      <dl className="mt-8 grid gap-x-6 gap-y-1 rounded-[1.5rem] border border-line bg-card p-5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">E-Mail</dt>
        <dd>{inf.email}</dd>
        <dt className="text-muted">Kanal</dt>
        <dd className="truncate">
          {inf.alias} · {inf.platform}
        </dd>
        <dt className="text-muted">Code</dt>
        <dd className="font-bold text-accent">{inf.code ?? "–"}</dd>
      </dl>
      <ProfileForm inf={{ name: inf.name, phone: inf.phone, street: inf.street, zip: inf.zip, city: inf.city, smallBusiness: inf.smallBusiness, taxNo: inf.taxNo, vatId: inf.vatId, iban: inf.iban, accountHolder: inf.accountHolder }} />
      <section className="mt-8 rounded-[1.5rem] border border-line bg-card p-5 text-sm">
        <h2 className="font-bold">Angebote & Aktionen per E-Mail</h2>
        <p className="mt-2 text-muted">{INFLUENCER_MARKETING_TEXT}</p>
        <form action={influencerMarketingAction} className="mt-4">
          <input name="granted" type="hidden" value={granted ? "0" : "1"} />
          <button className="inline-flex h-10 items-center rounded-full border border-accent px-5 font-bold text-accent transition hover:bg-accent hover:text-black" type="submit">
            {granted ? "Einwilligung widerrufen" : "Einwilligen"}
          </button>
          <span className="ml-3 text-muted">{granted ? "aktiv" : "nicht erteilt"}</span>
        </form>
      </section>
    </div>
  );
}
