import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { removePaymentMethod, setDefaultPaymentMethod } from "@/lib/services/payment-methods";

type P = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<P>(async (_req, { params }) => {
  await setDefaultPaymentMethod((await apiUser()).id, (await params).id);
  return { ok: true };
});
export const DELETE = apiRoute<P>(async (_req, { params }) => {
  await removePaymentMethod((await apiUser()).id, (await params).id);
  return { ok: true };
});
