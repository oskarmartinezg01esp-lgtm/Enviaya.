"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OrbState } from "@/components/cortana/orb";
import type { AssistantUI } from "@/lib/ai/local-engine";
import type { CartView } from "@/lib/services/cart";
import type { MicPermission } from "@/lib/ai/voice-session";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  ui?: AssistantUI;
  source?: "voice" | "text" | "ui";
};

type CortanaState = {
  orb: OrbState;
  mode: "voice" | "text";
  voiceActive: boolean;
  voiceEngine: "browser" | "realtime" | null;
  busy: boolean;
  interim: string;
  assistantInterim: string;
  messages: ChatMessage[];
  conversationId: string | null;
  cart: CartView | null;
  lastUI: AssistantUI | null;
  awaitingConfirmation: boolean;
  micPermission: MicPermission;
  micDialog: "closed" | "explain" | "denied" | "unsupported";
  unread: number;
  set: (patch: Partial<CortanaState>) => void;
  addMessage: (m: Omit<ChatMessage, "id" | "at">) => void;
  reset: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useCortana = create<CortanaState>()(
  persist(
    (set) => ({
      orb: "IDLE",
      mode: "voice",
      voiceActive: false,
      voiceEngine: null,
      busy: false,
      interim: "",
      assistantInterim: "",
      messages: [],
      conversationId: null,
      cart: null,
      lastUI: null,
      awaitingConfirmation: false,
      micPermission: "unknown",
      micDialog: "closed",
      unread: 0,
      set: (patch) => set(patch),
      addMessage: (m) => set((s) => ({ messages: [...s.messages.slice(-80), { ...m, id: uid(), at: Date.now() }] })),
      reset: () => set({ messages: [], conversationId: null, lastUI: null, awaitingConfirmation: false, interim: "", assistantInterim: "" }),
    }),
    {
      name: "cortana-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ messages: s.messages.slice(-40), conversationId: s.conversationId, mode: s.mode }),
    },
  ),
);
