"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowIcon, CheckIcon } from "./icons";

export function Newsletter({ dark }: { dark?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "pending" | "error">("idle");
  const [message, setMessage] = useState("");
  // eindeutige IDs – das Formular steht auf manchen Seiten zweimal
  const id = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("loading");
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // „website“ ist ein unsichtbares Feld gegen Spam-Bots
      body: JSON.stringify({ email: form.get("email"), website: form.get("website") }),
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json().catch(() => null)) as { pending?: boolean } | null;
      setState(data?.pending ? "pending" : "done");
      return;
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setMessage(data?.error ?? "Das hat nicht geklappt – bitte später erneut versuchen.");
    setState("error");
  }

  if (state === "pending") {
    return (
      <p className="inline-flex items-start gap-2 font-medium" role="status">
        <CheckIcon className="mt-1 size-4 shrink-0" /> Fast geschafft! Bitte bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben.
      </p>
    );
  }

  if (state === "done") {
    return (
      <p className="inline-flex items-center gap-2 font-medium" role="status">
        <CheckIcon /> Danke, du bist eingetragen! Wir melden uns bald per E-Mail.
      </p>
    );
  }

  return (
    <form className="w-full max-w-md" onSubmit={onSubmit}>
      <div
        className={`flex items-center rounded-full border p-1.5 pl-5 transition focus-within:border-ink focus-within:ring-4 ${
          dark ? "border-white/20 bg-white/5 focus-within:border-white/70 focus-within:ring-white/10" : "border-line bg-card focus-within:ring-ink/10"
        }`}
      >
        <label className="sr-only" htmlFor={`${id}-email`}>
          E-Mail-Adresse
        </label>
        <input
          autoComplete="email"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-current/50"
          id={`${id}-email`}
          name="email"
          placeholder="deine@email.de"
          required
          type="email"
        />
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <input autoComplete="off" name="website" tabIndex={-1} type="text" />
        </div>
        <button
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-bold text-black text-sm transition hover:bg-accent-dark disabled:opacity-60"
          disabled={state === "loading"}
          type="submit"
        >
          {state === "loading" ? "Moment …" : "Anmelden"} <ArrowIcon />
        </button>
      </div>
      {state === "error" ? (
        <p className={`mt-2 text-sm ${dark ? "text-white" : "text-accent"}`} role="alert">
          {message}
        </p>
      ) : null}
      <p className={`mt-3 text-xs ${dark ? "text-white/60" : "text-muted"}`}>
        Mit der Anmeldung akzeptierst du unsere{" "}
        <Link className="underline underline-offset-2" href="/datenschutz">
          Datenschutzerklärung
        </Link>
        . Abmeldung jederzeit möglich.
      </p>
    </form>
  );
}
