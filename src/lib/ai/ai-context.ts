import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getCartView } from "@/lib/services/cart";
import { formatAddress, getAddresses } from "@/lib/services/addresses";
import { describePaymentMethod, getPaymentMethods } from "@/lib/services/payment-methods";
import { getPreferenceMap, PREFERENCE_LABELS } from "@/lib/services/preferences";
import { getCategories } from "@/lib/services/catalog";
import type { ConversationState } from "./ai-state";

/** Contexto compacto que se inyecta al modelo en cada turno. */
export async function buildAIContext(userId: string, state: ConversationState = {}) {
  const [user, cart, addresses, methods, prefs, categories, activeOrder] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    getCartView(userId),
    getAddresses(userId),
    getPaymentMethods(userId),
    getPreferenceMap(userId),
    getCategories(),
    db.order.findFirst({
      where: { userId, status: { in: ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true },
    }),
  ]);
  const lines: string[] = [];
  lines.push(`Cliente: ${user?.name ?? "desconocido"}. Fecha y hora: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}.`);
  lines.push(`Categorías: ${categories.map((c) => `${c.name} (${c.slug})`).join(", ")}.`);
  lines.push(
    cart.items.length
      ? `Carrito: ${cart.items.map((i) => `${i.quantity}x ${i.name}${i.variantName ? ` ${i.variantName}` : ""}${i.modifiersLabel ? ` [${i.modifiersLabel}]` : ""} (itemId ${i.id}, productId ${i.productId})`).join("; ")}. Total ${formatCents(cart.totalCents)}.`
      : "Carrito vacío.",
  );
  lines.push(
    addresses.length
      ? `Direcciones: ${addresses.map((a) => `${a.label}${a.isDefault ? " (predeterminada)" : ""}${cart.addressId === a.id ? " [seleccionada]" : ""}: ${formatAddress(a)}`).join(" | ")}.`
      : "Sin direcciones guardadas: pide al usuario que añada una en Direcciones.",
  );
  lines.push(
    methods.length
      ? `Pagos: ${methods.map((m) => `${describePaymentMethod(m)}${m.isDefault ? " (predeterminado)" : ""}`).join(" | ")}.`
      : "Sin métodos de pago: pide que añada uno en Pagos.",
  );
  const prefEntries = Object.entries(prefs);
  lines.push(prefEntries.length ? `Memoria: ${prefEntries.map(([k, v]) => `${PREFERENCE_LABELS[k] ?? k}: ${v}`).join("; ")}.` : "Memoria: vacía o desactivada.");
  if (activeOrder) lines.push(`Pedido activo: #${activeOrder.number} (${activeOrder.status}), id ${activeOrder.id}.`);
  if (state.pending?.type === "confirm_order") lines.push(`Pedido preparado esperando confirmación: orderId ${state.pending.orderId}, total ${formatCents(state.pending.totalCents)}.`);
  if (state.pending?.type === "confirm_cancel") lines.push(`Cancelación pendiente de confirmar: pedido #${state.pending.orderNumber}.`);
  return lines.join("\n");
}
