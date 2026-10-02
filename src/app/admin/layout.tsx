import { requireAdminPage } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: { default: "Admin", template: "%s · Admin CORTANA" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return <AdminShell name={admin.name}>{children}</AdminShell>;
}
