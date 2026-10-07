import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/admin/ui";
import { Icon } from "./icons";

export type SetupItem = {
  id: string;
  title: string;
  done: boolean;
  /** Text auf dem Badge, z. B. „Erledigt“, „Offen“, „Testmodus“ */
  status?: string;
  /** Was ist das – und warum ist es wichtig? (kurz, für Einsteiger) */
  explanation: ReactNode;
  /** Was ist zu tun? Wird nur gezeigt, solange der Punkt offen ist */
  todo?: ReactNode;
  /** Aktueller Wert, z. B. die eingetragene Adresse */
  detail?: ReactNode;
  /** Weiterführender Link; `external` öffnet in einem neuen Tab (z. B. Anleitungen auf GitHub) */
  link?: { href: string; label: string; external?: boolean };
};

/** Anleitungen (liegen im Repository unter shop/docs) */
export const GUIDES = {
  online: "https://github.com/Orhanyilmaz28/chatbot/blob/main/shop/docs/ONLINE-STELLEN.md",
  dashboard: "https://github.com/Orhanyilmaz28/chatbot/blob/main/shop/docs/DASHBOARD.md",
} as const;

const linkClass =
  "rounded-md font-medium text-ink underline decoration-ink/25 underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-2 focus-visible:ring-ink/30";

/** Link, der in einem neuen Tab öffnet – mit sichtbarem Pfeil und Hinweis für Screenreader */
function ExternalLink({ href, children, className = linkClass }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} rel="noopener noreferrer" target="_blank">
      {children}
      <span aria-hidden> ↗</span>
      <span className="sr-only"> (öffnet in neuem Tab)</span>
    </a>
  );
}

function Item({ item }: { item: SetupItem }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-card p-4 sm:gap-4 sm:p-5">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${item.done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200/70"}`}
      >
        <Icon className="size-4" name={item.done ? "check" : "clock"} strokeWidth={item.done ? 2.2 : 1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-medium text-[15px]">{item.title}</h3>
          <Badge tone={item.done ? "green" : "amber"}>
            <span className="sr-only">Status: </span>
            {item.status ?? (item.done ? "Erledigt" : "Offen")}
          </Badge>
        </div>
        <p className="mt-1 text-[14px] text-muted leading-relaxed">{item.explanation}</p>
        {item.detail ? <p className="mt-1.5 break-words text-[13px] text-ink/70">{item.detail}</p> : null}
        {!item.done && item.todo ? (
          <div className="mt-3 rounded-xl bg-paper px-3.5 py-3 text-[14px] sm:px-4 text-ink/80 leading-relaxed ring-1 ring-line">
            <span className="font-medium text-ink">So geht’s: </span>
            {item.todo}
          </div>
        ) : null}
        {item.link?.external ? (
          <ExternalLink
            className="mt-3 inline-flex items-center gap-1 rounded-md font-medium text-[14px] text-ink underline decoration-ink/20 underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-2 focus-visible:ring-ink/30"
            href={item.link.href}
          >
            {item.link.label}
          </ExternalLink>
        ) : item.link ? (
          <Link
            className="mt-3 inline-flex items-center gap-1 rounded-md font-medium text-[14px] text-ink underline decoration-ink/20 underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-2 focus-visible:ring-ink/30"
            href={item.link.href}
          >
            {item.link.label}
            <Icon className="size-3.5" name="chevron" strokeWidth={2} />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Checkliste „Ist mein Shop bereit für echte Kund:innen?“ */
export function SetupCheck({ items }: { items: SetupItem[] }) {
  const done = items.filter((i) => i.done).length;
  const all = done === items.length;
  const percent = Math.round((done / items.length) * 100);
  const list = (
    <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <Item item={item} key={item.id} />
      ))}
    </ol>
  );

  return (
    <Card
      actions={
        <span className="text-[13px] text-muted tabular-nums">
          {done} von {items.length} erledigt
        </span>
      }
      title="Startklar-Check"
    >
      <div className="mb-5">
        <p className="text-[15px] text-ink/80 leading-relaxed">
          {all ? (
            "Alles erledigt – dein Shop ist bereit für echte Bestellungen."
          ) : (
            <>
              Diese Punkte sollten erledigt sein, bevor dein Shop für echte Kund:innen online geht. Die <ExternalLink href={GUIDES.online}>Anleitung „Online stellen“</ExternalLink>{" "}
              erklärt jeden Schritt.
            </>
          )}{" "}
          Fragen zu einzelnen Bereichen des Dashboards beantwortet die <ExternalLink href={GUIDES.dashboard}>Dashboard-Hilfe</ExternalLink>.
        </p>
        <div
          aria-label="Fortschritt"
          aria-valuemax={items.length}
          aria-valuemin={0}
          aria-valuenow={done}
          aria-valuetext={`${done} von ${items.length} erledigt`}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-cream"
          role="progressbar"
        >
          <div className={`h-full rounded-full ${all ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {all ? (
        // Wenn alles erledigt ist, nimmt die Liste keinen Platz mehr weg
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
            <Icon className="size-3.5 transition group-open:rotate-90" name="chevron" strokeWidth={2} />
            Alle Punkte ansehen
          </summary>
          <div className="mt-4">{list}</div>
        </details>
      ) : (
        list
      )}
    </Card>
  );
}
