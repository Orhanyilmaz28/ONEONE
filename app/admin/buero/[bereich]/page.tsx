import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader, btnSecondary } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { can } from "@/lib/office/roles";

export const metadata: Metadata = { title: "Büroverwaltung" };

/** Menüpunkte der nächsten Phasen – sichtbar, aber noch ohne Funktion (Freigabe von Phase 3B/3C nötig) */
const SOON: Record<string, { title: string; phase: string; text: string; exportType?: string }> = {
  lieferscheine: { title: "Lieferscheine", phase: "3B", text: "Lieferscheine für einzelne oder mehrere Bestellungen drucken." },
  versandlisten: { title: "Versandlisten", phase: "3B", text: "Tägliche Versandlisten zum Abhaken.", exportType: "versand" },
  sammellisten: { title: "Artikel-Sammellisten", phase: "3B", text: "Welche Sorten in welcher Menge (Dosen, Trays, Paletten) zusammengestellt werden müssen.", exportType: "sammel" },
  tagesberichte: { title: "Tagesberichte", phase: "3B", text: "Tagesabschluss mit Bestellungen, Umsatz und Mengen.", exportType: "tag" },
  exporthistorie: { title: "Exporthistorie", phase: "3C", text: "Wer hat wann was exportiert, mit Schutz vor doppelten Exporten. Bis dahin stehen Exporte im Sicherheitsprotokoll." },
};

export default async function SoonPage({ params }: { params: Promise<{ bereich: string }> }) {
  const me = await requireOffice();
  const item = SOON[(await params).bereich];
  if (!item) notFound();
  return (
    <>
      <PageHeader description={item.text} title={item.title} />
      <EmptyState title={`Kommt mit Phase ${item.phase}`}>
        <p>Dieser Bereich wird erst nach Freigabe von Phase {item.phase} gebaut.</p>
        {item.exportType && can(me.role, "office.export") ? (
          <Link className={`${btnSecondary} mt-5`} href={`/admin/buero/export?art=${item.exportType}&zeitraum=heute&vorschau=1`}>
            Schon jetzt als Excel-Export
          </Link>
        ) : null}
      </EmptyState>
    </>
  );
}
