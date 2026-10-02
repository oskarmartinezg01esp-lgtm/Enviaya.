import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

type P = { params: Promise<{ id: string }> };

export const GET = apiRoute<P>(async (_req, { params }) => {
  const user = await apiUser();
  const { id } = await params;
  const c = await db.conversation.findFirst({
    where: { id, userId: user.id },
    include: { messages: { where: { role: { in: ["USER", "ASSISTANT"] } }, orderBy: { createdAt: "asc" }, take: 200 } },
  });
  if (!c) throw new AppError("NOT_FOUND", "Conversación no encontrada.");
  return { id: c.id, title: c.title, messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })) };
});

export const DELETE = apiRoute<P>(async (_req, { params }) => {
  const user = await apiUser();
  const { id } = await params;
  await db.conversation.deleteMany({ where: { id, userId: user.id } });
  return { ok: true };
});
