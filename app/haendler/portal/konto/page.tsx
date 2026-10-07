import Link from "next/link";
import { dealerLogoutAction } from "../../actions";
import { requireDealer } from "@/lib/dealer-auth";

export const metadata = { title: "Konto & Dokumente" };

export default async function AccountPage() {
  const d = await requireDealer();
  const rows: [string, string][] = [
    ["Firma", d.company],
    ["Ansprechperson", d.contact],
    ["E-Mail (Login)", d.email],
    ["Telefon", d.phone || "–"],
    ["Adresse", `${d.street}, ${d.zip} ${d.city}`],
    ["USt-IdNr.", d.vatId || "–"],
    ["Branche", d.branch],
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Konto & Dokumente</h1>

      <section className="mt-8 rounded-[2rem] border border-line bg-card p-6 sm:p-8">
        <h2 className="t-h3">Firmendaten</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted text-xs uppercase tracking-wider">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-muted text-sm">
          Daten ändern? Schreib uns kurz an{" "}
          <a className="text-accent underline" href="mailto:hello@exstase.com?subject=Änderung%20meiner%20Händlerdaten">
            hello@exstase.com
          </a>
          .
        </p>
      </section>

      <section className="mt-6 rounded-[2rem] border border-accent/30 bg-card p-6 sm:p-8">
        <h2 className="t-h3">Gewerbenachweis</h2>
        <p className="mt-3 flex items-center gap-3">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent font-black text-black">✓</span>
          <span>
            <b>Geprüft und freigegeben</b>
            <span className="block text-muted text-sm">{d.proof ? `Hinterlegt: ${d.proof.name}` : "Hinterlegt"}</span>
          </span>
        </p>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link className="inline-flex h-12 items-center rounded-full bg-accent px-7 font-bold text-black transition hover:bg-accent-dark" href="/palette">
          Palette anfragen
        </Link>
        <form action={dealerLogoutAction}>
          <button className="text-muted underline transition hover:text-accent" type="submit">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}
