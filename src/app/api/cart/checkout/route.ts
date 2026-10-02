import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { setCartAddress, setCartNotes, setCartPaymentMethod } from "@/lib/services/cart";
import { createOrder } from "@/lib/services/orders";

const schema = z.object({ addressId: z.string().optional(), paymentMethodId: z.string().optional(), notes: z.string().max(200).optional() });

/** Prepara el pedido (PENDIENTE). La confirmación es un paso explícito aparte. */
export const POST = apiRoute(async (req) => {
  const user = await apiUser();
  const body = schema.parse(await readJson(req));
  if (body.addressId) await setCartAddress(user.id, body.addressId);
  if (body.paymentMethodId) await setCartPaymentMethod(user.id, body.paymentMethodId);
  if (body.notes !== undefined) await setCartNotes(user.id, body.notes || null);
  const r = await createOrder(user.id, { source: "ui" });
  return { order: r.order, paymentLabel: r.paymentLabel };
});
