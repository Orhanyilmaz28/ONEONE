import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountAccess } from "@/lib/customer-auth";

export const metadata: Metadata = { title: { default: "Mein Konto", template: "%s · Mein Konto · EXSTASE Energy" }, robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { allowed, preview } = await accountAccess();
  // Ausgeschaltet: für Kund:innen gibt es diesen Bereich nicht (Admins sehen eine Vorschau)
  if (!allowed) notFound();
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6 lg:pt-12">
      {preview ? (
        <p className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900" role="note">
          <b>Vorschau:</b> Kundenkonten sind noch ausgeschaltet – nur du siehst diesen Bereich, weil du im Dashboard angemeldet bist.{" "}
          <Link className="underline underline-offset-2" href="/admin/kunden">
            Im Dashboard einschalten
          </Link>
        </p>
      ) : null}
      {children}
    </div>
  );
}
