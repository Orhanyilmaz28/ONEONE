"use client";

import Link from "next/link";
import { useState } from "react";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 aria-[invalid=true]:border-red-500";

export function HaendlerForm({ branches, volumes }: { branches: string[]; volumes: string[] }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInvalid([]);
    setState("sending");
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    try {
      const res = await fetch("/api/haendler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, consent: f.get("consent") === "on" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; fields?: string[] };
      if (!res.ok) {
        setError(json.error ?? "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.");
        setInvalid(json.fields ?? []);
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Keine Verbindung. Bitte versuche es gleich noch einmal.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-[2rem] border border-accent/40 bg-card p-8 text-center sm:p-12" role="status">
        <p className="font-black text-5xl text-accent">✓</p>
        <h2 className="t-h2 mt-4">Anfrage ist raus.</h2>
        <p className="t-lead mx-auto mt-3 max-w-md">Danke! Wir prüfen deine Angaben und melden uns bei dir. Bis dahin kannst du dich im Shop umsehen.</p>
        <Link className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-8 font-bold text-black transition hover:bg-accent-dark" href="/products">
          Zum Shop
        </Link>
      </div>
    );
  }

  const bad = (k: string) => invalid.includes(k);
  return (
    <form className="grid gap-4 rounded-[2rem] border border-accent/30 bg-card p-6 sm:grid-cols-2 sm:p-10" noValidate={false} onSubmit={submit}>
      <div className="sm:col-span-2">
        <p className="t-eyebrow">Registrierung</p>
        <h2 className="t-h2 mt-2">Deine Firma</h2>
      </div>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Firma *
        <input aria-invalid={bad("company")} autoComplete="organization" className={field} maxLength={120} name="company" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Ansprechperson *
        <input aria-invalid={bad("contact")} autoComplete="name" className={field} maxLength={100} name="contact" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        USt-IdNr. (optional)
        <input className={field} maxLength={30} name="vatId" placeholder="DE123456789" />
      </label>
      <label className="grid gap-1.5 text-sm">
        E-Mail *
        <input aria-invalid={bad("email")} autoComplete="email" className={field} maxLength={200} name="email" required type="email" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Telefon (optional)
        <input autoComplete="tel" className={field} maxLength={40} name="phone" type="tel" />
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Straße und Hausnummer *
        <input aria-invalid={bad("street")} autoComplete="street-address" className={field} maxLength={120} name="street" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        PLZ *
        <input aria-invalid={bad("zip")} autoComplete="postal-code" className={field} inputMode="numeric" maxLength={5} name="zip" pattern="\d{4,5}" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Ort *
        <input aria-invalid={bad("city")} autoComplete="address-level2" className={field} maxLength={80} name="city" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Branche *
        <select className={field} defaultValue="" name="branch" required>
          <option disabled value="">
            Bitte wählen
          </option>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm">
        Geplante Menge *
        <select className={field} defaultValue="" name="volume" required>
          <option disabled value="">
            Bitte wählen
          </option>
          {volumes.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Nachricht (optional)
        <textarea className={`${field} h-28 py-3`} maxLength={1500} name="message" placeholder="z. B. Wunschsorten, Lieferzeiten, Fragen" />
      </label>
      {/* Spam-Falle: für Menschen unsichtbar */}
      <input aria-hidden autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" tabIndex={-1} />
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input aria-invalid={bad("consent")} className="mt-1 size-4 accent-accent" name="consent" required type="checkbox" />
        <span>
          Ich habe die{" "}
          <Link className="underline" href="/datenschutz" target="_blank">
            Datenschutzerklärung
          </Link>{" "}
          gelesen und bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert werden. *
        </span>
      </label>
      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button className="anim-shine relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-accent px-10 font-bold text-black text-lg transition hover:bg-accent-dark disabled:opacity-60" disabled={state === "sending"} type="submit">
          {state === "sending" ? "Wird gesendet …" : "Anfrage senden"}
        </button>
        <p className="mt-3 text-muted text-xs">* Pflichtfelder. Unverbindlich – die Freischaltung erfolgt nach unserer Prüfung.</p>
      </div>
    </form>
  );
}
