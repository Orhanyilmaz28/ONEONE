import { AdminShell } from "@/components/admin/shell";
import { requireOffice } from "@/lib/admin-auth";
import { ROLE_LABEL, can } from "@/lib/office/roles";
import { OfficeTabs } from "./tabs";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const me = await requireOffice();
  const staff = me.role !== "admin";
  return (
    <AdminShell navOnly={staff ? ["/admin/buero"] : undefined} who={staff ? `${me.name} (${ROLE_LABEL[me.role]})` : undefined}>
      <OfficeTabs canExport={can(me.role, "office.export")} canHistory={can(me.role, "office.history")} />
      {children}
    </AdminShell>
  );
}
