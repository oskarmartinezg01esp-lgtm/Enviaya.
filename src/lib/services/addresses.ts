import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalize } from "@/lib/text";

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Pon un nombre (Casa, Trabajo...)").max(40),
  line1: z.string().trim().min(3, "Indica calle y número").max(120),
  line2: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^\d{4,5}$/, "Código postal no válido"),
  province: z.string().trim().max(80).optional().nullable(),
  instructions: z.string().trim().max(200).optional().nullable(),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export function formatAddress(a: { line1: string; line2?: string | null; city: string; postalCode: string }) {
  return [a.line1, a.line2, `${a.postalCode} ${a.city}`].filter(Boolean).join(", ");
}

export async function getAddresses(userId: string) {
  return db.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

export async function getDefaultAddress(userId: string) {
  return db.address.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

export async function createAddress(userId: string, input: AddressInput) {
  const data = addressSchema.parse(input);
  const count = await db.address.count({ where: { userId } });
  const isDefault = data.isDefault || count === 0;
  return db.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, isDefault, userId } });
  });
}

export async function updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
  const data = addressSchema.partial().parse(input);
  const existing = await db.address.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "Dirección no encontrada.");
  return db.$transaction(async (tx) => {
    if (data.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data });
  });
}

export async function deleteAddress(userId: string, id: string) {
  const existing = await db.address.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "Dirección no encontrada.");
  await db.address.delete({ where: { id } });
  await db.cart.updateMany({ where: { userId, addressId: id }, data: { addressId: null } });
  if (existing.isDefault) {
    const next = await db.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

export async function setDefaultAddress(userId: string, id: string) {
  return updateAddress(userId, id, { isDefault: true });
}

const LABEL_ALIASES: Record<string, string[]> = {
  casa: ["casa", "mi casa", "domicilio", "hogar", "piso"],
  trabajo: ["trabajo", "oficina", "curro", "empresa"],
};

/** "a mi casa" -> dirección con etiqueta Casa. */
export async function resolveAddressByText(userId: string, text: string) {
  const t = ` ${normalize(text)} `;
  const addresses = await getAddresses(userId);
  // 1) Coincidencia directa con la etiqueta
  const direct = addresses.find((a) => t.includes(` ${normalize(a.label)} `));
  if (direct) return direct;
  // 2) Alias habituales
  for (const [canonical, aliases] of Object.entries(LABEL_ALIASES)) {
    if (aliases.some((al) => t.includes(` ${al} `))) {
      const a = addresses.find((x) => normalize(x.label).includes(canonical));
      if (a) return a;
    }
  }
  // 3) Coincidencia con la calle
  return addresses.find((a) => normalize(a.line1).split(" ").filter((w) => w.length > 4).some((w) => t.includes(` ${w} `))) ?? null;
}
