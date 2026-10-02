import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChargeInput, ChargeResult, PaymentProvider } from "./provider";

/**
 * Integración con Stripe mediante su API REST (sin SDK para mantener el bundle ligero).
 * Requiere STRIPE_SECRET_KEY. Los métodos de pago se guardan como `pm_...` (tokenizados por Stripe.js).
 */
const API = "https://api.stripe.com/v1";

async function stripeRequest<T>(path: string, body: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Error de Stripe");
  return json as T;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!input.method.providerRef) {
      return { status: "FAILED", providerRef: null, provider: "stripe", message: "Método de pago sin token" };
    }
    try {
      const pi = await stripeRequest<{ id: string; status: string }>(
        "/payment_intents",
        {
          amount: String(input.amountCents),
          currency: input.currency.toLowerCase(),
          payment_method: input.method.providerRef,
          confirm: "true",
          off_session: "true",
          receipt_email: input.customerEmail,
          "metadata[orderId]": input.orderId,
        },
        `order_${input.orderId}`,
      );
      const status =
        pi.status === "succeeded" ? "SUCCEEDED" : pi.status === "requires_action" ? "REQUIRES_CONFIRMATION" : "PENDING";
      return { status, providerRef: pi.id, provider: "stripe" };
    } catch (err) {
      return { status: "FAILED", providerRef: null, provider: "stripe", message: (err as Error).message };
    }
  },
  async refund(providerRef, amountCents) {
    await stripeRequest("/refunds", { payment_intent: providerRef, amount: String(amountCents) });
    return { ok: true };
  },
};

export async function createSetupIntent(customerId?: string) {
  return stripeRequest<{ id: string; client_secret: string }>("/setup_intents", {
    usage: "off_session",
    ...(customerId ? { customer: customerId } : {}),
  });
}

/** Verifica la firma `Stripe-Signature` de un webhook (esquema v1, HMAC-SHA256). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
