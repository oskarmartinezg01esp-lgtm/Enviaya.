import "server-only";
import { OPENAI_BASE_URL, REALTIME_MODEL } from "./ai-client";
import { buildRealtimeInstructions } from "./ai-prompts";
import { buildAIContext } from "./ai-context";
import { getToolDefinitionsForRealtime } from "./ai-tools";
import { db } from "@/lib/db";
import { parseState } from "./ai-state";

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];

/** Crea un client secret efímero para la Realtime API (GA). */
export async function createRealtimeSession(userId: string, conversationId: string, voice?: string | null) {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
  const context = await buildAIContext(userId, parseState(conversation?.state));
  const res = await fetch(`${OPENAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildRealtimeInstructions(context),
        audio: {
          input: {
            transcription: { model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe", language: "es" },
            turn_detection: { type: "server_vad", silence_duration_ms: 600, interrupt_response: true, create_response: true },
            noise_reduction: { type: "near_field" },
          },
          output: { voice: voice && VOICES.includes(voice) ? voice : "marin" },
        },
        tools: getToolDefinitionsForRealtime(),
        tool_choice: "auto",
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Realtime ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { value: string; expires_at: number };
  return { clientSecret: json.value, expiresAt: json.expires_at, model: REALTIME_MODEL, callsUrl: `${OPENAI_BASE_URL}/realtime/calls` };
}
