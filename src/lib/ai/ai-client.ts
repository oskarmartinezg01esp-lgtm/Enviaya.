/**
 * Cliente de OpenAI (Chat Completions + tool calling) para el razonamiento de CORTANA.
 * Se usa cuando existe OPENAI_API_KEY; si falla, el orquestador recurre al motor local.
 */
import { CORTANA_SYSTEM_PROMPT } from "./ai-prompts";
import { executeTool, getToolDefinitionsForOpenAI, type ToolCallRecord, type ToolContext } from "./ai-tools";

export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini";
export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

export function openAIEnabled() {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.AI_ENGINE !== "local";
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function chat(messages: ChatMessage[]) {
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages,
      tools: getToolDefinitionsForOpenAI(),
      tool_choice: "auto",
      parallel_tool_calls: false,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices[0].message as Extract<ChatMessage, { role: "assistant" }>;
}

export async function runOpenAIConversation(params: {
  ctx: ToolContext;
  context: string;
  history: { role: "user" | "assistant"; content: string }[];
  text: string;
}): Promise<{ reply: string; toolCalls: ToolCallRecord[] }> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${CORTANA_SYSTEM_PROMPT}\n\nCONTEXTO ACTUAL\n${params.context}` },
    ...params.history.slice(-12),
    { role: "user", content: params.text },
  ];
  const toolCalls: ToolCallRecord[] = [];
  for (let i = 0; i < 6; i++) {
    const msg = await chat(messages);
    messages.push(msg);
    if (!msg.tool_calls?.length) return { reply: (msg.content ?? "").trim(), toolCalls };
    for (const tc of msg.tool_calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeTool(tc.function.name, args, params.ctx);
      toolCalls.push({ name: tc.function.name, args, result });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  return { reply: "Perdona, me he liado. ¿Puedes repetirlo?", toolCalls };
}
