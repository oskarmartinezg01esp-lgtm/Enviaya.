"use client";

import { MessageSquarePlus } from "lucide-react";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "@/components/cortana/cortana-provider";
import { CortanaOrb, ORB_LABEL } from "@/components/cortana/orb";
import { ChatThread } from "@/components/cortana/chat-thread";
import { Composer } from "@/components/cortana/composer";
import { Button } from "@/components/ui/button";

export default function ConversationPage() {
  const orb = useCortana((s) => s.orb);
  const messages = useCortana((s) => s.messages);
  const voiceActive = useCortana((s) => s.voiceActive);
  const engine = useCortana((s) => s.voiceEngine);
  const { toggleVoice, newConversation, send } = useCortanaActions();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-11rem)] max-w-3xl flex-col lg:min-h-[calc(100dvh-6rem)]">
      <div className="glass sticky top-[4.5rem] z-10 mb-4 flex items-center gap-3 rounded-2xl p-3 lg:top-2">
        <CortanaOrb state={orb} size={44} onClick={toggleVoice} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-semibold tracking-[0.2em]">CORTANA</div>
          <div className="truncate text-xs text-muted">
            {voiceActive ? `${ORB_LABEL[orb]} · ${engine === "realtime" ? "voz en tiempo real" : "voz del navegador"}` : "Modo texto · pulsa el micrófono para hablar"}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={newConversation} aria-label="Nueva conversación">
          <MessageSquarePlus /> <span className="hidden sm:inline">Nueva</span>
        </Button>
      </div>

      <div className="flex-1">
        {messages.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="font-display text-xl font-semibold">¿En qué te ayudo?</p>
            <p className="mt-1 text-sm text-muted">Escribe o habla. Puedes cambiar entre voz y texto cuando quieras.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Quiero dos hamburguesas sin cebolla, una con queso extra", "¿Qué me recomiendas?", "¿Cuánto llevo?"].map((e) => (
                <button key={e} onClick={() => void send(e, "ui")} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm transition hover:border-electric/40">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ChatThread />
        )}
      </div>

      <div className="sticky bottom-24 mt-4 lg:bottom-4">
        <Composer />
      </div>
    </div>
  );
}
