/**
 * Abstracción de proveedores de pago. CORTANA nunca maneja números de tarjeta:
 * solo referencias tokenizadas (p. ej. `pm_...` de Stripe).
 */
export type ChargeInput = {
  orderId: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  method: { type: "CARD" | "APPLE_PAY" | "GOOGLE_PAY" | "CASH"; providerRef: string | null; provider: string };
};

export type ChargeResult = {
  status: "SUCCEEDED" | "PENDING" | "REQUIRES_CONFIRMATION" | "FAILED";
  providerRef: string | null;
  provider: string;
  message?: string;
};

export interface PaymentProvider {
  name: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
  refund?(providerRef: string, amountCents: number): Promise<{ ok: boolean }>;
}
