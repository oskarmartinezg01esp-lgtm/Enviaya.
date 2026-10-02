import { getCategories } from "@/lib/services/catalog";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Categorías" };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await getCategories({ includeInactive: true });
  return (
    <>
      <PageHeader title="Categorías" description="Crea, edita, ordena y activa las categorías del catálogo." />
      <CategoriesManager initial={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, description: c.description, active: c.active, count: c._count.products }))} />
    </>
  );
}
