import type { Metadata } from "next";
import { deleteMessageAction } from "./actions";
import { Compose } from "./compose";
import { DealerTabs } from "@/components/admin/dealer-tabs";
import { Badge, EmptyState, PageHeader, formatDateTime } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { MESSAGE_LABELS, getMessages } from "@/lib/dealer-messages";
import { getDealers } from "@/lib/dealer-store";

export const metadata: Metadata = { title: "Händler-Nachrichten" };

export default async function DealerMessagesAdminPage() {
  await requireAdmin();
  const [messages, dealers] = await Promise.all([getMessages(), getDealers()]);
  const approved = dealers.filter((d) => d.status === "freigegeben");
  const name = (id: string) => (id === "alle" ? "Alle Händler" : (dealers.find((d) => d.id === id)?.company ?? "Gelöschter Händler"));
  return (
    <>
      <PageHeader
        description="Nachrichten und Angebote erscheinen im Händlerbereich unter „Nachrichten“ (mit Zähler im Menü). Bestell- und Rechnungsnachrichten entstehen automatisch."
        title="Händler"
      />
      <DealerTabs active="/admin/haendler/nachrichten" />
      {approved.length ? (
        <Compose dealers={approved.map((d) => ({ id: d.id, company: d.company, marketing: Boolean(d.marketing?.granted) }))} />
      ) : (
        <EmptyState title="Noch keine freigegebenen Händler">Sobald du Händler freigibst, kannst du ihnen hier Nachrichten und Angebote senden.</EmptyState>
      )}
      <h2 className="mt-10 mb-3 font-medium text-[15px]">Gesendet ({messages.length})</h2>
      {messages.length === 0 ? (
        <p className="text-muted text-sm">Noch keine Nachrichten.</p>
      ) : (
        <ul className="grid gap-3">
          {messages.slice(0, 200).map((m) => (
            <li className="flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-card p-4" key={m.id}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <Badge tone={m.type === "angebot" ? "green" : m.type === "rechnung" ? "blue" : m.type === "bestellung" ? "amber" : "neutral"}>{MESSAGE_LABELS[m.type]}</Badge>
                  {formatDateTime(m.createdAt)} · an {name(m.to)} · {m.to === "alle" ? `gelesen von ${m.readBy.length} von ${approved.length}` : m.readBy.length ? "gelesen" : "ungelesen"}
                </p>
                <p className="mt-1 font-medium">{m.title}</p>
                {m.body ? <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] text-muted">{m.body}</p> : null}
              </div>
              <form action={deleteMessageAction}>
                <input name="id" type="hidden" value={m.id} />
                <button className="text-[13px] text-muted underline hover:text-red-700" type="submit">
                  Löschen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
