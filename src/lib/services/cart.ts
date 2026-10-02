import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getProduct, type ProductOption, type ProductView } from "./catalog";
import { normalize, sameWord, tokenize } from "@/lib/text";

export type CartModifiers = {
  remove?: string[];
  extra?: { name: string; priceCents: number }[];
  notes?: string;
};

export type CartItemView = {
  id: string;
  productId: string;
  productSlug: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  imageUrl: string | null;
  categorySlug: string;
  quantity: number;
  unitCents: number;
  subtotalCents: number;
  modifiers: CartModifiers;
  modifiersLabel: string;
};

export type CartView = {
  id: string;
  items: CartItemView[];
  itemCount: number;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  addressId: string | null;
  paymentMethodId: string | null;
  notes: string | null;
};

export function deliveryFee(subtotalCents: number): number {
  const fee = Number(process.env.DELIVERY_FEE_CENTS ?? 0);
  const freeFrom = Number(process.env.FREE_DELIVERY_FROM_CENTS ?? 0);
  if (!fee || subtotalCents === 0) return 0;
  if (freeFrom && subtotalCents >= freeFrom) return 0;
  return fee;
}

export function modifiersLabel(m: CartModifiers): string {
  const parts: string[] = [];
  if (m.remove?.length) parts.push(...m.remove.map((r) => `sin ${r}`));
  if (m.extra?.length) parts.push(...m.extra.map((e) => `con ${e.name}`));
  if (m.notes) parts.push(m.notes);
  return parts.join(", ");
}

const cartInclude = {
  items: {
    include: { product: { include: { category: true } }, variant: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.CartInclude;

export async function getOrCreateCart(userId: string) {
  return db.cart.upsert({ where: { userId }, update: {}, create: { userId }, include: cartInclude });
}

export async function getCartView(userId: string): Promise<CartView> {
  const cart = await getOrCreateCart(userId);
  const items: CartItemView[] = cart.items.map((i) => {
    const modifiers = (i.modifiers ?? {}) as CartModifiers;
    return {
      id: i.id,
      productId: i.productId,
      productSlug: i.product.slug,
      name: i.product.name,
      variantId: i.variantId,
      variantName: i.variant?.name ?? null,
      imageUrl: i.product.imageUrl,
      categorySlug: i.product.category.slug,
      quantity: i.quantity,
      unitCents: i.unitCents,
      subtotalCents: i.unitCents * i.quantity,
      modifiers,
      modifiersLabel: modifiersLabel(modifiers),
    };
  });
  const subtotalCents = items.reduce((s, i) => s + i.subtotalCents, 0);
  const fee = deliveryFee(subtotalCents);
  return {
    id: cart.id,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalCents,
    deliveryFeeCents: fee,
    totalCents: subtotalCents + fee,
    addressId: cart.addressId,
    paymentMethodId: cart.paymentMethodId,
    notes: cart.notes,
  };
}

/** Resuelve nombres de opciones ("cebolla", "queso extra") contra las opciones reales del producto. */
export function resolveOptions(
  product: Pick<ProductView, "options" | "ingredients">,
  input: { remove?: string[]; extra?: string[] },
): { modifiers: CartModifiers; unknown: string[] } {
  const unknown: string[] = [];
  const remove: string[] = [];
  const extra: { name: string; priceCents: number }[] = [];
  const findOption = (raw: string, type: ProductOption["type"]) => {
    const t = tokenize(raw).filter((w) => !["extra", "de", "mas", "doble", "sin", "con", "el", "la"].includes(w));
    if (t.length === 0) return undefined;
    return product.options.find((o) => {
      if (o.type !== type) return false;
      const on = tokenize(o.name);
      return t.every((w) => on.some((x) => sameWord(x, w)));
    });
  };
  for (const r of input.remove ?? []) {
    const opt = findOption(r, "remove");
    if (opt) remove.push(opt.name.replace(/^sin\s+/i, ""));
    else if (product.ingredients.some((ing) => normalize(ing).includes(normalize(r)))) remove.push(normalize(r));
    else unknown.push(r);
  }
  for (const e of input.extra ?? []) {
    const opt = findOption(e, "extra");
    if (opt) extra.push({ name: opt.name, priceCents: opt.priceCents });
    else unknown.push(e);
  }
  const modifiers: CartModifiers = {};
  if (remove.length) modifiers.remove = [...new Set(remove)];
  if (extra.length) modifiers.extra = extra;
  return { modifiers, unknown };
}

function sameModifiers(a: CartModifiers, b: CartModifiers) {
  const norm = (m: CartModifiers) =>
    JSON.stringify({
      r: [...(m.remove ?? [])].sort(),
      e: [...(m.extra ?? [])].map((x) => x.name).sort(),
      n: m.notes ?? "",
    });
  return norm(a) === norm(b);
}

export type AddToCartInput = {
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  quantity?: number;
  remove?: string[];
  extra?: string[];
  notes?: string;
};

export async function addToCart(userId: string, input: AddToCartInput) {
  const quantity = Math.max(1, Math.min(50, Math.floor(input.quantity ?? 1)));
  const product = await getProduct(input.productId);
  if (!product.available) throw new AppError("UNAVAILABLE", `${product.name} no está disponible ahora mismo.`);

  let variant = product.variants.find((v) => v.id === input.variantId);
  if (!variant && input.variantName) {
    const vn = normalize(input.variantName);
    variant = product.variants.find((v) => normalize(v.name).includes(vn) || vn.includes(normalize(v.name)));
  }
  if (!variant && product.variants.length) variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];

  const { modifiers, unknown } = resolveOptions(product, { remove: input.remove, extra: input.extra });
  if (input.notes) modifiers.notes = input.notes.slice(0, 140);
  const unitCents = (variant?.priceCents ?? product.priceCents) + (modifiers.extra ?? []).reduce((s, e) => s + e.priceCents, 0);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find(
    (i) => i.productId === product.id && (i.variantId ?? null) === (variant?.id ?? null) && sameModifiers((i.modifiers ?? {}) as CartModifiers, modifiers),
  );
  const newQty = (existing?.quantity ?? 0) + quantity;
  if (product.stock !== null && newQty > product.stock) {
    throw new AppError("OUT_OF_STOCK", `Solo quedan ${product.stock} unidades de ${product.name}.`);
  }
  const item = existing
    ? await db.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty, unitCents } })
    : await db.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          quantity,
          modifiers: modifiers as Prisma.InputJsonValue,
          unitCents,
        },
      });
  return { item, product, variant: variant ?? null, quantity, modifiers, unknownOptions: unknown, cart: await getCartView(userId) };
}

export async function updateCartItem(userId: string, itemId: string, quantity: number) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, cart: { userId } }, include: { product: true } });
  if (!item) throw new AppError("NOT_FOUND", "Ese producto no está en tu carrito.");
  const q = Math.floor(quantity);
  if (q <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
  } else {
    if (item.product.stock !== null && q > item.product.stock) {
      throw new AppError("OUT_OF_STOCK", `Solo quedan ${item.product.stock} unidades de ${item.product.name}.`);
    }
    await db.cartItem.update({ where: { id: item.id }, data: { quantity: Math.min(q, 50) } });
  }
  return getCartView(userId);
}

/**
 * Quita unidades de un producto del carrito. Si no se indica cantidad se elimina la línea completa.
 * Se puede identificar por itemId o productId.
 */
export async function removeFromCart(userId: string, input: { itemId?: string; productId?: string; quantity?: number }) {
  const cart = await getOrCreateCart(userId);
  const lines = cart.items.filter((i) => (input.itemId ? i.id === input.itemId : i.productId === input.productId));
  if (lines.length === 0) throw new AppError("NOT_FOUND", "Ese producto no está en tu carrito.");
  let toRemove = input.quantity ?? Infinity;
  // Se descuenta empezando por la última línea añadida.
  for (const line of [...lines].reverse()) {
    if (toRemove <= 0) break;
    if (line.quantity <= toRemove) {
      await db.cartItem.delete({ where: { id: line.id } });
      toRemove -= line.quantity;
    } else {
      await db.cartItem.update({ where: { id: line.id }, data: { quantity: line.quantity - toRemove } });
      toRemove = 0;
    }
  }
  return { name: lines[0].product.name, cart: await getCartView(userId) };
}

export async function clearCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCartView(userId);
}

export async function setCartAddress(userId: string, addressId: string) {
  const address = await db.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new AppError("NOT_FOUND", "No encuentro esa dirección.");
  await db.cart.upsert({ where: { userId }, update: { addressId }, create: { userId, addressId } });
  return address;
}

export async function setCartPaymentMethod(userId: string, paymentMethodId: string) {
  const pm = await db.paymentMethod.findFirst({ where: { id: paymentMethodId, userId } });
  if (!pm) throw new AppError("NOT_FOUND", "No encuentro ese método de pago.");
  await db.cart.upsert({ where: { userId }, update: { paymentMethodId }, create: { userId, paymentMethodId } });
  return pm;
}

export async function setCartNotes(userId: string, notes: string | null) {
  await db.cart.upsert({ where: { userId }, update: { notes }, create: { userId, notes } });
}
