import { getCatalog, getCategories } from "@/lib/services/catalog";
import { CatalogBrowser } from "@/components/shop/catalog-browser";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Catálogo" };

export default async function CatalogPage() {
  const [products, categories] = await Promise.all([getCatalog({ fresh: true }), getCategories()]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Catálogo" description="Todo lo que puedes pedirle a CORTANA." />
      <CatalogBrowser products={products} categories={categories.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))} />
    </div>
  );
}
