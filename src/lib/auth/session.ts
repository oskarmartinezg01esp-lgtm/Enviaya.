import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const SESSION_COOKIE = "cortana_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const h = await headers();
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 200) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Usuario de la petición actual (memoizado por petición). */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true, adminUser: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { passwordHash: _ph, ...user } = session.user;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Para páginas: redirige a /login si no hay sesión. */
export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdminPage() {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** Para APIs: lanza 401/403. */
export async function apiUser() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Inicia sesión para continuar.");
  return user;
}

export async function apiAdmin() {
  const user = await apiUser();
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Acceso solo para administradores.");
  return user;
}
