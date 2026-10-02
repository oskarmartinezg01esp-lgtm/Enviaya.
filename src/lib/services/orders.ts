import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { audit } from "./audit";
import { addToCart, clearCart, getCartView, modifiersLabel, type CartModifiers } from "./cart";
import { formatAddress, getDefaultAddress } from "./addresses";
import { describePaymentMethod, getDefaultPaymentMethod } from "./payment-methods";
import { sendNotification, type OrderEvent } from "./notifications";
import { resolveProvider } from "@/lib/payments";

export const ORDER_FLOW: OrderStatus[] = ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO", "ENTREGADO"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  PREPARANDO: "Preparando",
  LISTO: "Listo",
  EN_CAMINO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, keyof Prisma.OrderUpdateInput>> = {
  CONFIRMADO: "confirmedAt",
  PREPARANDO: "preparingAt",
  LISTO: "readyAt",
  EN_CAMINO: "shippedAt",
  ENTREGADO: "deliveredAt",
  CANCELADO: "cancelledAt",
};

const STATUS_EVENT: Partial<Record<OrderStatus, { event: OrderEvent; title: string; body: (n: number) => string }>> = {
  CONFIRMADO: { event: "order.confirmed", title: "Pedido confirmado", body: (n) => `Tu pedido #${n} ha sido confirmado.` },
  PREPARANDO: { event: "order.preparing", title: "Preparando tu pedido", body: (n) => `Estamos preparando tu pedido #${n}.` },
  LISTO: { event: "order.ready", title: "Pedido listo", body: (n) => `Tu pedido #${n} está listo y saldrá enseguida.` },
  EN_CAMINO: { event: "order.shipped", title: "Pedido en camino", body: (n) => `Tu pedido #${n} va de camino.` },
  ENTREGADO: { event: "order.delivered", title: "Pedido entregado", body: (n) => `Tu pedido #${n} ha sido entregado. ¡Que aproveche!` },
  CANCELADO: { event: "order.cancelled", title: "Pedido cancelado", body: (n) => `Tu pedido #${n} ha sido cancelado.` },
};

const orderInclude = {
  items: { include: { product: { select: { imageUrl: true, slug: true, category: { select: { slug: true } } } } } },
  payments: { include: { paymentMethod: true }, orderBy: { createdAt: "desc" } },
  user: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type OrderView = ReturnType<typeof toOrderView>;

export function toOrderView(o: OrderWithRelations) {
  const address = o.addressSnapshot as null | { label: string; text: string };
  const payment = o.payments[0];
  const steps = ORDER_FLOW.map((s) => {
    const ts = STATUS_TIMESTAMP[s] ? (o[STATUS_TIMESTAMP[s] as keyof typeof o] as Date | null) : null;
    const reached = o.status !== "CANCELADO" && o.status !== "PENDIENTE" && ORDER_FLOW.indexOf(o.status) >= ORDER_FLOW.indexOf(s);
    return { status: s, label: STATUS_LABEL[s], done: reached, at: ts ? ts.toISOString() : null };
  });
  let etaMinutes: number | null = null;
  if (o.confirmedAt && o.estimatedMinutes && !["ENTREGADO", "CANCELADO"].includes(o.status)) {
    const elapsed = (Date.now() - o.confirmedAt.getTime()) / 60000;
    etaMinutes = Math.max(2, Math.round(o.estimatedMinutes - elapsed));
  }
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      variantName: i.variantName,
      quantity: i.quantity,
      unitCents: i.unitCents,
      subtotalCents: i.unitCents * i.quantity,
      modifiersLabel: modifiersLabel((i.modifiers ?? {}) as CartModifiers),
      imageUrl: i.product.imageUrl,
      categorySlug: i.product.category.slug,
    })),
    subtotalCents: o.subtotalCents,
    deliveryFeeCents: o.deliveryFeeCents,
    totalCents: o.totalCents,
    address,
    payment: payment
      ? {
          status: payment.status,
          method: payment.paymentMethod ? describePaymentMethod(payment.paymentMethod) : payment.provider,
        }
      : null,
    notes: o.notes,
    source: o.source,
    steps,
    etaMinutes,
    customer: o.user,
  };
}

/** Resumen hablado de un pedido: "2 hamburguesas, 1 patatas..." */
export function speakItems(items: { name: string; quantity: number; variantName?: string | null; modifiersLabel?: string }[]) {
  return items
    .map((i) => `${i.quantity} ${i.name}${i.variantName ? ` ${i.variantName.toLowerCase()}` : ""}${i.modifiersLabel ? ` (${i.modifiersLabel})` : ""}`)
    .join(", ");
}

/**
 * Prepara un pedido PENDIENTE a partir del carrito (no cobra ni confirma).
 * Sustituye cualquier pedido pendiente anterior sin confirmar.
 */
export async function createOrder(userId: string, opts: { source?: string; notes?: string } = {}) {
  const cart = await getCartView(userId);
  if (cart.items.length === 0) throw new AppError("EMPTY_CART", "Tu carrito está vacío.");
  const address = cart.addressId
    ? await db.address.findFirst({ where: { id: cart.addressId, userId } })
    : await getDefaultAddress(userId);
  if (!address) throw new AppError("NO_ADDRESS", "Necesito una dirección de entrega.");
  const paymentMethod = cart.paymentMethodId
    ? await db.paymentMethod.findFirst({ where: { id: cart.paymentMethodId, userId } })
    : await getDefaultPaymentMethod(userId);
  if (!paymentMethod) throw new AppError("NO_PAYMENT_METHOD", "Necesito un método de pago.");

  // Validación de disponibilidad y stock en el momento del pedido
  const products = await db.product.findMany({ where: { id: { in: cart.items.map((i) => i.productId) } } });
  for (const item of cart.items) {
    const p = products.find((x) => x.id === item.productId);
    if (!p || !p.available) throw new AppError("UNAVAILABLE", `${item.name} ya no está disponible.`);
    const totalQty = cart.items.filter((i) => i.productId === item.productId).reduce((s, i) => s + i.quantity, 0);
    if (p.stock !== null && p.stock < totalQty) throw new AppError("OUT_OF_STOCK", `Solo quedan ${p.stock} de ${p.name}.`);
  }

  const order = await db.$transaction(async (tx) => {
    await tx.order.deleteMany({ where: { userId, status: "PENDIENTE" } });
    return tx.order.create({
      data: {
        userId,
        status: "PENDIENTE",
        addressId: address.id,
        addressSnapshot: { label: address.label, text: formatAddress(address), instructions: address.instructions },
        subtotalCents: cart.subtotalCents,
        deliveryFeeCents: cart.deliveryFeeCents,
        totalCents: cart.totalCents,
        notes: opts.notes ?? cart.notes,
        source: opts.source ?? "voice",
        items: {
          create: cart.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            name: i.name,
            variantName: i.variantName,
            quantity: i.quantity,
            unitCents: i.unitCents,
            modifiers: i.modifiers as Prisma.InputJsonValue,
          })),
        },
        payments: {
          create: {
            paymentMethodId: paymentMethod.id,
            provider: paymentMethod.provider,
            amountCents: cart.totalCents,
            status: "REQUIRES_CONFIRMATION",
          },
        },
      },
      include: orderInclude,
    });
  });
  await audit({ userId, action: "order.create", entity: "Order", entityId: order.id, data: { totalCents: order.totalCents } });
  return { order: toOrderView(order), address, paymentMethod, paymentLabel: describePaymentMethod(paymentMethod) };
}

/** Confirma y cobra un pedido pendiente. Solo debe llamarse tras confirmación explícita del usuario. */
export async function confirmOrder(userId: string, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { ...orderInclude, user: true } });
  if (!order) throw new AppError("NOT_FOUND", "No encuentro ese pedido.");
  if (order.status !== "PENDIENTE") throw new AppError("INVALID_STATE", `El pedido #${order.number} ya está ${STATUS_LABEL[order.status].toLowerCase()}.`);
  const payment = order.payments[0];
  const method = payment?.paymentMethod;
  if (!payment || !method) throw new AppError("NO_PAYMENT_METHOD", "El pedido no tiene método de pago.");

  const provider = resolveProvider({ type: method.type, providerRef: method.providerRef, provider: method.provider });
  const charge = await provider.charge({
    orderId: order.id,
    amountCents: order.totalCents,
    currency: "EUR",
    customerEmail: order.user.email,
    method: { type: method.type, providerRef: method.providerRef, provider: method.provider },
  });
  await db.payment.update({
    where: { id: payment.id },
    data: { status: charge.status, providerRef: charge.providerRef, provider: charge.provider },
  });
  if (charge.status === "FAILED") {
    throw new AppError("PAYMENT_FAILED", `No se ha podido realizar el pago${charge.message ? `: ${charge.message}` : ""}.`);
  }
  if (charge.status === "REQUIRES_CONFIRMATION") {
    throw new AppError("PAYMENT_FAILED", "Tu banco necesita una verificación adicional. Complétala desde la pantalla de pago.");
  }

  const estimatedMinutes = 25 + Math.min(20, order.items.reduce((s, i) => s + i.quantity, 0) * 2);
  const updated = await db.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.updateMany({
        where: { id: item.productId, stock: { not: null } },
        data: { stock: { decrement: item.quantity } },
      });
      await tx.product.update({ where: { id: item.productId }, data: { popularity: { increment: item.quantity } } });
    }
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return tx.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMADO", confirmedAt: new Date(), estimatedMinutes },
      include: orderInclude,
    });
  });
  await audit({ userId, action: "order.confirm", entity: "Order", entityId: order.id, data: { payment: charge.status } });
  await sendNotification({
    userId,
    orderId: order.id,
    event: "order.confirmed",
    title: "Pedido confirmado",
    body: `Tu pedido #${order.number} (${formatCents(order.totalCents)}) ha sido confirmado. Entrega estimada: ${estimatedMinutes} min.`,
  });
  return toOrderView(updated);
}

export async function cancelOrder(userId: string, orderId: string, opts: { asAdmin?: boolean } = {}) {
  const order = await db.order.findFirst({ where: opts.asAdmin ? { id: orderId } : { id: orderId, userId }, include: { payments: true } });
  if (!order) throw new AppError("NOT_FOUND", "No encuentro ese pedido.");
  const cancellable: OrderStatus[] = opts.asAdmin ? ["PENDIENTE", "CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] : ["PENDIENTE", "CONFIRMADO"];
  if (!cancellable.includes(order.status)) {
    throw new AppError("INVALID_STATE", `El pedido #${order.number} ya está ${STATUS_LABEL[order.status].toLowerCase()} y no se puede cancelar.`);
  }
  return setOrderStatus(order.id, "CANCELADO", { actorId: userId });
}

/** Cambia el estado (admin o simulación), sellando la marca de tiempo y notificando al cliente. */
export async function setOrderStatus(orderId: string, status: OrderStatus, opts: { actorId?: string; notify?: boolean } = {}) {
  const current = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!current) throw new AppError("NOT_FOUND", "Pedido no encontrado.");
  if (current.status === status) return toOrderView((await db.order.findUnique({ where: { id: orderId }, include: orderInclude }))!);
  const data: Prisma.OrderUpdateInput = { status };
  const tsField = STATUS_TIMESTAMP[status];
  if (tsField) (data as Record<string, unknown>)[tsField] = new Date();
  if (status === "CONFIRMADO" && !current.estimatedMinutes) data.estimatedMinutes = 30;
  // Rellena hitos intermedios saltados para que la línea de tiempo sea coherente
  const idx = ORDER_FLOW.indexOf(status);
  if (idx > 0) {
    for (const s of ORDER_FLOW.slice(0, idx)) {
      const f = STATUS_TIMESTAMP[s]!;
      if (!current[f as keyof typeof current]) (data as Record<string, unknown>)[f] = new Date();
    }
  }
  const updated = await db.order.update({ where: { id: orderId }, data, include: orderInclude });
  if (status === "CANCELADO") {
    await db.payment.updateMany({
      where: { orderId, status: "SUCCEEDED" },
      data: { status: "REFUNDED" },
    });
  }
  if (status === "ENTREGADO") {
    await db.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "SUCCEEDED" } });
  }
  await audit({ userId: opts.actorId, action: `order.status.${status}`, entity: "Order", entityId: orderId });
  const ev = STATUS_EVENT[status];
  if (ev && opts.notify !== false && current.status !== "PENDIENTE") {
    await sendNotification({ userId: current.userId, orderId, event: ev.event, title: ev.title, body: ev.body(current.number) });
  }
  return toOrderView(updated);
}

/**
 * Simulación de cocina/reparto para entornos sin integración real (SIMULATE_ORDER_PROGRESS=true).
 * Avanza el estado según el tiempo transcurrido desde la confirmación.
 */
async function applySimulation(orderId: string) {
  if (process.env.SIMULATE_ORDER_PROGRESS === "false") return;
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o?.confirmedAt || !o.estimatedMinutes || ["ENTREGADO", "CANCELADO", "PENDIENTE"].includes(o.status)) return;
  const elapsed = (Date.now() - o.confirmedAt.getTime()) / 60000;
  const est = o.estimatedMinutes;
  let target: OrderStatus = "CONFIRMADO";
  if (elapsed >= 1) target = "PREPARANDO";
  if (elapsed >= est * 0.45) target = "LISTO";
  if (elapsed >= est * 0.55) target = "EN_CAMINO";
  if (elapsed >= est) target = "ENTREGADO";
  if (ORDER_FLOW.indexOf(target) > ORDER_FLOW.indexOf(o.status)) await setOrderStatus(o.id, target);
}

export async function getOrder(userId: string, orderIdOrNumber: string | number) {
  const where: Prisma.OrderWhereInput =
    typeof orderIdOrNumber === "number" || /^\d+$/.test(String(orderIdOrNumber))
      ? { number: Number(orderIdOrNumber), userId }
      : { id: String(orderIdOrNumber), userId };
  const found = await db.order.findFirst({ where, select: { id: true } });
  if (!found) throw new AppError("NOT_FOUND", "No encuentro ese pedido.");
  await applySimulation(found.id);
  return toOrderView((await db.order.findUnique({ where: { id: found.id }, include: orderInclude }))!);
}

/** Estado del pedido indicado o, si no se indica, del último pedido activo. */
export async function getOrderStatus(userId: string, orderId?: string | number) {
  if (orderId) return getOrder(userId, orderId);
  const active = await db.order.findFirst({
    where: { userId, status: { in: ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] } },
    orderBy: { createdAt: "desc" },
  });
  const last = active ?? (await db.order.findFirst({ where: { userId, status: { not: "PENDIENTE" } }, orderBy: { createdAt: "desc" } }));
  if (!last) return null;
  return getOrder(userId, last.id);
}

export async function getOrderHistory(userId: string, limit = 20) {
  const active = await db.order.findMany({
    where: { userId, status: { in: ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] } },
    select: { id: true },
  });
  await Promise.all(active.map((o) => applySimulation(o.id)));
  const orders = await db.order.findMany({
    where: { userId, status: { not: "PENDIENTE" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: orderInclude,
  });
  return orders.map(toOrderView);
}

export async function getPendingOrder(userId: string) {
  const o = await db.order.findFirst({ where: { userId, status: "PENDIENTE" }, include: orderInclude, orderBy: { createdAt: "desc" } });
  return o ? toOrderView(o) : null;
}

/** Vuelve a llenar el carrito con los productos de un pedido anterior (no confirma nada). */
export async function repeatOrder(userId: string, orderId?: string) {
  const order = orderId
    ? await db.order.findFirst({ where: { OR: [{ id: orderId }, { number: Number(orderId) || -1 }], userId }, include: { items: true } })
    : await db.order.findFirst({
        where: { userId, status: { notIn: ["PENDIENTE", "CANCELADO"] } },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      });
  if (!order) throw new AppError("NOT_FOUND", "Todavía no tienes pedidos anteriores para repetir.");
  await clearCart(userId);
  const unavailable: string[] = [];
  for (const item of order.items) {
    const m = (item.modifiers ?? {}) as CartModifiers;
    try {
      await addToCart(userId, {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        remove: m.remove,
        extra: m.extra?.map((e) => e.name),
        notes: m.notes,
      });
    } catch {
      unavailable.push(item.name);
    }
  }
  await audit({ userId, action: "order.repeat", entity: "Order", entityId: order.id });
  return { orderNumber: order.number, unavailable, cart: await getCartView(userId) };
}

// ---------- Admin ----------

export async function listOrdersAdmin(params: { status?: OrderStatus; q?: string; take?: number } = {}) {
  const orders = await db.order.findMany({
    where: {
      status: params.status ? params.status : { not: "PENDIENTE" },
      ...(params.q
        ? {
            OR: [
              { user: { name: { contains: params.q, mode: "insensitive" } } },
              { user: { email: { contains: params.q, mode: "insensitive" } } },
              ...(/^\d+$/.test(params.q) ? [{ number: Number(params.q) }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 100,
    include: orderInclude,
  });
  return orders.map(toOrderView);
}
