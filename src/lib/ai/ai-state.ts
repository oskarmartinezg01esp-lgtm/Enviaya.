/** Estado conversacional persistido en Conversation.state */
export type PendingAction =
  | { type: "confirm_order"; orderId: string; totalCents: number; expiresAt: number }
  | { type: "confirm_cancel"; orderId: string; orderNumber: number; expiresAt: number }
  | {
      type: "choose_product";
      candidateIds: string[];
      suggestedId?: string;
      quantity: number;
      variantHint: string | null;
      remove: string[];
      extra: string[];
      purpose: "add" | "remove" | "price" | "view";
      /** Mensajes restantes a añadir tras resolver (p.ej. sub-ítems con modificadores) */
      split?: { quantity: number; remove: string[]; extra: string[] }[];
    }
  | { type: "upsell_drink" }
  | { type: "choose_address" };

export type ConversationState = {
  pending?: PendingAction | null;
  lastProductId?: string | null;
  lastSearchIds?: string[];
  lastOrderId?: string | null;
  upsellDone?: boolean;
  turns?: number;
};

export const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export function parseState(raw: unknown): ConversationState {
  if (!raw || typeof raw !== "object") return {};
  return raw as ConversationState;
}
