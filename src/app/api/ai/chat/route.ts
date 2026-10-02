import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { handleUserMessage } from "@/lib/ai/assistant";

const schema = z.object({
  text: z.string().trim().min(1).max(1000),
  conversationId: z.string().nullish(),
  source: z.enum(["voice", "text", "ui"]).default("text"),
});

export const POST = apiRoute(async (req) => {
  const user = await apiUser();
  if (!rateLimit(`chat:${user.id}`, 40, 60_000)) throw new AppError("RATE_LIMITED", "Vas muy rápido. Espera un momento.");
  const body = schema.parse(await readJson(req));
  return handleUserMessage({ userId: user.id, text: body.text, conversationId: body.conversationId, source: body.source });
});
