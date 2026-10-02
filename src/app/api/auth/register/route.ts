import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/services/audit";

const schema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email: z.string().trim().toLowerCase().email("Email no válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100),
});

export const POST = apiRoute(async (req) => {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) throw new AppError("RATE_LIMITED", "Demasiados intentos. Prueba más tarde.");
  const data = schema.parse(await readJson(req));
  const exists = await db.user.findUnique({ where: { email: data.email } });
  if (exists) throw new AppError("VALIDATION", "Ya existe una cuenta con ese email.");
  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      profile: { create: {} },
      paymentMethods: { create: [{ type: "CASH", provider: "cash", isDefault: true }] },
    },
  });
  await createSession(user.id);
  await audit({ userId: user.id, action: "auth.register", entity: "User", entityId: user.id, ip });
  return { ok: true };
});
