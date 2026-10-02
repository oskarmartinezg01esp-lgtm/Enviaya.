"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCortana } from "@/lib/stores/cortana-store";
import type { AssistantResponse } from "@/lib/ai/assistant";
import type { CartView } from "@/lib/services/cart";
import {
  BrowserVoiceSession,
  RealtimeVoiceSession,
  browserSpeechSupported,
  queryMicPermission,
  requestMicStream,
  speakOnce,
} from "@/lib/ai/voice-session";
import { api } from "@/lib/client/api";

export type VoiceSettings = { lang: string; rate: number; autoSpeak: boolean };

type Ctx = {
  send: (text: string, source?: "voice" | "text" | "ui") => Promise<void>;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  toggleVoice: () => void;
  interrupt: () => void;
  grantMic: () => Promise<void>;
  newConversation: () => void;
  refreshCart: () => Promise<void>;
  setCart: (c: CartView) => void;
};

const CortanaContext = createContext<Ctx | null>(null);

export function useCortanaActions() {
  const ctx = useContext(CortanaContext);
  if (!ctx) throw new Error("useCortanaActions debe usarse dentro de <CortanaProvider>");
  return ctx;
}

export function CortanaProvider({ children, settings, initialCart }: { children: React.ReactNode; settings: VoiceSettings; initialCart: CartView }) {
  const router = useRouter();
  const store = useCortana;
  const browserRef = useRef<BrowserVoiceSession | null>(null);
  const realtimeRef = useRef<RealtimeVoiceSession | null>(null);
  const voiceSessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<{ role: "user" | "assistant"; text: string }[]>([]);
  const lastUserTextRef = useRef("");
  const orbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    store.getState().set({ cart: initialCart });
  }, [initialCart, store]);

  // Estado de red -> orbe OFFLINE
  useEffect(() => {
    const update = () => {
      const s = store.getState();
      if (!navigator.onLine) s.set({ orb: "OFFLINE" });
      else if (s.orb === "OFFLINE") s.set({ orb: "IDLE" });
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [store]);

  const restingOrb = useCallback(() => {
    const s = store.getState();
    if (s.awaitingConfirmation) return "CONFIRMING" as const;
    if (s.voiceActive && s.voiceEngine === "realtime") return "LISTENING" as const;
    return "IDLE" as const;
  }, [store]);

  const flashOrb = useCallback(
    (orb: "SUCCESS" | "ERROR", then?: () => void) => {
      store.getState().set({ orb });
      if (orbTimer.current) clearTimeout(orbTimer.current);
      orbTimer.current = setTimeout(() => {
        store.getState().set({ orb: restingOrb() });
        then?.();
      }, 2600);
    },
    [store, restingOrb],
  );

  const refreshCart = useCallback(async () => {
    const cart = await api<CartView>("/api/cart");
    store.getState().set({ cart });
  }, [store]);

  /** Envía un mensaje al motor de CORTANA (texto, voz del navegador o botones). */
  const send = useCallback(
    async (text: string, source: "voice" | "text" | "ui" = "text") => {
      const s = store.getState();
      const clean = text.trim();
      if (!clean) return;
      if (s.voiceEngine === "realtime" && realtimeRef.current) {
        s.addMessage({ role: "user", content: clean, source });
        lastUserTextRef.current = clean;
        transcriptRef.current.push({ role: "user", text: clean });
        realtimeRef.current.sendText(clean);
        return;
      }
      browserRef.current?.cancelSpeech();
      s.addMessage({ role: "user", content: clean, source });
      s.set({ busy: true, orb: "THINKING", interim: "" });
      try {
        const res = await api<AssistantResponse>("/api/ai/chat", {
          method: "POST",
          body: { text: clean, conversationId: s.conversationId, source },
        });
        const st = store.getState();
        st.addMessage({ role: "assistant", content: res.reply, ui: res.ui });
        st.set({
          conversationId: res.conversationId,
          cart: res.cart,
          lastUI: res.ui,
          awaitingConfirmation: Boolean(res.ui.awaitingConfirmation),
          busy: false,
        });
        if (res.ui.orb === "SUCCESS" || res.ui.order) router.refresh();

        const shouldSpeak = st.voiceActive || (st.mode === "voice" && settings.autoSpeak && source !== "text");
        const afterSpeech = () => {
          const cur = store.getState();
          if (res.ui.orb === "SUCCESS" || res.ui.orb === "ERROR") flashOrb(res.ui.orb);
          else cur.set({ orb: restingOrb() });
          // Conversación manos libres: si CORTANA pregunta, vuelve a escuchar
          if (cur.voiceActive && browserRef.current && res.ui.orb !== "SUCCESS") {
            if (/\?\s*$/.test(res.reply) || cur.awaitingConfirmation) {
              cur.set({ orb: "LISTENING" });
              browserRef.current.startListening();
            } else {
              cur.set({ orb: "IDLE", voiceActive: false });
              browserRef.current.destroy();
              browserRef.current = null;
            }
          }
          if (res.ui.orb === "SUCCESS" && browserRef.current) {
            browserRef.current.destroy();
            browserRef.current = null;
            store.getState().set({ voiceActive: false, voiceEngine: null });
          }
        };
        if (shouldSpeak) {
          st.set({ orb: res.ui.orb === "SUCCESS" ? "SUCCESS" : "SPEAKING" });
          if (browserRef.current) await browserRef.current.speak(res.reply);
          else await speakOnce(res.reply, settings.lang, settings.rate);
        }
        afterSpeech();
      } catch (err) {
        store.getState().set({ busy: false });
        store.getState().addMessage({ role: "assistant", content: "No he podido completar la acción. Inténtalo de nuevo." });
        flashOrb("ERROR");
        toast.error((err as Error).message);
      }
    },
    [store, router, settings, flashOrb, restingOrb],
  );

  const endRealtime = useCallback(() => {
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    const id = voiceSessionIdRef.current;
    if (id) {
      void api(`/api/voice/session/${id}`, { method: "PATCH", body: { transcript: transcriptRef.current } }).catch(() => {});
      voiceSessionIdRef.current = null;
    }
    transcriptRef.current = [];
  }, []);

  const stopVoice = useCallback(() => {
    browserRef.current?.destroy();
    browserRef.current = null;
    endRealtime();
    store.getState().set({ voiceActive: false, voiceEngine: null, interim: "", assistantInterim: "", orb: restingOrb() === "LISTENING" ? "IDLE" : restingOrb() });
  }, [store, endRealtime, restingOrb]);

  const launchVoice = useCallback(
    async (stream: MediaStream) => {
      const s = store.getState();
      s.set({ micPermission: "granted", micDialog: "closed", mode: "voice" });
      // 1) Intento con Realtime (si el servidor lo ofrece)
      try {
        const session = await api<{ mode: "realtime" | "browser"; voiceSessionId: string; conversationId: string; clientSecret?: string; callsUrl?: string; model?: string }>(
          "/api/voice/session",
          { method: "POST", body: { conversationId: s.conversationId } },
        );
        voiceSessionIdRef.current = session.voiceSessionId;
        s.set({ conversationId: session.conversationId });
        if (session.mode === "realtime" && session.clientSecret) {
          const rt = new RealtimeVoiceSession({
            onUserSpeechStart: () => store.getState().set({ orb: "LISTENING", interim: "" }),
            onUserInterim: (t) => store.getState().set({ interim: t }),
            onUserFinal: (t) => {
              if (!t) return;
              lastUserTextRef.current = t;
              transcriptRef.current.push({ role: "user", text: t });
              store.getState().addMessage({ role: "user", content: t, source: "voice" });
              store.getState().set({ interim: "" });
            },
            onThinking: () => store.getState().set({ orb: "THINKING" }),
            onAssistantInterim: (t) => store.getState().set({ assistantInterim: t }),
            onAssistantFinal: (t) => {
              if (!t) return;
              transcriptRef.current.push({ role: "assistant", text: t });
              store.getState().addMessage({ role: "assistant", content: t });
              store.getState().set({ assistantInterim: "" });
            },
            onSpeaking: (on) => {
              const cur = store.getState();
              if (cur.orb === "SUCCESS" || cur.orb === "ERROR") return;
              cur.set({ orb: on ? "SPEAKING" : restingOrb() });
            },
            onToolCall: async (name, args) => {
              store.getState().set({ orb: name === "confirmOrder" ? "PROCESSING" : "THINKING" });
              const r = await api<{ result: { ok: boolean }; cart: CartView; awaitingConfirmation: boolean }>("/api/ai/tool", {
                method: "POST",
                body: { name, args, conversationId: store.getState().conversationId, userText: lastUserTextRef.current },
              });
              store.getState().set({ cart: r.cart, awaitingConfirmation: r.awaitingConfirmation });
              if (name === "confirmOrder") {
                if (r.result.ok) {
                  flashOrb("SUCCESS");
                  router.refresh();
                } else flashOrb("ERROR");
              }
              return r.result;
            },
            onError: (m) => toast.error(m),
            onClosed: () => stopVoice(),
          });
          await rt.connect({ clientSecret: session.clientSecret, callsUrl: session.callsUrl!, model: session.model! }, stream);
          realtimeRef.current = rt;
          store.getState().set({ voiceActive: true, voiceEngine: "realtime", orb: "LISTENING" });
          return;
        }
      } catch (err) {
        console.warn("Realtime no disponible, usando voz del navegador", err);
      }
      // 2) Voz del navegador
      if (!browserSpeechSupported()) {
        stream.getTracks().forEach((t) => t.stop());
        store.getState().set({ micDialog: "unsupported", mode: "text" });
        return;
      }
      const bv = new BrowserVoiceSession(
        {
          onInterim: (t) => store.getState().set({ interim: t, orb: "LISTENING" }),
          onFinal: (t) => {
            store.getState().set({ interim: "" });
            void send(t, "voice");
          },
          onBargeIn: () => store.getState().set({ orb: "LISTENING" }),
          onError: (code) => {
            if (code === "not-allowed") store.getState().set({ micDialog: "denied", micPermission: "denied" });
            else if (code === "network") toast.error("El reconocimiento de voz necesita conexión a internet.");
          },
          onListeningChange: () => {},
        },
        { lang: settings.lang, rate: settings.rate },
      );
      await bv.init(stream);
      browserRef.current = bv;
      store.getState().set({ voiceActive: true, voiceEngine: "browser", orb: "LISTENING", interim: "" });
      bv.startListening();
    },
    [store, settings, send, flashOrb, restingOrb, router, stopVoice],
  );

  const grantMic = useCallback(async () => {
    try {
      const stream = await requestMicStream();
      await launchVoice(stream);
    } catch {
      store.getState().set({ micPermission: "denied", micDialog: "denied" });
    }
  }, [launchVoice, store]);

  const startVoice = useCallback(async () => {
    const s = store.getState();
    if (s.voiceActive) return;
    if (!navigator.onLine) {
      toast.error("Sin conexión. Puedes intentarlo cuando vuelvas a estar en línea.");
      return;
    }
    const perm = await queryMicPermission();
    s.set({ micPermission: perm });
    if (perm === "unsupported") return s.set({ micDialog: "unsupported" });
    if (perm === "denied") return s.set({ micDialog: "denied" });
    if (perm === "granted") return grantMic();
    // Primera vez: explicamos antes de pedir el permiso del navegador
    if (!localStorage.getItem("cortana-mic-explained")) {
      localStorage.setItem("cortana-mic-explained", "1");
      return s.set({ micDialog: "explain" });
    }
    return grantMic();
  }, [store, grantMic]);

  const interrupt = useCallback(() => {
    if (realtimeRef.current) {
      realtimeRef.current.interrupt();
      return;
    }
    if (browserRef.current?.isSpeaking) {
      browserRef.current.cancelSpeech();
      store.getState().set({ orb: "LISTENING" });
      browserRef.current.startListening();
    }
  }, [store]);

  const toggleVoice = useCallback(() => {
    const s = store.getState();
    if (s.orb === "SPEAKING") return interrupt();
    if (s.voiceActive) return stopVoice();
    void startVoice();
  }, [store, interrupt, stopVoice, startVoice]);

  const newConversation = useCallback(() => {
    stopVoice();
    store.getState().reset();
  }, [stopVoice, store]);

  // Atajo: espacio para hablar (escritorio), Escape para parar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") stopVoice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stopVoice]);

  useEffect(() => () => stopVoice(), [stopVoice]);

  const value = useMemo<Ctx>(
    () => ({ send, startVoice, stopVoice, toggleVoice, interrupt, grantMic, newConversation, refreshCart, setCart: (c) => store.getState().set({ cart: c }) }),
    [send, startVoice, stopVoice, toggleVoice, interrupt, grantMic, newConversation, refreshCart, store],
  );

  return <CortanaContext.Provider value={value}>{children}</CortanaContext.Provider>;
}

