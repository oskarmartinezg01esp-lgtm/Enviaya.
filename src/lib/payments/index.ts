import type { ChargeInput, ChargeResult, PaymentProvider } from "./provider";
import { stripeProvider } from "./stripe";

/** Proveedor de demostración: aprueba los cargos sin mover dinero. */
const demoProvider: PaymentProvider = {
  name: "demo",
  async charge(input: ChargeInput): Promise<ChargeResult> {
    return { status: "SUCCEEDED", providerRef: `demo_${input.orderId}`, provider: "demo" };
  },
};

/** Pago en efectivo / a la entrega: queda pendiente hasta la entrega. */
const cashProvider: PaymentProvider = {
  name: "cash",
  async charge(): Promise<ChargeResult> {
    return { status: "PENDING", providerRef: null, provider: "cash" };
  },
};

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function resolveProvider(method: ChargeInput["method"]): PaymentProvider {
  if (method.type === "CASH") return cashProvider;
  if (stripeEnabled() && method.provider === "stripe" && method.providerRef?.startsWith("pm_")) return stripeProvider;
  return demoProvider;
}

export type { ChargeInput, ChargeResult, PaymentProvider };
