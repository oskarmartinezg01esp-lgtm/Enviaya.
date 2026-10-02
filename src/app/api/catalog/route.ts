import { apiRoute } from "@/lib/api";
import { getCatalog, getCategories } from "@/lib/services/catalog";

export const GET = apiRoute(async () => {
  const [products, categories] = await Promise.all([getCatalog(), getCategories()]);
  return { products, categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon })) };
});
