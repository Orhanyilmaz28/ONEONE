import { AdminShell } from "@/components/admin/shell";
import { requireAdmin } from "@/lib/admin-auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
