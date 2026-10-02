import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/services/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Email no válido"), password: z.string().min(1) });

export const POST = apiRoute(async (req) => {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const data = schema.parse(await readJson(req));
  if (!rateLimit(`login:${ip}:${data.email}`, 8, 15 * 60 * 1000)) {
    throw new AppError("RATE_LIMITED", "Demasiados intentos. Espera unos minutos.");
  }
  const user = await db.user.findUnique({ where: { email: data.email } });
  const ok = await verifyPassword(data.password, user?.passwordHash);
  if (!user || !ok) throw new AppError("UNAUTHORIZED", "Email o contraseña incorrectos.");
  await createSession(user.id);
  await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id, ip });
  return { ok: true, role: user.role };
});
