import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { createRealtimeSession } from "@/lib/ai/voice-server";
import { getOrCreateConversation } from "@/lib/ai/assistant";

const schema = z.object({ conversationId: z.string().nullish(), preferRealtime: z.boolean().default(true) });

/**
 * Inicia una sesión de voz. Con OPENAI_API_KEY devuelve un token efímero para conectar
 * por WebRTC con la Realtime API (la clave real nunca llega al navegador).
 * Sin clave, el cliente usa el reconocimiento/síntesis de voz del navegador + /api/ai/chat.
 */
export const POST = apiRoute(async (req) => {
  const user = await apiUser();
  if (!rateLimit(`voice:${user.id}`, 20, 60 * 60 * 1000)) throw new AppError("RATE_LIMITED", "Has iniciado demasiadas sesiones de voz.");
  const body = schema.parse(await readJson(req));
  const conversation = await getOrCreateConversation(user.id, body.conversationId);

  if (body.preferRealtime && process.env.OPENAI_API_KEY && process.env.AI_ENGINE !== "local") {
    try {
      const rt = await createRealtimeSession(user.id, conversation.id, user.profile?.voice);
      const vs = await db.voiceSession.create({
        data: { userId: user.id, conversationId: conversation.id, provider: "openai-realtime", model: rt.model },
      });
      return { mode: "realtime", voiceSessionId: vs.id, conversationId: conversation.id, ...rt };
    } catch (err) {
      console.error("[voice] realtime no disponible:", (err as Error).message);
    }
  }
  const vs = await db.voiceSession.create({ data: { userId: user.id, conversationId: conversation.id, provider: "browser" } });
  return { mode: "browser", voiceSessionId: vs.id, conversationId: conversation.id };
});
