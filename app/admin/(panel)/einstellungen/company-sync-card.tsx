"use client";

import { useActionState } from "react";
import { Card, Notice, btn } from "@/components/admin/ui";
import type { CompanyDiff } from "@/lib/settings-defaults";
import { type CompanyApplyState, applyOperatorCompany } from "./company-actions";

const LABEL: Record<string, string> = {
  name: "Firmenname",
  owner: "Vertreten durch",
  street: "Straße",
  city: "PLZ und Ort",
  country: "Land",
  email: "E-Mail",
  phone: "Telefon",
  fax: "Telefax",
  website: "Website",
  vatId: "USt-IdNr.",
  register: "Handelsregister",
};

/** Abgleich: gespeicherte Firmendaten ↔ Betreiberangaben. Übernahme nur auf Klick, mit Bestätigung. */
export function CompanySyncCard({ diff, canSave }: { diff: CompanyDiff[]; canSave: boolean }) {
  const [state, action, pending] = useActionState<CompanyApplyState, FormData>(applyOperatorCompany, {});
  if (!diff.length && !state.ok) return null;
  return (
    <Card className="mb-6" title="Firmendaten-Abgleich">
      {state.ok ? (
        <Notice title="Erledigt" tone="green">
          {state.message}
        </Notice>
      ) : (
        <>
          <p className="text-[13px] text-ink/75">
            Die gespeicherten Firmendaten weichen von den Betreiberangaben vom 21.10.2026 ab. Bitte prüfen und dann übernehmen. Bereits ausgestellte Rechnungen
            und Lieferscheine bleiben unverändert.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 pr-4 font-medium">Angabe</th>
                  <th className="py-1.5 pr-4 font-medium">Jetzt gespeichert</th>
                  <th className="py-1.5 font-medium">Betreiberangabe</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr className="border-line border-t" key={d.key}>
                    <td className="py-1.5 pr-4">{LABEL[d.key] ?? d.key}</td>
                    <td className="py-1.5 pr-4 text-ink/60">{d.stored || "—"}</td>
                    <td className="py-1.5 font-medium">{d.expected || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Notice title="Vor dem Übernehmen" tone="amber">
              Geschäftsführer und Registerangaben bitte mit einem aktuellen Handelsregisterauszug vergleichen. Vorher im Dashboard unter „Datensicherung“ auf
              „Jetzt sichern“ klicken.
            </Notice>
          </div>
          <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input name="bestaetigt" required type="checkbox" value="1" />
              Ich habe die Angaben geprüft und vorher gesichert.
            </label>
            <button className={btn} disabled={!canSave || pending} type="submit">
              {pending ? "Wird übernommen …" : "Betreiberangaben übernehmen"}
            </button>
          </form>
          {state.error ? <p className="mt-2 text-[13px] text-red-700">{state.error}</p> : null}
        </>
      )}
    </Card>
  );
}
