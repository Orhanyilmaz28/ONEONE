import Link from "next/link";
import { MarkRead } from "./mark-read";
import { requireDealer } from "@/lib/dealer-auth";
import { MESSAGE_LABELS, MESSAGE_TYPES, type MessageType, getMessages, messagesFor } from "@/lib/dealer-messages";

export const metadata = { title: "Nachrichten" };

const ICON: Record<MessageType, string> = { nachricht: "✉", angebot: "★", bestellung: "📦", rechnung: "€" };
const date = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

type Props = { searchParams: Promise<{ typ?: string }> };

export default async function MessagesPage({ searchParams }: Props) {
  const dealer = await requireDealer();
  const { typ } = await searchParams;
  const filter = MESSAGE_TYPES.includes(typ as MessageType) ? (typ as MessageType) : undefined;
  const mine = messagesFor(await getMessages(), dealer);
  const shown = filter ? mine.filter((m) => m.type === filter) : mine;
  const unread = mine.filter((m) => !m.readBy.includes(dealer.id)).map((m) => m.id);
  return (
    <div className="mx-auto max-w-4xl">
      <p className="t-eyebrow">Händlerbereich</p>
      <h1 className="t-h1 mt-3">Nachrichten</h1>
      <p className="t-lead mt-3 max-w-2xl">Angebote, Neuigkeiten und alles zu deinen Bestellungen und Rechnungen – an einem Ort.</p>
      <nav aria-label="Art der Nachricht" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[{ key: "", label: "Alle" }, ...MESSAGE_TYPES.map((t) => ({ key: t, label: t === "angebot" ? "Angebote" : t === "bestellung" ? "Bestellungen" : t === "rechnung" ? "Rechnungen" : "Nachrichten" }))].map((t) => (
          <Link
            aria-current={(filter ?? "") === t.key ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 transition ${(filter ?? "") === t.key ? "border-accent bg-accent font-bold text-black" : "border-line hover:border-accent"}`}
            href={t.key ? `/haendler/portal/nachrichten?typ=${t.key}` : "/haendler/portal/nachrichten"}
            key={t.key || "alle"}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="mt-8 rounded-[1.5rem] border border-line border-dashed bg-card px-6 py-12 text-center text-muted">Hier ist noch nichts – neue Nachrichten erscheinen automatisch.</p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {shown.map((m) => {
            const isNew = !m.readBy.includes(dealer.id);
            return (
              <li className={`rounded-[1.5rem] border bg-card p-5 ${isNew ? "border-accent/60" : "border-line"}`} key={m.id}>
                <div className="flex items-start gap-4">
                  <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full font-black ${m.type === "angebot" ? "bg-accent text-black" : "bg-white/10"}`}>
                    {ICON[m.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-muted text-xs">
                      <span className="font-bold text-accent uppercase tracking-wider">{MESSAGE_LABELS[m.type]}</span>
                      <span>{date(m.createdAt)}</span>
                      {isNew ? <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-[10px] text-black">NEU</span> : null}
                    </p>
                    <h2 className="mt-1 font-bold text-lg">{m.title}</h2>
                    {m.body ? <p className="mt-1 whitespace-pre-line text-ink/80 text-sm">{m.body}</p> : null}
                    {m.link ? (
                      <Link className="mt-3 inline-flex h-9 items-center rounded-full border border-accent px-4 font-bold text-accent text-sm transition hover:bg-accent hover:text-black" href={m.link}>
                        {m.linkLabel ?? "Ansehen"} →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <MarkRead ids={unread} />
    </div>
  );
}
