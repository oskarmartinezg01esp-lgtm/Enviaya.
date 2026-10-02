import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { invalidateCatalogCache } from "./catalog";
import { audit } from "./audit";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const csv = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean));

export const productSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(500),
  priceCents: z.number().int().min(0).max(100000),
  categoryId: z.string().min(1),
  imageUrl: z
    .string()
    .trim()
    .url()
    .or(z.literal(""))
    .nullish()
    .transform((v) => v || null),
  stock: z.number().int().min(0).nullish(),
  available: z.boolean().default(true),
  ingredients: csv.default([]),
  allergens: csv.default([]),
  tags: csv.default([]),
  synonyms: csv.default([]),
  isCombo: z.boolean().default(false),
  isOffer: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  options: z
    .array(z.object({ id: z.string(), name: z.string().min(1), type: z.enum(["remove", "extra"]), priceCents: z.number().int().min(0) }))
    .default([]),
  variants: z
    .array(z.object({ id: z.string().optional(), name: z.string().min(1).max(40), priceCents: z.number().int().min(0), isDefault: z.boolean().default(false) }))
    .default([]),
});

export async function createProduct(actorId: string, input: unknown) {
  const data = productSchema.parse(input);
  let slug = slugify(data.name);
  if (await db.product.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const { variants, options, ...rest } = data;
  const p = await db.product.create({
    data: {
      ...rest,
      slug,
      options: options as Prisma.InputJsonValue,
      variants: { create: variants.map((v, i) => ({ name: v.name, priceCents: v.priceCents, isDefault: v.isDefault, sortOrder: i })) },
    },
  });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "product.create", entity: "Product", entityId: p.id });
  return p;
}

export async function updateProduct(actorId: string, id: string, input: unknown) {
  const data = productSchema.partial().parse(input);
  const { variants, options, ...rest } = data;
  const existing = await db.product.findUnique({ where: { id }, include: { variants: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Producto no encontrado.");
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { ...rest, ...(options ? { options: options as Prisma.InputJsonValue } : {}) } });
    if (variants) {
      const keep = variants.filter((v) => v.id).map((v) => v.id!);
      // No se borran variantes usadas en pedidos para preservar el historial
      await tx.productVariant.deleteMany({ where: { productId: id, id: { notIn: keep }, orderItems: { none: {} }, cartItems: { none: {} } } });
      for (const [i, v] of variants.entries()) {
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: { name: v.name, priceCents: v.priceCents, isDefault: v.isDefault, sortOrder: i } });
        else await tx.productVariant.create({ data: { productId: id, name: v.name, priceCents: v.priceCents, isDefault: v.isDefault, sortOrder: i } });
      }
    }
  });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "product.update", entity: "Product", entityId: id, data: Object.keys(data) });
  return db.product.findUnique({ where: { id }, include: { variants: true } });
}

export async function deleteProduct(actorId: string, id: string) {
  const used = await db.orderItem.count({ where: { productId: id } });
  if (used > 0) {
    // Con historial: se desactiva en lugar de borrarse
    await db.product.update({ where: { id }, data: { available: false } });
    await db.cartItem.deleteMany({ where: { productId: id } });
    invalidateCatalogCache();
    await audit({ userId: actorId, action: "product.archive", entity: "Product", entityId: id });
    return { archived: true };
  }
  await db.cartItem.deleteMany({ where: { productId: id } });
  await db.product.delete({ where: { id } });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "product.delete", entity: "Product", entityId: id });
  return { deleted: true };
}

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).nullish(),
  icon: z.string().trim().max(8).nullish(),
  active: z.boolean().default(true),
});

export async function createCategory(actorId: string, input: unknown) {
  const data = categorySchema.parse(input);
  const max = await db.category.aggregate({ _max: { sortOrder: true } });
  const c = await db.category.create({ data: { ...data, slug: slugify(data.name), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "category.create", entity: "Category", entityId: c.id });
  return c;
}

export async function updateCategory(actorId: string, id: string, input: unknown) {
  const data = categorySchema.partial().parse(input);
  const c = await db.category.update({ where: { id }, data });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "category.update", entity: "Category", entityId: id });
  return c;
}

export async function deleteCategory(actorId: string, id: string) {
  const count = await db.product.count({ where: { categoryId: id } });
  if (count > 0) throw new AppError("INVALID_STATE", `La categoría tiene ${count} productos. Muévelos o elimínalos antes.`);
  await db.category.delete({ where: { id } });
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "category.delete", entity: "Category", entityId: id });
}

export async function reorderCategories(actorId: string, ids: string[]) {
  await db.$transaction(ids.map((id, i) => db.category.update({ where: { id }, data: { sortOrder: i + 1 } })));
  invalidateCatalogCache();
  await audit({ userId: actorId, action: "category.reorder", entity: "Category" });
}

// ---------- Métricas ----------

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const PAID: OrderStatus[] = ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO", "ENTREGADO"];

export async function getDashboardStats() {
  const today = startOfDay();
  const [ordersToday, revenueToday, revenueTotal, customers, products, pending, completed, ordersTotal] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: today }, status: { in: PAID } } }),
    db.order.aggregate({ where: { createdAt: { gte: today }, status: { in: PAID } }, _sum: { totalCents: true } }),
    db.order.aggregate({ where: { status: { in: PAID } }, _sum: { totalCents: true } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.product.count({ where: { available: true } }),
    db.order.count({ where: { status: { in: ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] } } }),
    db.order.count({ where: { status: "ENTREGADO" } }),
    db.order.count({ where: { status: { in: PAID } } }),
  ]);
  return {
    ordersToday,
    salesToday: revenueToday._sum.totalCents ?? 0,
    revenue: revenueTotal._sum.totalCents ?? 0,
    customers,
    products,
    pending,
    completed,
    avgTicket: ordersTotal ? Math.round((revenueTotal._sum.totalCents ?? 0) / ordersTotal) : 0,
  };
}

export async function getAnalytics(days = 14) {
  const from = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const orders = await db.order.findMany({
    where: { createdAt: { gte: from }, status: { in: PAID } },
    select: { createdAt: true, totalCents: true, source: true },
  });
  const byDay = new Map<string, { date: string; ventas: number; pedidos: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }), ventas: 0, pedidos: 0 });
  }
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, "0")}h`, pedidos: 0 }));
  const bySource: Record<string, number> = {};
  for (const o of orders) {
    const key = startOfDay(o.createdAt).toISOString().slice(0, 10);
    const local = new Date(startOfDay(o.createdAt));
    const k2 = local.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? byDay.get(k2);
    if (bucket) {
      bucket.ventas += o.totalCents / 100;
      bucket.pedidos += 1;
    }
    byHour[o.createdAt.getHours()].pedidos += 1;
    bySource[o.source] = (bySource[o.source] ?? 0) + 1;
  }
  const top = await db.orderItem.groupBy({
    by: ["name"],
    where: { order: { status: { in: PAID }, createdAt: { gte: from } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 8,
  });
  const days7 = [...byDay.values()];
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.totalCents, 0);
  return {
    byDay: days7.map((d) => ({ ...d, ventas: Math.round(d.ventas * 100) / 100, ticket: d.pedidos ? Math.round((d.ventas / d.pedidos) * 100) / 100 : 0 })),
    byHour: byHour.filter((h) => Number(h.hora.slice(0, 2)) >= 10),
    topProducts: top.map((t) => ({ name: t.name, unidades: t._sum.quantity ?? 0 })),
    bySource: Object.entries(bySource).map(([name, value]) => ({ name, value })),
    totals: { orders: totalOrders, revenue: totalRevenue, avgTicket: totalOrders ? Math.round(totalRevenue / totalOrders) : 0 },
  };
}

export async function getCustomersAdmin(q?: string) {
  const users = await db.user.findMany({
    where: {
      role: "CUSTOMER",
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      orders: { where: { status: { in: PAID } }, select: { totalCents: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    orders: u.orders.length,
    lastOrder: u.orders[0]?.createdAt ?? null,
    totalSpent: u.orders.reduce((s, o) => s + o.totalCents, 0),
  }));
}
