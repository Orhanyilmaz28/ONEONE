import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getAiOverrides } from "@/lib/ai-media-store";
import { collectMedia } from "./data";
import { MediaGrid } from "./media-grid";

export const metadata: Metadata = { title: "KI-Kennzeichnung" };

export default async function AiMediaPage() {
  await requireAdmin();
  const items = await collectMedia(await getAiOverrides());
  return (
    <>
      <PageHeader
        description="Hier legst du für jedes Bild und Video fest, ob es echt ist oder mit KI erstellt bzw. bearbeitet wurde. Ein Klick genügt – die Kennzeichnung erscheint sofort im ganzen Shop."
        title="KI-Kennzeichnung"
      />
      <div className="mb-6">
        <Notice title="So funktioniert’s" tone="blue">
          <b>Echt</b> = echtes Foto oder Video, keine Kennzeichnung. <b>KI-generiert</b> = komplett mit KI erstellt.{" "}
          <b>KI-bearbeitet</b> = echte Aufnahme, aber mit KI verändert (z. B. Hintergrund, Person, Retusche). KI-Medien bekommen im Shop eine kleine
          Kennzeichnung direkt am Bild, und im Footer erscheint ein kurzer allgemeiner Hinweis. <b>Echte Produktfotos bitte auf „Echt“ lassen.</b>
        </Notice>
      </div>
      <MediaGrid items={items} />
    </>
  );
}
