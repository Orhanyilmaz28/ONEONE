"use client";

import { useActionState, useState } from "react";
import { type SendState, sendMessageAction } from "./actions";
import { btn, input, label } from "@/components/admin/ui";

/** Nachricht oder Angebot verfassen */
export function Compose({ dealers }: { dealers: { id: string; company: string; marketing: boolean }[] }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendMessageAction, undefined);
  const [type, setType] = useState("nachricht");
  const consenting = dealers.filter((d) => d.marketing).length;
  return (
    <form action={action} className="grid gap-4 rounded-3xl border border-line bg-card p-6" key={state?.ok ?? "neu"}>
      <h2 className="font-medium text-[15px]">Neue Nachricht</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1.5">
          <span className={label}>An</span>
          <select className={input} defaultValue="alle" name="to">
            <option value="alle">Alle freigegebenen Händler ({dealers.length})</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Art</span>
          <select className={input} name="type" onChange={(e) => setType(e.target.value)} value={type}>
            <option value="nachricht">Nachricht / Info</option>
            <option value="angebot">Angebot / Aktion</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Knopf in der Nachricht</span>
          <select className={input} defaultValue="" name="link">
            <option value="">Kein Knopf</option>
            <option value="preise">Zur Preisliste</option>
            <option value="bestellungen">Meine Bestellungen</option>
            <option value="paesse">Zu den Artikelpässen</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1.5">
        <span className={label}>Betreff</span>
        <input className={input} maxLength={120} name="title" placeholder={type === "angebot" ? "z. B. Aktion: Classic-Palette zu 0,30 €/Dose bis 31.10." : "z. B. Neue Sorten ab sofort bestellbar"} required />
      </label>
      <label className="grid gap-1.5">
        <span className={label}>Text</span>
        <textarea className={`${input} h-36`} maxLength={4000} name="body" />
      </label>
      <label className="flex items-start gap-2 text-[14px]">
        <input className="mt-1" defaultChecked name="email" type="checkbox" />
        <span>
          Zusätzlich per E-Mail benachrichtigen
          <span className="block text-[12px] text-muted">
            {type === "angebot" ? `Angebote gehen per E-Mail nur an Händler mit Werbe-Einwilligung (${consenting} von ${dealers.length}). Im Händlerbereich sehen es alle.` : "Infos (z. B. Lieferzeiten, neue Sorten) gehen an alle gewählten Händler."}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button className={btn} disabled={pending} type="submit">
          {pending ? "Wird gesendet …" : "Senden"}
        </button>
        {state?.ok ? <span className="text-[14px] text-emerald-700">{state.ok}</span> : null}
        {state?.error ? <span className="text-[14px] text-red-700">{state.error}</span> : null}
      </div>
    </form>
  );
}
