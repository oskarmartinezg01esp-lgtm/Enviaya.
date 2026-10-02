import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalize, tokenize, sameWord } from "@/lib/text";

export type ProductOption = {
  id: string;
  name: string;
  type: "remove" | "extra";
  priceCents: number;
};

export type ProductView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCents: number;
  category: { id: string; slug: string; name: string; icon: string | null };
  available: boolean;
  stock: number | null;
  ingredients: string[];
  allergens: string[];
  tags: string[];
  synonyms: string[];
  options: ProductOption[];
  variants: { id: string; name: string; priceCents: number; isDefault: boolean }[];
  isCombo: boolean;
  isOffer: boolean;
  isFeatured: boolean;
  popularity: number;
};

const productInclude = {
  category: true,
  variants: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function toProductView(p: ProductWithRelations): ProductView {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    category: { id: p.category.id, slug: p.category.slug, name: p.category.name, icon: p.category.icon },
    available: p.available && (p.stock === null || p.stock > 0),
    stock: p.stock,
    ingredients: p.ingredients,
    allergens: p.allergens,
    tags: p.tags,
    synonyms: p.synonyms,
    options: (Array.isArray(p.options) ? p.options : []) as unknown as ProductOption[],
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents, isDefault: v.isDefault })),
    isCombo: p.isCombo,
    isOffer: p.isOffer,
    isFeatured: p.isFeatured,
    popularity: p.popularity,
  };
}

/** Precio "desde": la variante por defecto o el precio base. */
export function basePrice(p: Pick<ProductView, "priceCents" | "variants">): number {
  const def = p.variants.find((v) => v.isDefault) ?? p.variants[0];
  return def ? def.priceCents : p.priceCents;
}

export async function getCategories(opts: { includeInactive?: boolean } = {}) {
  return db.category.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

// Caché corta en memoria del catálogo para el motor de lenguaje natural.
let cache: { at: number; products: ProductView[] } | null = null;
const CACHE_MS = 15_000;

export async function getCatalog(opts: { fresh?: boolean } = {}): Promise<ProductView[]> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.products;
  const rows = await db.product.findMany({
    include: productInclude,
    where: { category: { active: true } },
    orderBy: [{ popularity: "desc" }, { name: "asc" }],
  });
  const products = rows.map(toProductView);
  cache = { at: Date.now(), products };
  return products;
}

export function invalidateCatalogCache() {
  cache = null;
}

export async function getProduct(idOrSlug: string): Promise<ProductView> {
  const p = await db.product.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: productInclude,
  });
  if (!p) throw new AppError("NOT_FOUND", "Ese producto no existe en el catálogo.");
  return toProductView(p);
}

export type SearchParams = {
  query?: string;
  category?: string;
  maxPriceCents?: number;
  tags?: string[];
  onlyAvailable?: boolean;
  limit?: number;
};

/** Puntuación de relevancia simple, tolerante a plurales y acentos. */
export function scoreProduct(p: ProductView, query: string): number {
  const q = tokenize(query).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (q.length === 0) return 0;
  const name = tokenize(p.name);
  const syn = p.synonyms.flatMap(tokenize);
  const tags = p.tags.flatMap(tokenize);
  const cat = tokenize(p.category.name);
  const ingredients = p.ingredients.flatMap(tokenize);
  const desc = tokenize(p.description);
  let score = 0;
  for (const t of q) {
    if (name.some((w) => sameWord(w, t))) score += 5;
    else if (syn.some((w) => sameWord(w, t))) score += 4;
    else if (tags.some((w) => sameWord(w, t))) score += 3;
    else if (cat.some((w) => sameWord(w, t))) score += 3;
    else if (ingredients.some((w) => sameWord(w, t))) score += 2;
    else if (desc.some((w) => sameWord(w, t))) score += 1;
  }
  if (normalize(p.name) === normalize(query)) score += 10;
  return score;
}

const STOPWORDS = new Set([
  "que", "con", "sin", "una", "uno", "unos", "unas", "los", "las", "del", "para", "por", "algo",
  "quiero", "busca", "buscar", "tienes", "teneis", "hay", "opciones", "pedir", "comida", "cortana",
  "favor", "porfa", "menos", "euros", "euro", "barato", "barata", "me", "apetece",
]);

export async function searchProducts(params: SearchParams): Promise<ProductView[]> {
  const all = await getCatalog();
  const limit = Math.min(params.limit ?? 8, 30);
  let list = all.filter((p) => (params.onlyAvailable === false ? true : p.available));
  if (params.category) {
    const c = normalize(params.category);
    list = list.filter((p) => p.category.slug === c || normalize(p.category.name) === c);
  }
  if (params.maxPriceCents) list = list.filter((p) => basePrice(p) <= params.maxPriceCents!);
  if (params.tags?.length) {
    const tags = params.tags.map(normalize);
    list = list.filter((p) => tags.every((t) => p.tags.some((pt) => sameWord(normalize(pt), t))));
  }
  if (params.query && params.query.trim()) {
    const scored = list
      .map((p) => ({ p, s: scoreProduct(p, params.query!) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.p.popularity - a.p.popularity);
    return scored.slice(0, limit).map((x) => x.p);
  }
  return list.slice(0, limit);
}

export type RecommendParams = {
  userId?: string;
  maxPriceCents?: number;
  filling?: boolean;
  query?: string;
  limit?: number;
};

/**
 * Recomendaciones basadas en precio, popularidad, historial y preferencias.
 * Nunca inventa productos: siempre parte del catálogo real.
 */
export async function recommendProducts(params: RecommendParams): Promise<ProductView[]> {
  const all = (await getCatalog()).filter((p) => p.available);
  const history = new Map<string, number>();
  const prefs: string[] = [];
  if (params.userId) {
    const items = await db.orderItem.groupBy({
      by: ["productId"],
      where: { order: { userId: params.userId, status: { not: "CANCELADO" } } },
      _sum: { quantity: true },
    });
    for (const i of items) history.set(i.productId, i._sum.quantity ?? 0);
    const p = await db.preference.findMany({ where: { userId: params.userId } });
    prefs.push(...p.map((x) => normalize(x.value)));
  }
  let list = all;
  if (params.maxPriceCents) list = list.filter((p) => basePrice(p) <= params.maxPriceCents!);
  if (params.query) {
    const withScore = list.filter((p) => scoreProduct(p, params.query!) > 0);
    if (withScore.length) list = withScore;
  }
  const scored = list.map((p) => {
    let s = p.popularity / 10;
    if (p.isFeatured) s += 3;
    if (p.isOffer) s += 2;
    s += (history.get(p.id) ?? 0) * 2;
    if (prefs.some((v) => normalize(p.name).includes(v))) s += 4;
    if (params.filling) {
      if (p.isCombo) s += 8;
      if (p.tags.includes("contundente")) s += 6;
      if (p.category.slug === "bebidas" || p.category.slug === "postres") s -= 10;
    }
    if (params.maxPriceCents) s += (params.maxPriceCents - basePrice(p)) / 400; // cuanto más margen, mejor
    return { p, s };
  });
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, params.limit ?? 4)
    .map((x) => x.p);
}
