import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { executeTool } from "@/lib/ai/ai-tools";
import { parseState } from "@/lib/ai/ai-state";
import { getCartView } from "@/lib/services/cart";

/**
 * Ejecuta herramientas solicitadas por la sesión de voz Realtime (WebRTC).
 * El cliente envía la última transcripción real del usuario: el servidor la usa para
 * verificar las confirmaciones explícitas (confirmOrder / cancelOrder).
 */
const schema = z.object({
  name: z.string().min(1).max(60),
  args: z.unknown().optional(),
  conversationId: z.string().min(1),
  userText: z.string().max(1000).default(""),
});

export const POST = apiRoute(async (req) => {
  const user = await apiUser();
  if (!rateLimit(`tool:${user.id}`, 60, 60_000)) throw new AppError("RATE_LIMITED", "Demasiadas acciones seguidas.");
  const body = schema.parse(await readJson(req));
  const conversation = await db.conversation.findFirst({ where: { id: body.conversationId, userId: user.id } });
  if (!conversation) throw new AppError("NOT_FOUND", "Conversación no encontrada.");
  const state = parseState(conversation.state);
  const result = await executeTool(body.name, body.args ?? {}, { userId: user.id, userText: body.userText, state, source: "voice" });
  await db.conversation.update({ where: { id: conversation.id }, data: { state: state as unknown as Prisma.InputJsonValue } });
  await db.message.create({
    data: {
      conversationId: conversation.id,
      role: "TOOL",
      content: body.name,
      toolCalls: [{ name: body.name, args: body.args ?? {}, ok: result.ok }] as unknown as Prisma.InputJsonValue,
      metadata: { source: "realtime" },
    },
  });
  return { result, cart: await getCartView(user.id), awaitingConfirmation: state.pending?.type === "confirm_order" };
});
