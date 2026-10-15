"use client";

import Link from "next/link";
import { useState } from "react";
import { INFLUENCER_MARKETING_TEXT, normalizeCode } from "@/lib/influencer-rules";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 aria-[invalid=true]:border-red-500";

export function InfluencerForm({ platforms, followers }: { platforms: string[]; followers: string[] }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInvalid([]);
    setState("sending");
    try {
      const res = await fetch("/api/influencer", { method: "POST", body: new FormData(e.currentTarget) });
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
        <h2 className="t-h2 mt-4">Bewerbung ist raus.</h2>
        <p className="t-lead mx-auto mt-3 max-w-md">Danke! Wir schauen uns deinen Kanal an. Sobald du freigeschaltet bist, bekommst du eine E-Mail mit dem Link zu deinem Dashboard.</p>
        <Link className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-8 font-bold text-black transition hover:bg-accent-dark" href="/products">
          Zum Shop
        </Link>
      </div>
    );
  }

  const bad = (k: string) => invalid.includes(k);
  return (
    <form className="grid gap-4 rounded-[2rem] border border-accent/30 bg-card p-6 sm:grid-cols-2 sm:p-10" onSubmit={submit}>
      <div className="sm:col-span-2">
        <p className="t-eyebrow">Bewerbung</p>
        <h2 className="t-h2 mt-2">Du und dein Kanal</h2>
      </div>
      <label className="grid gap-1.5 text-sm">
        Vor- und Nachname *
        <input aria-invalid={bad("name")} autoComplete="name" className={field} maxLength={100} name="name" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Künstler- / Kanalname *
        <input aria-invalid={bad("alias")} className={field} maxLength={80} name="alias" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        E-Mail *
        <input aria-invalid={bad("email")} autoComplete="email" className={field} maxLength={200} name="email" required type="email" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Telefon (optional)
        <input autoComplete="tel" className={field} maxLength={40} name="phone" type="tel" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Hauptplattform *
        <select aria-invalid={bad("platform")} className={field} defaultValue="" name="platform" required>
          <option disabled value="">
            Bitte wählen
          </option>
          {platforms.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm">
        Follower *
        <select aria-invalid={bad("followers")} className={field} defaultValue="" name="followers" required>
          <option disabled value="">
            Bitte wählen
          </option>
          {followers.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Link zu deinem Kanal *
        <input aria-invalid={bad("channelUrl")} className={field} maxLength={300} name="channelUrl" placeholder="https://www.tiktok.com/@deinname" required type="url" />
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Wunsch-Code *<span className="text-muted">(3–20 Zeichen, nur Buchstaben und Zahlen – z. B. MAX10)</span>
        <input aria-invalid={bad("wishCode")} autoCapitalize="characters" className={`${field} font-bold uppercase tracking-wider`} maxLength={20} name="wishCode" onChange={(e) => setCode(normalizeCode(e.target.value))} required value={code} />
      </label>

      <div className="mt-4 sm:col-span-2">
        <h3 className="t-h3">Für deine Provisionsgutschrift</h3>
        <p className="mt-1 text-muted text-sm">Wir rechnen monatlich per Gutschrift ab – dafür brauchen wir deine Anschrift. Bankverbindung und Steuernummer kannst du später im Dashboard eintragen.</p>
      </div>
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
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input className="mt-1 size-4 accent-accent" defaultChecked name="smallBusiness" type="checkbox" />
        <span>Ich bin Kleinunternehmer:in nach § 19 UStG (keine Umsatzsteuer auf die Provision). Ohne Häkchen rechnen wir zzgl. 19 % USt. ab.</span>
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        Nachricht (optional)
        <textarea className={`${field} h-24 py-3`} maxLength={1500} name="message" placeholder="z. B. Content-Ideen, weitere Kanäle" />
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
          gelesen und bin einverstanden, dass meine Angaben zur Bearbeitung der Bewerbung und zur Abrechnung gespeichert werden. *
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm sm:col-span-2">
        <input className="mt-1 size-4 accent-accent" name="marketing" type="checkbox" />
        <span>
          <b>Angebote & Aktionen erhalten:</b> {INFLUENCER_MARKETING_TEXT.replace(/^Ja, /, "")}
        </span>
      </label>
      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <button className="anim-shine relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-accent px-10 font-bold text-black text-lg transition hover:bg-accent-dark disabled:opacity-60" disabled={state === "sending"} type="submit">
          {state === "sending" ? "Wird gesendet …" : "Bewerbung senden"}
        </button>
        <p className="mt-3 text-muted text-xs">* Pflichtfelder. Die Freischaltung erfolgt nach unserer Prüfung.</p>
      </div>
    </form>
  );
}
