/**
 * Orquestador de CORTANA: carga la conversación, elige motor (OpenAI o local),
 * ejecuta herramientas, persiste mensajes y devuelve la respuesta + estado de UI.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCartView, type CartView } from "@/lib/services/cart";
import { getCatalog, basePrice } from "@/lib/services/catalog";
import { getOrderStatus } from "@/lib/services/orders";
import { buildAIContext } from "./ai-context";
import { classifyIntent, type Intent } from "./ai-intents";
import { openAIEnabled, runOpenAIConversation } from "./ai-client";
import { runLocalEngine, type AssistantUI } from "./local-engine";
import { parseState, type ConversationState } from "./ai-state";
import type { ToolCallRecord, ToolContext } from "./ai-tools";

export type AssistantResponse = {
  conversationId: string;
  reply: string;
  intent: Intent;
  engine: "openai" | "local";
  ui: AssistantUI;
  cart: CartView;
  toolCalls: { name: string; ok: boolean }[];
};

export async function getOrCreateConversation(userId: string, conversationId?: string | null) {
  if (conversationId) {
    const c = await db.conversation.findFirst({ where: { id: conversationId, userId } });
    if (c) return c;
  }
  return db.conversation.create({ data: { userId } });
}

async function uiFromToolCalls(userId: string, calls: ToolCallRecord[], state: ConversationState): Promise<AssistantUI> {
  const ui: AssistantUI = {};
  const catalog = await getCatalog();
  for (const c of calls) {
    if (!c.result.ok) continue;
    const data = c.result.data as Record<string, unknown>;
    if (c.name === "searchProducts" || c.name === "recommendProducts") {
      const ids = ((data.products as { id: string }[]) ?? []).map((p) => p.id);
      ui.products = ids
        .map((id) => catalog.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({ id: p!.id, name: p!.name, description: p!.description, priceCents: basePrice(p!), imageUrl: p!.imageUrl, categorySlug: p!.category.slug, available: p!.available }));
    }
    if (c.name === "confirmOrder") {
      ui.orb = "SUCCESS";
      ui.order = await getOrderStatus(userId, (data as { number: number }).number);
    }
    if (c.name === "getOrderStatus" && (data as { found?: boolean }).found) {
      ui.order = await getOrderStatus(userId, (data as { id: string }).id);
    }
  }
  if (calls.some((c) => !c.result.ok && c.result.error.code !== "CONFIRMATION_REQUIRED")) ui.orb = ui.orb ?? "ERROR";
  if (state.pending?.type === "confirm_order") {
    ui.awaitingConfirmation = true;
    ui.orb = ui.orb ?? "CONFIRMING";
  }
  return ui;
}

export async function handleUserMessage(params: {
  userId: string;
  text: string;
  conversationId?: string | null;
  source?: "voice" | "text" | "ui";
}): Promise<AssistantResponse> {
  const text = params.text.trim().slice(0, 1000);
  const source = params.source ?? "text";
  const [user, conversation] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: params.userId }, include: { profile: true } }),
    getOrCreateConversation(params.userId, params.conversationId),
  ]);
  const state = parseState(conversation.state);
  const saveMessages = user.profile?.saveConversations ?? true;

  let reply = "";
  let intent: Intent = classifyIntent(text);
  let engine: "openai" | "local" = "local";
  let toolCalls: ToolCallRecord[] = [];
  let ui: AssistantUI = {};

  if (openAIEnabled()) {
    try {
      const history = await db.message.findMany({
        where: { conversationId: conversation.id, role: { in: ["USER", "ASSISTANT"] } },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const ctx: ToolContext = { userId: params.userId, userText: text, state, source };
      const result = await runOpenAIConversation({
        ctx,
        context: await buildAIContext(params.userId, state),
        history: history.reverse().map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content })),
        text,
      });
      reply = result.reply;
      toolCalls = result.toolCalls;
      ui = await uiFromToolCalls(params.userId, toolCalls, state);
      engine = "openai";
    } catch (err) {
      console.error("[assistant] OpenAI falló, usando motor local:", (err as Error).message);
    }
  }
  if (engine === "local") {
    const r = await runLocalEngine({ userId: params.userId, text, state, source, userName: user.name });
    reply = r.reply;
    intent = r.intent;
    toolCalls = r.toolCalls;
    ui = r.ui;
  }
  if (!reply) reply = "Perdona, no he podido responder. ¿Puedes repetirlo?";

  await db.$transaction([
    ...(saveMessages
      ? [
          db.message.create({ data: { conversationId: conversation.id, role: "USER", content: text, metadata: { source, intent } } }),
          db.message.create({
            data: {
              conversationId: conversation.id,
              role: "ASSISTANT",
              content: reply,
              toolCalls: toolCalls.map((t) => ({ name: t.name, args: t.args, ok: t.result.ok })) as unknown as Prisma.InputJsonValue,
              metadata: { engine, intent, orb: ui.orb ?? null },
            },
          }),
        ]
      : []),
    db.conversation.update({
      where: { id: conversation.id },
      data: {
        state: state as unknown as Prisma.InputJsonValue,
        title: conversation.title ?? text.slice(0, 60),
      },
    }),
  ]);

  return {
    conversationId: conversation.id,
    reply,
    intent,
    engine,
    ui,
    cart: await getCartView(params.userId),
    toolCalls: toolCalls.map((t) => ({ name: t.name, ok: t.result.ok })),
  };
}
