import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/payments/stripe";
import { audit } from "@/lib/services/audit";

/** Webhook de Stripe: sincroniza el estado de los pagos. Firma verificada con STRIPE_WEBHOOK_SECRET. */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 501 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: { id: string } } };
  const map: Record<string, "SUCCEEDED" | "FAILED" | "REFUNDED"> = {
    "payment_intent.succeeded": "SUCCEEDED",
    "payment_intent.payment_failed": "FAILED",
    "charge.refunded": "REFUNDED",
  };
  const status = map[event.type];
  if (status) {
    await db.payment.updateMany({ where: { providerRef: event.data.object.id }, data: { status } });
    await audit({ action: `stripe.${event.type}`, entity: "Payment", entityId: event.data.object.id });
  }
  return NextResponse.json({ received: true });
}
