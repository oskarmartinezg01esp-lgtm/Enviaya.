"use client";

import { useState } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "./cortana-provider";
import { cn } from "@/lib/utils";

/** Entrada de texto con botón de voz: cambia entre VOICE MODE y TEXT MODE sin perder contexto. */
export function Composer({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const [text, setText] = useState("");
  const { send, toggleVoice } = useCortanaActions();
  const voiceActive = useCortana((s) => s.voiceActive);
  const busy = useCortana((s) => s.busy);
  const set = useCortana((s) => s.set);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    set({ mode: "text" });
    void send(text, "text");
    setText("");
  };

  return (
    <form onSubmit={submit} className={cn("glass-strong flex items-center gap-2 rounded-2xl p-1.5 pl-4", className)}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={autoFocus}
        placeholder={voiceActive ? "Escuchando… o escribe aquí" : "Escribe a CORTANA…"}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
        aria-label="Mensaje para CORTANA"
        enterKeyHint="send"
      />
      <button
        type="button"
        onClick={() => {
          set({ mode: "voice" });
          toggleVoice();
        }}
        className={cn(
          "grid size-10 place-items-center rounded-xl transition",
          voiceActive ? "bg-danger/15 text-danger" : "text-muted hover:bg-white/5 hover:text-cyan",
        )}
        aria-label={voiceActive ? "Detener voz" : "Hablar"}
      >
        {voiceActive ? <Square className="size-4" /> : <Mic className="size-5" />}
      </button>
      <button
        type="submit"
        disabled={!text.trim() || busy}
        className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-deep to-electric text-white transition disabled:opacity-30"
        aria-label="Enviar"
      >
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
