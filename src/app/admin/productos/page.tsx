import { db } from "@/lib/db";
import { getCategories, toProductView } from "@/lib/services/catalog";
import { ProductsManager } from "@/components/admin/products-manager";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Productos" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const [rows, categories] = await Promise.all([
    db.product.findMany({ include: { category: true, variants: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] }),
    getCategories({ includeInactive: true }),
  ]);
  return (
    <>
      <PageHeader title="Productos" description="Todo lo que CORTANA puede ofrecer. Los sinónimos mejoran el reconocimiento por voz." />
      <ProductsManager
        initial={JSON.parse(JSON.stringify(rows.map((r) => ({ ...toProductView(r), rawAvailable: r.available }))))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      />
    </>
  );
}
