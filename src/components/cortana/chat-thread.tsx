"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useCortana, type ChatMessage } from "@/lib/stores/cortana-store";
import { CortanaMark } from "./logo";
import { AssistantExtras } from "./assistant-extras";
import { cn } from "@/lib/utils";

function Bubble({ m, last }: { m: ChatMessage; last: boolean }) {
  const user = m.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2.5", user ? "justify-end" : "justify-start")}>
      {!user && (
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-electric/20 bg-electric/10">
          <CortanaMark className="size-5" glow={false} />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-2", user && "items-end")}>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {user ? "Tú" : "CORTANA"}
          {user && m.source === "voice" && <Mic className="size-3" />}
        </div>
        <div
          className={cn(
            "whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
            user ? "rounded-tr-md bg-gradient-to-br from-deep/80 to-electric/60 text-white" : "glass rounded-tl-md",
          )}
        >
          {m.content}
        </div>
        {!user && m.ui && <AssistantExtras ui={m.ui} interactive={last} />}
      </div>
    </motion.div>
  );
}

export function ChatThread({ className, limit }: { className?: string; limit?: number }) {
  const messages = useCortana((s) => s.messages);
  const interim = useCortana((s) => s.interim);
  const assistantInterim = useCortana((s) => s.assistantInterim);
  const busy = useCortana((s) => s.busy);
  const endRef = useRef<HTMLDivElement>(null);
  const list = limit ? messages.slice(-limit) : messages;
  const lastAssistant = [...list].reverse().find((m) => m.role === "assistant");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, interim, assistantInterim, busy]);

  return (
    <div className={cn("space-y-5", className)} aria-live="polite">
      {list.map((m) => (
        <Bubble key={m.id} m={m} last={m.id === lastAssistant?.id} />
      ))}
      {interim && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-dashed border-electric/40 px-4 py-2.5 text-[15px] italic text-cyan/90">{interim}…</div>
        </div>
      )}
      {assistantInterim && (
        <div className="flex gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full border border-electric/20 bg-electric/10">
            <CortanaMark className="size-5" glow={false} />
          </div>
          <div className="glass max-w-[85%] rounded-2xl rounded-tl-md px-4 py-2.5 text-[15px]">{assistantInterim}</div>
        </div>
      )}
      {busy && (
        <div className="flex items-center gap-2 pl-11 text-sm text-muted">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-cyan" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
          CORTANA está pensando...
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
