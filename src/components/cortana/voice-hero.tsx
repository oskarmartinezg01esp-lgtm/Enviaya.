"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Mic, Package, ShoppingCart, Square, Sparkles } from "lucide-react";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "./cortana-provider";
import { CortanaOrb, ORB_LABEL } from "./orb";
import { Waveform } from "./waveform";
import { Composer } from "./composer";
import { ChatThread } from "./chat-thread";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EXAMPLES = ["Quiero pedir una pizza", "Busca hamburguesas", "Repite mi último pedido", "¿Dónde está mi pedido?", "Quiero algo por menos de 15 €"];

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export function VoiceHero({ firstName }: { firstName: string }) {
  const orb = useCortana((s) => s.orb);
  const voiceActive = useCortana((s) => s.voiceActive);
  const mode = useCortana((s) => s.mode);
  const messages = useCortana((s) => s.messages);
  const interim = useCortana((s) => s.interim);
  const cartCount = useCortana((s) => s.cart?.itemCount ?? 0);
  const set = useCortana((s) => s.set);
  const { toggleVoice, send, startVoice } = useCortanaActions();
  const [size, setSize] = useState(260);
  const params = useSearchParams();

  useEffect(() => {
    const update = () => setSize(window.innerWidth < 380 ? 200 : window.innerWidth < 640 ? 230 : window.innerWidth < 1280 ? 270 : 300);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (params.get("voice") === "1") void startVoice();
  }, [params, startVoice]);

  const hasConversation = messages.length > 0;
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center">
      {/* Saludo */}
      <AnimatePresence mode="wait">
        {!hasConversation && (
          <motion.div key="hello" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 text-center sm:mt-8">
            <p className="text-sm text-muted">
              {greeting()}, {firstName}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Hola, <span className="text-gradient">¿qué quieres pedir?</span>
            </h1>
            <p className="mt-2 text-sm uppercase tracking-[0.3em] text-muted">Habla con CORTANA</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orbe */}
      <div className={cn("relative flex flex-col items-center transition-all duration-500", hasConversation ? "mt-2" : "mt-6 sm:mt-10")}>
        <CortanaOrb state={orb} size={hasConversation ? Math.round(size * 0.72) : size} onClick={toggleVoice} label={voiceActive ? "Detener o interrumpir a CORTANA" : "Hablar con CORTANA"} />
        <div className="mt-4 flex h-12 flex-col items-center justify-center gap-1">
          {(orb === "LISTENING" || orb === "SPEAKING") && <Waveform state={orb} bars={24} />}
          <motion.p key={orb} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("text-sm", orb === "ERROR" ? "text-danger" : orb === "SUCCESS" ? "text-success" : "text-muted")}>
            {ORB_LABEL[orb]}
          </motion.p>
        </div>
      </div>

      {/* Transcripción en tiempo real */}
      <div className="min-h-8 w-full text-center">
        {interim && <p className="mx-auto max-w-xl text-lg font-medium text-ink/90">“{interim}…”</p>}
        {!interim && !hasConversation && lastReply && <p className="text-muted">{lastReply.content}</p>}
      </div>

      {/* Conversación */}
      {hasConversation && (
        <div className="mt-2 w-full">
          <ChatThread limit={6} />
          <div className="mt-2 text-center">
            <Link href="/conversacion" className="text-xs text-muted hover:text-cyan">
              Ver conversación completa →
            </Link>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className={cn("z-10 mt-6 w-full space-y-3", hasConversation && "sticky bottom-20 -mx-2 bg-gradient-to-t from-bg via-bg/95 to-transparent px-2 pb-4 pt-6 lg:bottom-0")}>
        {mode === "text" ? (
          <Composer autoFocus />
        ) : (
          <Button
            size="lg"
            variant={voiceActive ? "danger" : "primary"}
            className="h-16 w-full text-base font-semibold tracking-wide"
            onClick={toggleVoice}
          >
            {voiceActive ? (
              <>
                <Square className="!size-5" /> {orb === "SPEAKING" ? "Interrumpir" : "Detener"}
              </>
            ) : (
              <>
                <Mic className="!size-5" /> HABLAR CON CORTANA
              </>
            )}
          </Button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => set({ mode: mode === "text" ? "voice" : "text" })}>
            {mode === "text" ? <Mic /> : <Keyboard />} {mode === "text" ? "Voz" : "Escribir"}
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/pedidos">
              <Package /> Pedidos
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/carrito">
              <ShoppingCart /> Carrito{cartCount ? ` (${cartCount})` : ""}
            </Link>
          </Button>
        </div>
      </div>

      {/* Ejemplos */}
      {!hasConversation && (
        <div className="mt-8 w-full">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] text-muted">
            <Sparkles className="size-3.5 text-cyan" /> Prueba a decir
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => void send(e, "ui")}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-ink/90 transition hover:border-electric/40 hover:bg-electric/10"
              >
                “{e}”
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
