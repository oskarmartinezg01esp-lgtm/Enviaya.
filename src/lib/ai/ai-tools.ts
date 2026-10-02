/**
 * Herramientas internas de CORTANA. Cada herramienta define nombre, descripción, parámetros
 * (JSON Schema para el modelo + Zod para validar), respuesta y manejo de errores.
 *
 * Las acciones peligrosas (confirmar pedido, cancelar un pedido confirmado) están protegidas
 * en el SERVIDOR: solo se ejecutan si existe una acción pendiente y el último mensaje real del
 * usuario es una confirmación explícita. El modelo no puede saltarse esta regla.
 */
import { z } from "zod";
import { AppError, toErrorMessage } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { db } from "@/lib/db";
import { getCategories, getProduct, recommendProducts, searchProducts, basePrice, type ProductView } from "@/lib/services/catalog";
import { addToCart, clearCart, getCartView, removeFromCart, setCartAddress, setCartPaymentMethod, updateCartItem } from "@/lib/services/cart";
import { formatAddress, getAddresses, resolveAddressByText } from "@/lib/services/addresses";
import { describePaymentMethod, getPaymentMethods, resolvePaymentByText } from "@/lib/services/payment-methods";
import { cancelOrder, confirmOrder, createOrder, getOrderHistory, getOrderStatus, repeatOrder } from "@/lib/services/orders";
import { sendNotification } from "@/lib/services/notifications";
import { clearPreferences, getPreferences, setPreference } from "@/lib/services/preferences";
import { audit } from "@/lib/services/audit";
import { isAffirmative } from "./ai-intents";
import { CONFIRMATION_TTL_MS, type ConversationState } from "./ai-state";

export type ToolContext = {
  userId: string;
  /** Texto real del último mensaje del usuario (transcripción o texto escrito). */
  userText: string;
  state: ConversationState;
  source: "voice" | "text" | "ui";
};

export type ToolResult = { ok: true; data: unknown; message?: string } | { ok: false; error: { code: string; message: string } };

type ToolDef<S extends z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  parameters: Record<string, unknown>;
  /** Requiere confirmación explícita del usuario */
  dangerous?: boolean;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
};

function tool<S extends z.ZodTypeAny>(def: ToolDef<S>) {
  return def;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export function productSummary(p: ProductView) {
  return {
    id: p.id,
    name: p.name,
    price: formatCents(basePrice(p)),
    priceCents: basePrice(p),
    category: p.category.name,
    available: p.available,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: formatCents(v.priceCents) })),
    options: p.options.map((o) => ({ name: o.name, type: o.type, price: o.priceCents ? formatCents(o.priceCents) : undefined })),
    tags: p.tags,
  };
}

function cartSummary(cart: Awaited<ReturnType<typeof getCartView>>) {
  return {
    items: cart.items.map((i) => ({
      itemId: i.id,
      productId: i.productId,
      name: i.name,
      variant: i.variantName,
      quantity: i.quantity,
      modifiers: i.modifiersLabel || undefined,
      subtotal: formatCents(i.subtotalCents),
    })),
    itemCount: cart.itemCount,
    total: formatCents(cart.totalCents),
    totalCents: cart.totalCents,
  };
}

function requireConfirmation(ctx: ToolContext, type: "confirm_order" | "confirm_cancel", id: string) {
  const p = ctx.state.pending;
  const matches = p && p.type === type && ("orderId" in p ? p.orderId === id : false) && p.expiresAt > Date.now();
  if (!matches || !isAffirmative(ctx.userText)) {
    throw new AppError(
      "CONFIRMATION_REQUIRED",
      "Esta acción necesita la confirmación explícita del usuario. Resume el pedido y pregunta si quiere confirmarlo.",
    );
  }
}

export const TOOLS = [
  tool({
    name: "searchProducts",
    description: "Busca productos reales del catálogo por texto, categoría, etiquetas o precio máximo. Úsala antes de mencionar cualquier producto.",
    schema: z.object({
      query: z.string().max(100).optional(),
      category: z.string().max(40).optional(),
      maxPriceCents: z.number().int().positive().optional(),
      tags: z.array(z.string()).max(5).optional(),
      limit: z.number().int().min(1).max(12).optional(),
    }),
    parameters: obj({
      query: { type: "string", description: "Texto libre: 'hamburguesa', 'algo con pollo'..." },
      category: { type: "string", description: "slug de categoría: hamburguesas, pizzas, pollo, asiatica, ensaladas, acompanamientos, bebidas, postres, combos" },
      maxPriceCents: { type: "integer", description: "Precio máximo en céntimos" },
      tags: { type: "array", items: { type: "string" } },
      limit: { type: "integer" },
    }),
    async run(args, ctx) {
      const results = await searchProducts(args);
      ctx.state.lastSearchIds = results.map((r) => r.id);
      return { count: results.length, products: results.map(productSummary) };
    },
  }),
  tool({
    name: "getProduct",
    description: "Detalle de un producto: descripción, variantes, opciones, ingredientes y alérgenos.",
    schema: z.object({ productId: z.string().min(1) }),
    parameters: obj({ productId: { type: "string" } }, ["productId"]),
    async run({ productId }, ctx) {
      const p = await getProduct(productId);
      ctx.state.lastProductId = p.id;
      return { ...productSummary(p), description: p.description, ingredients: p.ingredients, allergens: p.allergens };
    },
  }),
  tool({
    name: "getCategories",
    description: "Lista las categorías del catálogo.",
    schema: z.object({}),
    parameters: obj({}),
    async run() {
      const cats = await getCategories();
      return cats.map((c) => ({ slug: c.slug, name: c.name, products: c._count.products }));
    },
  }),
  tool({
    name: "recommendProducts",
    description: "Recomienda productos reales según precio, saciedad, historial, preferencias y popularidad.",
    schema: z.object({
      maxPriceCents: z.number().int().positive().optional(),
      filling: z.boolean().optional(),
      query: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(6).optional(),
    }),
    parameters: obj({
      maxPriceCents: { type: "integer" },
      filling: { type: "boolean", description: "El usuario quiere algo que llene" },
      query: { type: "string" },
      limit: { type: "integer" },
    }),
    async run(args, ctx) {
      const list = await recommendProducts({ ...args, userId: ctx.userId });
      ctx.state.lastSearchIds = list.map((p) => p.id);
      return { products: list.map(productSummary) };
    },
  }),
  tool({
    name: "addToCart",
    description: "Añade un producto al carrito. Usa productId real obtenido de searchProducts. remove/extra son nombres de opciones del producto.",
    schema: z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(50).default(1),
      variantId: z.string().optional(),
      variantName: z.string().optional(),
      remove: z.array(z.string()).max(10).optional(),
      extra: z.array(z.string()).max(10).optional(),
      notes: z.string().max(140).optional(),
    }),
    parameters: obj(
      {
        productId: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
        variantId: { type: "string" },
        variantName: { type: "string", description: "Mediana, Familiar, Grande..." },
        remove: { type: "array", items: { type: "string" }, description: "Ingredientes a quitar: 'cebolla'" },
        extra: { type: "array", items: { type: "string" }, description: "Extras: 'queso extra'" },
        notes: { type: "string" },
      },
      ["productId", "quantity"],
    ),
    async run(args, ctx) {
      const r = await addToCart(ctx.userId, args);
      ctx.state.lastProductId = r.product.id;
      if (ctx.state.pending?.type === "confirm_order") ctx.state.pending = null; // el carrito cambió
      return {
        added: { name: r.product.name, quantity: r.quantity, variant: r.variant?.name, modifiers: r.modifiers },
        unknownOptions: r.unknownOptions,
        cart: cartSummary(r.cart),
      };
    },
  }),
  tool({
    name: "removeFromCart",
    description: "Quita unidades de un producto del carrito. Sin quantity elimina la línea completa.",
    schema: z.object({ productId: z.string().optional(), itemId: z.string().optional(), quantity: z.number().int().min(1).optional() }),
    parameters: obj({ productId: { type: "string" }, itemId: { type: "string" }, quantity: { type: "integer" } }),
    async run(args, ctx) {
      if (!args.productId && !args.itemId) throw new AppError("VALIDATION", "Indica qué producto quitar.");
      const r = await removeFromCart(ctx.userId, args);
      if (ctx.state.pending?.type === "confirm_order") ctx.state.pending = null;
      return { removed: r.name, cart: cartSummary(r.cart) };
    },
  }),
  tool({
    name: "updateCartItem",
    description: "Fija la cantidad exacta de una línea del carrito (0 la elimina).",
    schema: z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0).max(50) }),
    parameters: obj({ itemId: { type: "string" }, quantity: { type: "integer", minimum: 0 } }, ["itemId", "quantity"]),
    async run({ itemId, quantity }, ctx) {
      const cart = await updateCartItem(ctx.userId, itemId, quantity);
      if (ctx.state.pending?.type === "confirm_order") ctx.state.pending = null;
      return cartSummary(cart);
    },
  }),
  tool({
    name: "clearCart",
    description: "Vacía el carrito por completo.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      ctx.state.pending = null;
      return cartSummary(await clearCart(ctx.userId));
    },
  }),
  tool({
    name: "getCart",
    description: "Devuelve el contenido actual del carrito.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      return cartSummary(await getCartView(ctx.userId));
    },
  }),
  tool({
    name: "calculateTotal",
    description: "Calcula subtotal, gastos de envío y total del carrito.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      const c = await getCartView(ctx.userId);
      return { subtotal: formatCents(c.subtotalCents), delivery: formatCents(c.deliveryFeeCents), total: formatCents(c.totalCents), totalCents: c.totalCents };
    },
  }),
  tool({
    name: "getCustomer",
    description: "Datos básicos del cliente (nombre) y sus preferencias recordadas.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      const u = await db.user.findUnique({ where: { id: ctx.userId }, include: { profile: true } });
      const prefs = u?.profile?.memoryEnabled === false ? [] : await getPreferences(ctx.userId);
      return { name: u?.name, memoryEnabled: u?.profile?.memoryEnabled ?? true, preferences: Object.fromEntries(prefs.map((p) => [p.key, p.value])) };
    },
  }),
  tool({
    name: "getAddresses",
    description: "Direcciones guardadas del cliente.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      const list = await getAddresses(ctx.userId);
      const cart = await getCartView(ctx.userId);
      return list.map((a) => ({ id: a.id, label: a.label, address: formatAddress(a), isDefault: a.isDefault, selected: cart.addressId === a.id }));
    },
  }),
  tool({
    name: "setDeliveryAddress",
    description: "Selecciona la dirección de entrega por id o por texto ('casa', 'trabajo').",
    schema: z.object({ addressId: z.string().optional(), text: z.string().max(120).optional() }),
    parameters: obj({ addressId: { type: "string" }, text: { type: "string" } }),
    async run(args, ctx) {
      let id = args.addressId;
      if (!id && args.text) id = (await resolveAddressByText(ctx.userId, args.text))?.id;
      if (!id) throw new AppError("NOT_FOUND", "No encuentro esa dirección entre las guardadas.");
      const a = await setCartAddress(ctx.userId, id);
      if (ctx.state.pending?.type === "confirm_order") ctx.state.pending = null;
      return { label: a.label, address: formatAddress(a) };
    },
  }),
  tool({
    name: "getPaymentMethods",
    description: "Métodos de pago guardados (tokenizados; solo últimos 4 dígitos).",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      const list = await getPaymentMethods(ctx.userId);
      return list.map((m) => ({ id: m.id, type: m.type, description: describePaymentMethod(m), isDefault: m.isDefault }));
    },
  }),
  tool({
    name: "setPaymentMethod",
    description: "Selecciona el método de pago por id o por texto ('tarjeta', 'efectivo', '4821').",
    schema: z.object({ paymentMethodId: z.string().optional(), text: z.string().max(80).optional() }),
    parameters: obj({ paymentMethodId: { type: "string" }, text: { type: "string" } }),
    async run(args, ctx) {
      let id = args.paymentMethodId;
      if (!id && args.text) id = (await resolvePaymentByText(ctx.userId, args.text))?.id;
      if (!id) throw new AppError("NOT_FOUND", "No encuentro ese método de pago.");
      const pm = await setCartPaymentMethod(ctx.userId, id);
      if (ctx.state.pending?.type === "confirm_order") ctx.state.pending = null;
      return { description: describePaymentMethod(pm) };
    },
  }),
  tool({
    name: "createOrder",
    description:
      "Prepara el pedido a partir del carrito (estado PENDIENTE, sin cobrar). Devuelve el resumen que DEBES leer al usuario antes de pedir confirmación.",
    schema: z.object({ notes: z.string().max(200).optional() }),
    parameters: obj({ notes: { type: "string", description: "Instrucciones especiales" } }),
    async run(args, ctx) {
      const r = await createOrder(ctx.userId, { source: ctx.source, notes: args.notes });
      ctx.state.pending = { type: "confirm_order", orderId: r.order.id, totalCents: r.order.totalCents, expiresAt: Date.now() + CONFIRMATION_TTL_MS };
      return {
        orderId: r.order.id,
        number: r.order.number,
        items: r.order.items.map((i) => ({ name: i.name, quantity: i.quantity, variant: i.variantName, modifiers: i.modifiersLabel || undefined })),
        total: formatCents(r.order.totalCents),
        address: `${r.address.label} (${formatAddress(r.address)})`,
        payment: r.paymentLabel,
        requiresConfirmation: true,
      };
    },
  }),
  tool({
    name: "confirmOrder",
    description:
      "Confirma y cobra el pedido preparado. SOLO tras un 'sí' explícito del usuario a la pregunta de confirmación. El servidor lo verifica.",
    dangerous: true,
    schema: z.object({ orderId: z.string().min(1) }),
    parameters: obj({ orderId: { type: "string" } }, ["orderId"]),
    async run({ orderId }, ctx) {
      requireConfirmation(ctx, "confirm_order", orderId);
      const order = await confirmOrder(ctx.userId, orderId);
      ctx.state.pending = null;
      ctx.state.lastOrderId = order.id;
      ctx.state.upsellDone = false;
      await audit({ userId: ctx.userId, action: "ai.tool.confirmOrder", entity: "Order", entityId: order.id, data: { utterance: ctx.userText.slice(0, 200) } });
      return { number: order.number, status: order.statusLabel, total: formatCents(order.totalCents), etaMinutes: order.etaMinutes };
    },
  }),
  tool({
    name: "cancelOrder",
    description:
      "Cancela un pedido. La primera llamada solo solicita confirmación; repítela tras un 'sí' explícito del usuario.",
    dangerous: true,
    schema: z.object({ orderId: z.string().optional() }),
    parameters: obj({ orderId: { type: "string", description: "Si se omite, el último pedido activo" } }),
    async run(args, ctx) {
      const order = await getOrderStatus(ctx.userId, args.orderId);
      if (!order) throw new AppError("NOT_FOUND", "No tienes pedidos que cancelar.");
      const p = ctx.state.pending;
      if (!(p?.type === "confirm_cancel" && p.orderId === order.id)) {
        ctx.state.pending = { type: "confirm_cancel", orderId: order.id, orderNumber: order.number, expiresAt: Date.now() + CONFIRMATION_TTL_MS };
        return { requiresConfirmation: true, number: order.number, status: order.statusLabel, message: `¿Seguro que quieres cancelar el pedido #${order.number}?` };
      }
      requireConfirmation(ctx, "confirm_cancel", order.id);
      const cancelled = await cancelOrder(ctx.userId, order.id);
      ctx.state.pending = null;
      return { number: cancelled.number, status: cancelled.statusLabel };
    },
  }),
  tool({
    name: "getOrderStatus",
    description: "Estado real y seguimiento de un pedido (o del último activo si no se indica).",
    schema: z.object({ orderId: z.string().optional() }),
    parameters: obj({ orderId: { type: "string", description: "id o número de pedido" } }),
    async run(args, ctx) {
      const o = await getOrderStatus(ctx.userId, args.orderId);
      if (!o) return { found: false };
      ctx.state.lastOrderId = o.id;
      return { found: true, id: o.id, number: o.number, status: o.statusLabel, steps: o.steps.map((s) => `${s.done ? "✓" : "○"} ${s.label}`), etaMinutes: o.etaMinutes, total: formatCents(o.totalCents) };
    },
  }),
  tool({
    name: "getOrderHistory",
    description: "Últimos pedidos del cliente.",
    schema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
    parameters: obj({ limit: { type: "integer" } }),
    async run(args, ctx) {
      const list = await getOrderHistory(ctx.userId, args.limit ?? 5);
      return list.map((o) => ({ id: o.id, number: o.number, date: o.createdAt, status: o.statusLabel, total: formatCents(o.totalCents), items: o.items.map((i) => `${i.quantity}x ${i.name}`) }));
    },
  }),
  tool({
    name: "repeatOrder",
    description: "Prepara el carrito con los productos de un pedido anterior (por defecto, el último). No confirma nada.",
    schema: z.object({ orderId: z.string().optional() }),
    parameters: obj({ orderId: { type: "string" } }),
    async run(args, ctx) {
      const r = await repeatOrder(ctx.userId, args.orderId);
      ctx.state.pending = null;
      return { fromOrder: r.orderNumber, unavailable: r.unavailable, cart: cartSummary(r.cart) };
    },
  }),
  tool({
    name: "sendNotification",
    description: "Envía una notificación al propio usuario (recordatorio, aviso).",
    schema: z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(300) }),
    parameters: obj({ title: { type: "string" }, body: { type: "string" } }, ["title", "body"]),
    async run(args, ctx) {
      const n = await sendNotification({ userId: ctx.userId, event: "assistant.message", ...args });
      return { id: n.id };
    },
  }),
  tool({
    name: "savePreference",
    description: "Guarda una preferencia útil del usuario (memoria). Claves: preferredDrink, preferredFood, dislikes, diet, allergies, spiceLevel, notes.",
    schema: z.object({ key: z.string().min(1).max(40), value: z.string().min(1).max(200) }),
    parameters: obj({ key: { type: "string" }, value: { type: "string" } }, ["key", "value"]),
    async run(args, ctx) {
      const p = await setPreference(ctx.userId, args.key, args.value);
      return { key: p.key, value: p.value };
    },
  }),
  tool({
    name: "clearPreferences",
    description: "Borra toda la memoria/preferencias del usuario cuando lo pida.",
    schema: z.object({}),
    parameters: obj({}),
    async run(_a, ctx) {
      await clearPreferences(ctx.userId);
      return { cleared: true };
    },
  }),
];

export type ToolName = (typeof TOOLS)[number]["name"];

export function getToolDefinitionsForOpenAI() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Formato de herramientas para la Realtime API (sesión de voz). */
export function getToolDefinitionsForRealtime() {
  return TOOLS.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters }));
}

export type ToolCallRecord = { name: string; args: unknown; result: ToolResult };

/** Ejecuta una herramienta con validación y manejo de errores homogéneo. */
export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Herramienta desconocida: ${name}` } };
  const parsed = (def.schema as z.ZodTypeAny).safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } };
  }
  try {
    const data = await (def.run as (a: unknown, c: ToolContext) => Promise<unknown>)(parsed.data, ctx);
    return { ok: true, data };
  } catch (err) {
    const code = err instanceof AppError ? err.code : "INTERNAL";
    if (!(err instanceof AppError)) console.error(`[tool:${name}]`, err);
    return { ok: false, error: { code, message: toErrorMessage(err) } };
  }
}
