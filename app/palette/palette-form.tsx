"use client";

import { useState } from "react";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

/** Anfrage-Formular: öffnet das E-Mail-Programm mit fertigem Text (bis die Händler-Registrierung online ist) */
export function PaletteForm({ email, paletten, preselect }: { email: string; paletten: { handle: string; title: string }[]; preselect?: string }) {
  const [produkt, setProdukt] = useState(paletten.some((p) => p.handle === preselect) ? (preselect as string) : (paletten[0]?.handle ?? ""));
  const [anzahl, setAnzahl] = useState("1");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const titel = paletten.find((p) => p.handle === produkt)?.title ?? "Palette";
    const body = [
      "Hallo EXSTASE-Team,",
      "",
      `ich interessiere mich für: ${anzahl} × ${titel}`,
      "",
      `Name: ${f.get("name")}`,
      `Firma: ${f.get("firma")}`,
      `E-Mail: ${f.get("mail")}`,
      `Telefon: ${f.get("tel")}`,
      `Lieferort (PLZ/Ort): ${f.get("ort")}`,
      "",
      `${f.get("nachricht") ?? ""}`,
    ].join("\n");
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Palettenanfrage: ${anzahl} × ${titel}`)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  return (
    <section className="pb-20" id="anfrage">
      <form className="grid gap-4 rounded-[2rem] border border-accent/30 bg-card p-6 sm:p-10 lg:grid-cols-2" onSubmit={submit}>
        <div className="lg:col-span-2">
          <p className="t-eyebrow">Anfrage</p>
          <h2 className="t-h2 mt-2">Was darf es sein?</h2>
        </div>
        <label className="grid gap-1.5 text-sm">
          Palette
          <select className={field} onChange={(e) => setProdukt(e.target.value)} value={produkt}>
            {paletten.map((p) => (
              <option key={p.handle} value={p.handle}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Anzahl Paletten
          <select className={field} onChange={(e) => setAnzahl(e.target.value)} value={anzahl}>
            {["1", "2", "3", "4", "5", "mehr als 5"].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Name
          <input autoComplete="name" className={field} name="name" required />
        </label>
        <label className="grid gap-1.5 text-sm">
          Firma
          <input autoComplete="organization" className={field} name="firma" required />
        </label>
        <label className="grid gap-1.5 text-sm">
          E-Mail
          <input autoComplete="email" className={field} name="mail" required type="email" />
        </label>
        <label className="grid gap-1.5 text-sm">
          Telefon (optional)
          <input autoComplete="tel" className={field} name="tel" type="tel" />
        </label>
        <label className="grid gap-1.5 text-sm lg:col-span-2">
          Lieferort (PLZ und Ort)
          <input className={field} name="ort" required />
        </label>
        <label className="grid gap-1.5 text-sm lg:col-span-2">
          Nachricht (optional) – z. B. Wunschsorten für eine Mischpalette
          <textarea className={`${field} h-28 py-3`} name="nachricht" />
        </label>
        <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center">
          <button className="anim-shine relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-accent px-10 font-bold text-black text-lg transition hover:bg-accent-dark" type="submit">
            Anfrage senden
          </button>
          <p className="text-muted text-sm">
            {sent ? "Dein E-Mail-Programm sollte sich geöffnet haben. Falls nicht, schreib uns direkt an " : "Öffnet dein E-Mail-Programm mit fertigem Text. Oder direkt an "}
            <a className="underline" href={`mailto:${email}`}>
              {email}
            </a>
            .
          </p>
        </div>
      </form>
    </section>
  );
}
