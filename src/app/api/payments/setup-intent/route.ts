import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { stripeEnabled } from "@/lib/payments";
import { createSetupIntent } from "@/lib/payments/stripe";

/** SetupIntent de Stripe para tokenizar tarjetas en el cliente con Stripe Elements. */
export const POST = apiRoute(async () => {
  await apiUser();
  if (!stripeEnabled()) throw new AppError("UNAVAILABLE", "Stripe no está configurado (modo demostración).");
  const si = await createSetupIntent();
  return { clientSecret: si.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY };
});
