import type { Prisma } from "@prisma/client";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Cierra la sesión de voz y guarda transcripciones de la sesión Realtime. */
export const PATCH = apiRoute<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await apiUser();
  const { id } = await params;
  const body = await readJson<{ transcript?: { role: "user" | "assistant"; text: string }[] }>(req);
  const vs = await db.voiceSession.findFirst({ where: { id, userId: user.id } });
  if (!vs) return { ok: false };
  const endedAt = new Date();
  await db.voiceSession.update({
    where: { id },
    data: { endedAt, durationMs: endedAt.getTime() - vs.startedAt.getTime(), metadata: { turns: body.transcript?.length ?? 0 } as Prisma.InputJsonValue },
  });
  const save = user.profile?.saveConversations ?? true;
  if (save && vs.conversationId && vs.provider === "openai-realtime" && body.transcript?.length) {
    await db.message.createMany({
      data: body.transcript.slice(0, 200).map((t) => ({
        conversationId: vs.conversationId!,
        role: t.role === "user" ? ("USER" as const) : ("ASSISTANT" as const),
        content: t.text.slice(0, 2000),
        metadata: { source: "realtime" },
      })),
    });
  }
  return { ok: true };
});
