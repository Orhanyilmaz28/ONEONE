"use client";

import { type ReactNode, useOptimistic, useTransition } from "react";
import { formatDateTime } from "@/components/admin/ui";
import { ConfirmButton, Toast, useToast } from "../bewertungen/feedback";
import { deleteSubscriberAction, type NewsletterActionResult } from "./actions";

export type SubscriberRow = { email: string; createdAt: string; status?: "confirmed" | "pending" | "legacy" };

const STATUS: Record<NonNullable<SubscriberRow["status"]>, { label: string; cls: string }> = {
  confirmed: { label: "Bestätigt", cls: "bg-emerald-50 text-emerald-800" },
  pending: { label: "Wartet", cls: "bg-amber-50 text-amber-900" },
  legacy: { label: "Ohne Bestätigung", cls: "bg-ink/5 text-ink/60" },
};

function StatusPill({ status }: { status?: SubscriberRow["status"] }) {
  if (!status) return null;
  const s = STATUS[status];
  return <span className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle font-medium text-[11.5px] ${s.cls}`}>{s.label}</span>;
}

/**
 * Liste der Anmeldungen mit Löschen (Karten auf dem Handy, Tabelle ab Tablet).
 * Bleibt auch bei leerer Liste stehen (zeigt dann `empty`), damit die Lösch-Meldung sichtbar bleibt.
 */
export function SubscriberList({ subscribers, empty }: { subscribers: SubscriberRow[]; empty: ReactNode }) {
  const { toast, show, hide } = useToast();
  const [pending, startTransition] = useTransition();
  // Gelöschte Zeile verschwindet sofort; der Server bestätigt im Hintergrund
  const [list, remove] = useOptimistic(subscribers, (current: SubscriberRow[], email: string) => current.filter((s) => s.email !== email));

  function onDelete(email: string) {
    startTransition(async () => {
      remove(email);
      const res = await deleteSubscriberAction(email).catch((): NewsletterActionResult => ({ ok: false, error: "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung." }));
      show(res.ok ? { tone: "success", message: res.message } : { tone: "error", message: res.error });
    });
  }

  if (!list.length) {
    return (
      <>
        {empty}
        <Toast onClose={hide} toast={toast} />
      </>
    );
  }

  return (
    <>
      {/* Handy: Karten */}
      <ul aria-busy={pending} className="space-y-2 md:hidden">
        {list.map((s) => (
          <li className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-4 py-3.5" key={s.email}>
            <div className="min-w-0">
              <p className="truncate font-medium text-[15px]">
                {s.email}
                <StatusPill status={s.status} />
              </p>
              <p className="text-[13px] text-muted tabular-nums">angemeldet am {formatDateTime(s.createdAt)}</p>
            </div>
            <div>
              <ConfirmButton onConfirm={() => onDelete(s.email)} srContext={s.email} />
            </div>
          </li>
        ))}
      </ul>

      {/* Ab Tablet: schlanke Tabelle (nur 3 Spalten – passt auch neben die Hinweis-Spalte) */}
      <div aria-busy={pending} className="hidden rounded-3xl border border-line bg-white px-6 pb-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)] md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-line border-b text-[12px] text-muted uppercase tracking-[0.08em]">
              <th className="w-full whitespace-nowrap py-3 pr-4 font-medium" scope="col">
                E-Mail-Adresse
              </th>
              <th className="whitespace-nowrap py-3 pr-4 font-medium" scope="col">
                Angemeldet am
              </th>
              <th className="py-3" scope="col">
                <span className="sr-only">Aktion</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((s) => (
              <tr className="transition hover:bg-ink/[0.025]" key={s.email}>
                {/* max-w-0 + w-full: E-Mail nimmt den restlichen Platz und wird bei Bedarf gekürzt */}
                <td className="w-full max-w-0 truncate py-3 pr-4 font-medium" title={s.email}>
                  {s.email}
                  <StatusPill status={s.status} />
                </td>
                <td className="whitespace-nowrap py-3 pr-4 text-ink/80 tabular-nums">{formatDateTime(s.createdAt)}</td>
                <td className="whitespace-nowrap py-2 text-right">
                  <ConfirmButton compact onConfirm={() => onDelete(s.email)} srContext={s.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Toast onClose={hide} toast={toast} />
    </>
  );
}
