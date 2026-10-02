import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  settings: z
    .object({
      language: z.enum(["es-ES", "es-MX", "en-US", "ca-ES"]).optional(),
      voice: z.string().max(20).optional(),
      voiceSpeed: z.number().min(0.6).max(1.6).optional(),
      autoSpeak: z.boolean().optional(),
      memoryEnabled: z.boolean().optional(),
      notifyPush: z.boolean().optional(),
      notifyEmail: z.boolean().optional(),
      notifyWhatsapp: z.boolean().optional(),
      saveConversations: z.boolean().optional(),
    })
    .optional(),
});

export const PATCH = apiRoute(async (req) => {
  const user = await apiUser();
  const body = schema.parse(await readJson(req));
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.settings ? { profile: { upsert: { create: body.settings, update: body.settings } } } : {}),
    },
  });
  return { ok: true };
});

/** Derecho de supresión: elimina todas las conversaciones guardadas. */
export const DELETE = apiRoute(async () => {
  const user = await apiUser();
  await db.conversation.deleteMany({ where: { userId: user.id } });
  return { ok: true };
});
