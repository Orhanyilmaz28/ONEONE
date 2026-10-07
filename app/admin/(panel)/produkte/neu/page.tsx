import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { catalog } from "@/lib/catalog";
import { ContentEditor } from "../content-editor";
import { BackLink } from "../product-nav";

export const metadata: Metadata = { title: "Neues Produkt" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <BackLink />
      <PageHeader
        description="Name, Preis und am besten ein paar Bilder – mehr braucht es nicht. Alles andere kannst du jederzeit ergänzen oder ändern."
        title="Neues Produkt"
      />
      <ContentEditor
        collections={catalog.collections.map((c) => ({ handle: c.handle, title: c.title }))}
        initial={{
          title: "",
          subtitle: "",
          description: "",
          images: [],
          collections: [],
          highlights: "",
          capacity: "",
          absorbency: "",
          packSize: "1",
          options: [{ name: "Größe", values: "S, M, L, XL" }],
        }}
        mode="create"
      />
    </>
  );
}
