import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalize } from "@/lib/text";

export function describePaymentMethod(pm: { type: string; brand: string | null; last4: string | null }) {
  switch (pm.type) {
    case "CARD":
      return `tu tarjeta ${pm.brand ? pm.brand + " " : ""}terminada en ${pm.last4}`;
    case "APPLE_PAY":
      return "Apple Pay";
    case "GOOGLE_PAY":
      return "Google Pay";
    case "CASH":
      return "efectivo a la entrega";
    default:
      return "tu método de pago";
  }
}

export async function getPaymentMethods(userId: string) {
  return db.paymentMethod.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

export async function getDefaultPaymentMethod(userId: string) {
  return db.paymentMethod.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

/**
 * Alta de un método de pago YA tokenizado. En producción `providerRef` viene de Stripe.js
 * (SetupIntent confirmado en el cliente). Nunca se reciben ni guardan números completos.
 */
export const paymentMethodSchema = z.object({
  type: z.enum(["CARD", "APPLE_PAY", "GOOGLE_PAY", "CASH"]),
  providerRef: z.string().max(100).optional().nullable(),
  brand: z.string().max(20).optional().nullable(),
  last4: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .nullable(),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2024).max(2100).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function addPaymentMethod(userId: string, input: z.infer<typeof paymentMethodSchema>) {
  const data = paymentMethodSchema.parse(input);
  if (data.type === "CARD" && !data.last4) throw new AppError("VALIDATION", "Faltan los datos de la tarjeta.");
  const count = await db.paymentMethod.count({ where: { userId } });
  const isDefault = data.isDefault || count === 0;
  return db.$transaction(async (tx) => {
    if (isDefault) await tx.paymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.paymentMethod.create({
      data: {
        userId,
        type: data.type,
        provider: data.providerRef?.startsWith("pm_") ? "stripe" : data.type === "CASH" ? "cash" : "demo",
        providerRef: data.providerRef ?? null,
        brand: data.brand ?? null,
        last4: data.last4 ?? null,
        expMonth: data.expMonth ?? null,
        expYear: data.expYear ?? null,
        isDefault,
      },
    });
  });
}

export async function removePaymentMethod(userId: string, id: string) {
  const pm = await db.paymentMethod.findFirst({ where: { id, userId } });
  if (!pm) throw new AppError("NOT_FOUND", "Método de pago no encontrado.");
  await db.paymentMethod.delete({ where: { id } });
  await db.cart.updateMany({ where: { userId, paymentMethodId: id }, data: { paymentMethodId: null } });
  if (pm.isDefault) {
    const next = await db.paymentMethod.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) await db.paymentMethod.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

export async function setDefaultPaymentMethod(userId: string, id: string) {
  const pm = await db.paymentMethod.findFirst({ where: { id, userId } });
  if (!pm) throw new AppError("NOT_FOUND", "Método de pago no encontrado.");
  await db.$transaction([
    db.paymentMethod.updateMany({ where: { userId }, data: { isDefault: false } }),
    db.paymentMethod.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/** "con la tarjeta", "en efectivo", "con apple pay", "la terminada en 4821" */
export async function resolvePaymentByText(userId: string, text: string) {
  const t = normalize(text);
  const methods = await getPaymentMethods(userId);
  const last4 = t.match(/\b(\d{4})\b/)?.[1];
  if (last4) return methods.find((m) => m.last4 === last4) ?? null;
  if (/efectivo|metalico|cash|al repartidor|en mano/.test(t)) return methods.find((m) => m.type === "CASH") ?? null;
  if (/apple/.test(t)) return methods.find((m) => m.type === "APPLE_PAY") ?? null;
  if (/google/.test(t)) return methods.find((m) => m.type === "GOOGLE_PAY") ?? null;
  if (/tarjeta|visa|mastercard|credito|debito/.test(t)) {
    const brand = /visa/.test(t) ? "visa" : /master/.test(t) ? "mastercard" : null;
    return methods.find((m) => m.type === "CARD" && (!brand || m.brand?.toLowerCase() === brand)) ?? null;
  }
  return null;
}
