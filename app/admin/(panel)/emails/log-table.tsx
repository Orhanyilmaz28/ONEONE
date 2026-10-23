"use client";

import { useState, useTransition } from "react";
import { Badge, Table, btnSecondary, formatDateTime } from "@/components/admin/ui";
import type { MailLogEntry } from "@/lib/mail-log";
import { mailLabel } from "@/lib/mail-types";
import { type MailFormState, resendMail } from "./actions";

function Resend({ id }: { id: string }) {
  const [state, setState] = useState<MailFormState>({});
  const [pending, start] = useTransition();
  if (state.ok) return <span className="text-[13px] text-emerald-800">✓ {state.message}</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <button className={`${btnSecondary} !px-3 !py-1.5 text-[13px]`} disabled={pending} onClick={() => start(async () => setState(await resendMail(id)))} type="button">
        {pending ? "Wird verschickt …" : "Nochmal senden"}
      </button>
      {state.error ? <span className="text-[12.5px] text-red-700">{state.error}</span> : null}
    </span>
  );
}

function Status({ e }: { e: MailLogEntry }) {
  if (e.status === "ok") return <Badge tone="green">Verschickt</Badge>;
  if (e.status === "aus") return <Badge tone="neutral">Aus</Badge>;
  if (e.resentAt) return <Badge tone="amber">Später nachgeschickt</Badge>;
  return <Badge tone="red">Fehler</Badge>;
}

export function LogTable({ entries }: { entries: MailLogEntry[] }) {
  return (
    <Table head={["Zeit", "E-Mail", "An", "Status", ""]}>
      {entries.map((e) => (
        <tr className="align-top" key={e.id}>
          <td className="whitespace-nowrap py-3 pr-4 text-muted">{formatDateTime(e.at)}</td>
          <td className="py-3 pr-4">
            <span className="block font-medium">{mailLabel(e.tag)}</span>
            <span className="block max-w-[22rem] truncate text-[12.5px] text-muted" title={e.subject}>
              {e.subject}
            </span>
          </td>
          <td className="max-w-[14rem] truncate py-3 pr-4" title={e.to}>
            {e.to}
          </td>
          <td className="py-3 pr-4">
            <Status e={e} />
            {e.status === "fehler" && e.error ? <span className="mt-1 block max-w-[18rem] text-[12.5px] text-red-800 leading-snug">{e.error}</span> : null}
          </td>
          <td className="py-3">{e.status === "fehler" && e.retry && !e.resentAt ? <Resend id={e.id} /> : null}</td>
        </tr>
      ))}
    </Table>
  );
}
